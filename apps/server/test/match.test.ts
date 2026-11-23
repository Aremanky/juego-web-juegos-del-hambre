import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ActorView, LobbyState, MatchEventDTO, MatchFrame, MatchSnapshot } from '@ceniza/shared';
import { routeEndTime } from '@ceniza/engine';
import { matchEvents, matchParticipants, matches } from '../src/db/schema';
import { api, character, connect, register, resetDatabase, sleep, startServer, type Client, type TestServer, type TestUser } from './helpers';

const TIMINGS = { lobbyCountdownMs: 300, presentationMs: 400, countdownMs: 400, snapshotMs: 1000 };

let srv: TestServer;
let host: TestUser;
let guest: TestUser;
let third: TestUser;
let H: Client;
let G: Client;
let code: string;
let roomId: string;

interface Mirror {
  snap: MatchSnapshot | null;
  actors: Map<string, ActorView>;
  phase: MatchFrame['phase'] | null;
  paused: MatchFrame['paused'];
  vote: MatchFrame['vote'];
  winnerId: string | null;
  snapshots: number;
  events: MatchEventDTO[];
  wait(pred: (m: Mirror) => boolean, ms?: number): Promise<Mirror>;
}

/** Réplica de lo que pinta el cliente: instantánea + fotogramas incrementales. */
function mirror(c: Client): Mirror {
  const m: Mirror = {
    snap: null,
    actors: new Map(),
    phase: null,
    paused: null,
    vote: null,
    winnerId: null,
    snapshots: 0,
    events: [],
    async wait(pred, ms = 6000) {
      const end = Date.now() + ms;
      while (!pred(m)) {
        if (Date.now() > end) throw new Error('timeout esperando la partida');
        await sleep(25);
      }
      return m;
    },
  };
  c.socket.on('match:snapshot', (s: MatchSnapshot) => {
    m.snap = s;
    m.snapshots++;
    m.actors = new Map(s.actors.map((a) => [a.id, a]));
    Object.assign(m, { phase: s.phase, paused: s.paused, vote: s.vote, winnerId: s.winnerId });
  });
  c.socket.on('match:frame', (f: MatchFrame) => {
    for (const a of f.actors) m.actors.set(a.id, a);
    Object.assign(m, { phase: f.phase, paused: f.paused, vote: f.vote, winnerId: f.winnerId });
  });
  c.socket.on('match:event', (e: MatchEventDTO) => m.events.push(e));
  return m;
}

async function createRoom(user: TestUser, name: string, config: Record<string, unknown> = {}) {
  const r = await api(srv.url, '/api/rooms', { body: { name, config: { mapSize: 'pequeno', ...config } }, cookie: user.cookie });
  expect(r.status).toBe(201);
  return r.body.room.code as string;
}

const world = () => srv.ctx.roomManager.get(roomId)!.match!.world;
const actorOf = (userId: string) => world().actors.find((a) => a.userId === userId)!;

beforeAll(async () => {
  await resetDatabase();
  srv = await startServer({ matchTimings: TIMINGS });
  host = await register(srv.url, 'anfitriona');
  guest = await register(srv.url, 'invitado');
  third = await register(srv.url, 'tardon');
  code = await createRoom(host, 'Arena de la fase 4');
});

afterAll(async () => {
  H?.close();
  G?.close();
  await srv.close();
});

describe('partida en tiempo real', () => {
  let MH: Mirror;
  let MG: Mirror;

  it('con todos preparados arranca sola: cuenta atrás de sala, presentación y en curso', async () => {
    H = await connect(srv.url, host.cookie);
    G = await connect(srv.url, guest.cookie);
    MH = mirror(H);
    MG = mirror(G);
    const j = await H.emit<LobbyState>('room:join', { code });
    roomId = j.ok ? j.data.room.id : '';
    await G.emit('room:join', { code });
    expect((await H.emit('lobby:setCharacter', { character: character({ name: 'Kael', gender: 'M', district: 3 }) })).ok).toBe(true);
    expect((await G.emit('lobby:setCharacter', { character: character({ name: 'Nara', gender: 'F', district: null }) })).ok).toBe(true);
    await H.emit('lobby:setReady', { ready: true });
    await G.emit('lobby:setReady', { ready: true });
    const counting = await H.waitFor((s) => s.start.countdownEndsAt != null);
    expect(counting.start.canStart).toBe(true);
    await H.waitFor((s) => s.room.status === 'in_game', 4000);
    await MH.wait((m) => m.snap != null);
    await MG.wait((m) => m.snap != null);
    expect(MH.snap!.map.size).toBe(64);
    expect(MH.snap!.actors).toHaveLength(2);
    expect(MH.snap!.me).toBe(MH.snap!.actors.find((a) => a.userId === host.id)!.id);
    // A quien no eligió plaza se le asigna una libre de su género.
    expect(MG.snap!.actors.find((a) => a.userId === guest.id)!.district).toBeGreaterThan(0);
    expect(MH.snap!.phase).toBe('presentacion');
    await MH.wait((m) => m.phase === 'en_curso', 4000);
    expect(MH.events.map((e) => e.text)).toContain('¡Que empiecen los Juegos!');
  });

  it('no deja entrar a nadie más con la partida empezada', async () => {
    const T = await connect(srv.url, third.cookie);
    const r = await T.emit('room:join', { code });
    T.close();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(/ya ha empezado/);
  });

  it('mover: el servidor valida, el rival ve el paso en curso y la llegada coincide', async () => {
    const me = actorOf(host.id);
    const target = { x: me.x + 3, y: me.y + 1 };
    const bad = await H.emit('match:move', { x: 200, y: 200 });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error.message).toMatch(/fuera de la arena/);
    expect((await H.emit('match:move', target)).ok).toBe(true);
    await MG.wait((m) => !!m.actors.get(me.id)?.route);
    // El rival ve como mucho el paso actual y el siguiente; el propio jugador, la ruta entera.
    expect(MG.actors.get(me.id)!.route!.times.length).toBeLessThanOrEqual(3);
    await MH.wait((m) => !!m.actors.get(me.id)?.route && m.actors.get(me.id)!.route!.times.length >= 4);
    const end = routeEndTime(actorOf(host.id).route!);
    await MH.wait(() => world().t >= end + 100, 8000);
    expect({ x: actorOf(host.id).x, y: actorOf(host.id).y }).toEqual(target);
  });

  it('el chat de partida respeta la configuración de la sala (por defecto, solo alianzas)', async () => {
    const r = await H.emit('chat:send', { channel: 'room', body: 'hola' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(/alianza/);
  });

  it('pausa por votación (mayoría de 2 = 2) y se reanuda cuando todos pulsan «Listo»', async () => {
    expect((await H.emit('match:pause')).ok).toBe(true);
    await MG.wait((m) => m.vote != null);
    expect(MG.vote!.needed).toBe(2);
    expect(MG.paused).toBeNull();
    expect((await G.emit('match:vote', { yes: true })).ok).toBe(true);
    await MH.wait((m) => m.paused?.reason === 'votacion');
    const t = world().t;
    await sleep(400);
    expect(world().t).toBe(t);
    const moving = await H.emit('match:move', { x: 1, y: 1 });
    expect(!moving.ok && moving.error.message).toMatch(/pausa/);
    await H.emit('match:resume', { ready: true });
    await MG.wait((m) => m.paused?.ready.includes(host.id) === true);
    expect(MG.paused!.resumeAt).toBeNull();
    await G.emit('match:resume', { ready: true });
    await MH.wait((m) => m.paused?.resumeAt != null);
    await MH.wait((m) => m.paused == null, 6000);
    expect(MH.events.map((e) => e.text)).toContain('Se reanuda la partida.');
  });

  it('reconexión a mitad de partida: el piloto toma el relevo y al volver llega la instantánea entera', async () => {
    G.close();
    await MH.wait((m) => m.events.some((e) => e.kind === 'conexion' && /piloto automático/.test(e.text)));
    expect(actorOf(guest.id).control).toBe('piloto');
    G = await connect(srv.url, guest.cookie);
    MG = mirror(G);
    expect((await G.emit('room:join', { code })).ok).toBe(true);
    await MG.wait((m) => m.snap != null);
    expect(MG.snap!.me).toBe(actorOf(guest.id).id);
    expect(MG.snap!.phase).toBe('en_curso');
    expect(actorOf(guest.id).control).toBe('jugador');
    await MH.wait((m) => m.events.some((e) => e.kind === 'conexion' && /ha vuelto/.test(e.text)));
  });

  it('reinicio del servidor durante la partida: vuelve en pausa con el mismo mundo y se puede seguir', async () => {
    const before = world();
    const t = before.t;
    const seed = before.seed;
    const kael = before.actors.find((a) => a.userId === host.id)!;
    H.close();
    G.close();
    await sleep(100);
    await srv.close();
    srv = await startServer({ matchTimings: TIMINGS });
    H = await connect(srv.url, host.cookie);
    G = await connect(srv.url, guest.cookie);
    MH = mirror(H);
    MG = mirror(G);
    await H.emit('room:join', { code });
    await G.emit('room:join', { code });
    await MH.wait((m) => m.snap != null);
    expect(MH.snap!.seed).toBe(seed);
    expect(MH.snap!.paused?.reason).toBe('reinicio');
    expect(MH.snap!.clock.t).toBeGreaterThanOrEqual(t - TIMINGS.snapshotMs - 200);
    expect(MH.snap!.actors.find((a) => a.id === kael.id)!.name).toBe('Kael');
    await MH.wait((m) => (m.paused?.needed.length ?? 0) === 2);
    await H.emit('match:resume', { ready: true });
    await G.emit('match:resume', { ready: true });
    await MG.wait((m) => m.paused == null, 6000);
    const t2 = world().t;
    await sleep(300);
    expect(world().t).toBeGreaterThan(t2);
  });

  it('abandonar: la partida termina con ganador, la sala queda terminada y todo queda registrado', async () => {
    expect((await G.emit('match:forfeit')).ok).toBe(true);
    await MH.wait((m) => m.winnerId != null);
    const winner = MH.winnerId!;
    expect(MH.actors.get(winner)!.userId).toBe(host.id);
    expect(MH.actors.get(winner)!.place).toBe(1);
    expect([...MH.actors.values()].find((a) => a.userId === guest.id)!.place).toBe(2);
    expect(MH.events.map((e) => e.text).some((t) => /gana los Juegos/.test(t))).toBe(true);
    await H.waitFor((s) => s.room.status === 'finished', 4000);
    await sleep(300);
    const [row] = await srv.ctx.db.select().from(matches).where(eq(matches.roomId, roomId));
    expect(row.status).toBe('terminada');
    expect(row.winnerParticipantId).toBe(winner);
    const parts = await srv.ctx.db.select().from(matchParticipants).where(eq(matchParticipants.matchId, row.id));
    expect(parts.map((p) => p.place).sort()).toEqual([1, 2]);
    const evs = await srv.ctx.db.select().from(matchEvents).where(eq(matchEvents.matchId, row.id));
    const types = evs.map((e) => e.type);
    for (const t of ['fase', 'votacion', 'pausa', 'reanudada', 'conexion', 'eliminado', 'fin']) expect(types).toContain(t);
    // Tras terminar, los participantes pueden volver a ver el resultado.
    const again = await connect(srv.url, guest.cookie);
    const back = mirror(again);
    expect((await again.emit('room:join', { code })).ok).toBe(true);
    await back.wait((m) => m.snap?.phase === 'terminada');
    again.close();
  });
});

describe('inicio forzado por el anfitrión', () => {
  it('solo el anfitrión puede forzar y no hace falta que todos estén preparados', async () => {
    const code2 = await createRoom(host, 'Arena forzada', { autoStart: false });
    const A = await connect(srv.url, host.cookie);
    const B = await connect(srv.url, guest.cookie);
    const MA = mirror(A);
    await A.emit('room:join', { code: code2 });
    await B.emit('room:join', { code: code2 });
    await A.emit('lobby:setCharacter', { character: character({ name: 'Iria', gender: 'F', district: null }) });
    await B.emit('lobby:setCharacter', { character: character({ name: 'Bruno', gender: 'M', district: null }) });
    const st = await B.waitFor((s) => s.participants.length === 2 && s.participants.every((p) => p.buildValid));
    expect(st.start.canForce).toBe(false);
    expect((await A.waitFor((s) => s.start.canForce)).start.canStart).toBe(false);
    const denied = await B.emit('lobby:forceStart');
    expect(!denied.ok && denied.error.message).toMatch(/anfitri/i);
    expect((await A.emit('lobby:forceStart')).ok).toBe(true);
    await MA.wait((m) => m.snap != null);
    expect(MA.snap!.actors.every((a) => a.district >= 1 && a.district <= 12)).toBe(true);
    A.close();
    B.close();
  });
});
