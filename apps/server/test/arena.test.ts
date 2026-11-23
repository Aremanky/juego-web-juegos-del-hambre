import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LobbyState, MatchEventDTO, MatchSnapshot } from '@ceniza/shared';
import { positionAt } from '@ceniza/engine';
import { api, character, connect, register, resetDatabase, sleep, startServer, type Client, type TestServer, type TestUser } from './helpers';

const TIMINGS = { lobbyCountdownMs: 300, presentationMs: 300, countdownMs: 300, snapshotMs: 10_000, dayMs: 4_000, nightMs: 2_000 };

let srv: TestServer;
let ana: TestUser;
let beto: TestUser;
let A: Client;
let B: Client;
let roomId = '';
const snaps = new Map<string, MatchSnapshot>();
const events = new Map<string, MatchEventDTO[]>();

beforeAll(async () => {
  await resetDatabase();
  srv = await startServer({ matchTimings: TIMINGS });
  ana = await register(srv.url, 'ana');
  beto = await register(srv.url, 'beto');
  A = await connect(srv.url, ana.cookie);
  B = await connect(srv.url, beto.cookie);
  for (const [name, c] of [['ana', A], ['beto', B]] as const) {
    events.set(name, []);
    c.socket.on('match:snapshot', (s: MatchSnapshot) => snaps.set(name, s));
    c.socket.on('match:event', (e: MatchEventDTO) => events.get(name)!.push(e));
  }
});

afterAll(async () => {
  A?.close();
  B?.close();
  await srv?.close();
});

describe('arena de la fase 7 con bots de la fase 6', () => {
  it('la instantánea trae relieve, puntos de interés y el ciclo de día y noche', async () => {
    const r = await api(srv.url, '/api/rooms', { body: { name: 'Arena viva', config: { mapSize: 'mediano', visibility: 'niebla' } }, cookie: ana.cookie });
    const code = r.body.room.code as string;
    const j = await A.emit<LobbyState>('room:join', { code });
    roomId = j.ok ? j.data.room.id : '';
    await B.emit('room:join', { code });
    for (let i = 0; i < 3; i++) {
      expect((await A.emit('lobby:addBot', { cid: `bot-${i}-xxxxxxxx` })).ok).toBe(true);
      await sleep(250); // enfriamiento contra el doble clic
    }
    await A.emit('lobby:setCharacter', { character: character({ name: 'Ana', gender: 'F', district: 2 }) });
    await B.emit('lobby:setCharacter', { character: character({ name: 'Beto', gender: 'M', district: 3 }) });
    await A.emit('lobby:setReady', { ready: true });
    await B.emit('lobby:setReady', { ready: true });
    const end = Date.now() + 8000;
    while (!snaps.get('ana') || srv.ctx.roomManager.get(roomId)?.match?.world.phase !== 'en_curso') {
      if (Date.now() > end) throw new Error('la partida no empieza');
      await sleep(50);
    }
    const s = snaps.get('ana')!;
    expect(s.map.heights!.length).toBeGreaterThan(1000);
    expect(s.map.pois!.length).toBeGreaterThanOrEqual(6);
    expect(s.map.pois![0].kind).toBe('obelisco');
    expect(s.day).toEqual({ dayMs: 4_000, nightMs: 2_000, startAt: 600 });
  });

  it('los bots se mueven solos con la IA del servidor', async () => {
    const w = srv.ctx.roomManager.get(roomId)!.match!.world;
    const bots = w.actors.filter((a) => a.kind === 'bot');
    expect(bots).toHaveLength(3);
    const before = bots.map((b) => positionAt(b, w.t));
    await sleep(5000);
    const moved = bots.filter((b, i) => Math.hypot(positionAt(b, w.t).x - before[i].x, positionAt(b, w.t).y - before[i].y) > 1);
    expect(moved.length).toBeGreaterThanOrEqual(2);
    for (const b of bots) expect(b.mind?.action).toBeTruthy();
  });

  it('descubrir una región solo se le cuenta a quien llega; la noche, a todos', async () => {
    const w = srv.ctx.roomManager.get(roomId)!.match!.world;
    const me = w.actors.find((a) => a.userId === ana.id)!;
    const poi = w.map.pois.find((p) => p.id !== 0 && !(me.explored & (1 << p.id)))!;
    me.x = poi.x;
    me.y = poi.y;
    me.route = null;
    const end = Date.now() + 4000;
    while (!events.get('ana')!.some((e) => e.kind === 'descubre')) {
      if (Date.now() > end) throw new Error('no llega el aviso de región');
      await sleep(50);
    }
    expect(events.get('ana')!.find((e) => e.kind === 'descubre')!.text).toBe(`Has llegado a ${poi.name}.`);
    expect(events.get('beto')!.some((e) => e.kind === 'descubre' && e.text.includes(poi.name))).toBe(false);
    const night = Date.now() + 8000;
    while (!events.get('beto')!.some((e) => e.kind === 'anochece')) {
      if (Date.now() > night) throw new Error('no anochece');
      await sleep(100);
    }
    expect(events.get('ana')!.some((e) => e.kind === 'anochece')).toBe(true);
  });
});
