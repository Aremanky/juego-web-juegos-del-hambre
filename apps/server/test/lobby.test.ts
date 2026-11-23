import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { summarizeBuild, type LobbyState } from '@ceniza/shared';
import { api, character, connect, cookieFrom, register, resetDatabase, sleep, startServer, type Client, type TestServer, type TestUser } from './helpers';

let srv: TestServer;
let host: TestUser;
let guest: TestUser;
let third: TestUser;
let code: string;
let H: Client;
let G: Client;

const me = (s: LobbyState) => s.participants.find((p) => p.id === s.me.participantId)!;
const bots = (s: LobbyState) => s.participants.filter((p) => p.kind === 'bot');

async function createRoom(user: TestUser, name: string, config: Record<string, unknown> = {}) {
  const r = await api(srv.url, '/api/rooms', { body: { name, config }, cookie: user.cookie });
  expect(r.status).toBe(201);
  return r.body.room.code as string;
}

beforeAll(async () => {
  await resetDatabase();
  srv = await startServer();
  host = await register(srv.url, 'anfitrion');
  guest = await register(srv.url, 'invitada');
  third = await register(srv.url, 'tercero');
  // La invitada tiene una plantilla guardada: debe aplicarse sola al entrar.
  await api(srv.url, '/api/characters', { body: { data: character({ name: 'Nara', gender: 'F', district: 7 }) }, cookie: guest.cookie });
  code = await createRoom(host, 'Arena de pruebas', { botsMaxTotal: 5, botsMaxPerUser: 3, maxParticipants: 10 });
});

afterAll(async () => {
  H?.close();
  G?.close();
  await srv.close();
});

describe('lobby en tiempo real', () => {
  it('rechaza sockets sin sesión', async () => {
    await expect(connect(srv.url, 'ceniza_sid=falso')).rejects.toThrow();
  });

  it('dos jugadores se unen y ambos ven la misma sala', async () => {
    H = await connect(srv.url, host.cookie);
    G = await connect(srv.url, guest.cookie);
    const j1 = await H.emit<LobbyState>('room:join', { code: code.toLowerCase() });
    expect(j1.ok).toBe(true);
    const j2 = await G.emit<LobbyState>('room:join', { code });
    expect(j2.ok).toBe(true);
    const sH = await H.waitFor((s) => s.participants.length === 2 && s.participants.every((p) => p.online));
    expect(sH.me.isHost).toBe(true);
    const sG = await G.waitFor((s) => s.participants.length === 2);
    expect(sG.me.isHost).toBe(false);
    expect(sG.room.code).toBe(code);
  });

  it('aplica la última plantilla al entrar y oculta la build a los demás humanos', async () => {
    const sG = await G.waitFor((s) => !!me(s)?.character);
    expect(me(sG).character!.name).toBe('Nara');
    expect(me(sG).slot).toEqual({ district: 7, gender: 'F' });
    const sH = H.last();
    const naraForHost = sH.participants.find((p) => p.userId === guest.id)!;
    expect(naraForHost.character).toBeNull(); // build privada
    expect(naraForHost.publicCharacter?.name).toBe('Nara');
  });

  it('las plazas de distrito son únicas aunque se pidan a la vez', async () => {
    const set = await H.emit('lobby:setCharacter', { character: character({ name: 'Torvo', gender: 'F', district: null }) });
    expect(set.ok).toBe(true);
    await H.waitFor((s) => me(s).character?.name === 'Torvo');
    // ambas quieren el distrito 3 femenino al mismo tiempo
    const [a, b] = await Promise.all([H.emit('lobby:setSlot', { district: 3 }), G.emit('lobby:setSlot', { district: 3 })]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    const loser = a.ok ? b : a;
    expect(loser.ok === false && loser.error.code).toBe('conflict');
    const s = await H.waitFor((st) => st.participants.filter((p) => p.slot.district === 3).length === 1);
    expect(s.participants.filter((p) => p.slot.district === 3 && p.slot.gender === 'F').length).toBe(1);
  });

  it('no se permiten dos participantes con el mismo nombre', async () => {
    const r = await H.emit('lobby:setCharacter', { character: character({ name: 'nara', gender: 'M' }) });
    expect(r.ok).toBe(false);
  });

  it('un doble clic (dos peticiones simultáneas del mismo usuario) crea un único bot', async () => {
    const [a, b] = await Promise.all([G.emit('lobby:addBot', { cid: randomUUID() }), G.emit('lobby:addBot', { cid: randomUUID() })]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    const rejected = a.ok ? b : a;
    expect(rejected.ok === false && rejected.error.code).toBe('rate_limited');
    await H.waitFor((s) => bots(s).length === 1);
  });

  it('cualquiera añade bots y el servidor respeta los límites ante pulsaciones simultáneas de varios usuarios', async () => {
    const codes: string[] = [];
    let okCount = 1; // el bot del doble clic
    for (let wave = 0; wave < 6; wave++) {
      const results = await Promise.all([H, G, H, G].map((c) => c.emit<{ botId: string }>('lobby:addBot', { cid: randomUUID() })));
      for (const r of results) r.ok ? okCount++ : codes.push(r.error.code);
      await sleep(260);
    }
    expect(okCount).toBe(5); // botsMaxTotal, nunca más
    expect(new Set(codes)).toEqual(new Set(['rate_limited', 'limit_reached']));
    const s = await H.waitFor((st) => bots(st).length === 5);
    const perUser = new Map<string, number>();
    for (const b of bots(s)) perUser.set(b.addedBy!.userId, (perUser.get(b.addedBy!.userId) ?? 0) + 1);
    for (const n of perUser.values()) expect(n).toBeLessThanOrEqual(3);
    // todos los bots tienen identidad, plaza única y build válida para la sala
    const slots = new Set(s.participants.filter((p) => p.slot.district).map((p) => `${p.slot.district}${p.slot.gender}`));
    expect(slots.size).toBe(s.participants.filter((p) => p.slot.district).length);
    for (const b of bots(s)) {
      expect(b.character).not.toBeNull();
      expect(b.addedBy).not.toBeNull();
      expect(summarizeBuild(b.character!, 28).valid).toBe(true);
    }
    expect(s.bots.canAdd).toBe(false);
  });

  it('el mismo identificador de comando no duplica bots', async () => {
    await H.emit('lobby:removeBot', { botId: bots(H.last()).find((b) => b.addedBy!.userId === host.id)!.id });
    await H.waitFor((s) => bots(s).length === 4);
    const cid = randomUUID();
    const [r1, r2, r3] = await Promise.all([G.emit<{ botId: string }>('lobby:addBot', { cid }), G.emit<{ botId: string }>('lobby:addBot', { cid }), G.emit<{ botId: string }>('lobby:addBot', { cid })]);
    const ids = [r1, r2, r3].map((r) => (r.ok ? r.data.botId : r.error.code));
    expect(new Set(ids).size).toBe(1);
    await sleep(50);
    expect(bots(H.last()).length).toBe(5);
  });

  it('cualquiera edita bots; solo quien lo añadió o el anfitrión lo retiran', async () => {
    const s = H.last();
    const hostBot = bots(s).find((b) => b.addedBy!.userId === host.id)!;
    const edited = { ...hostBot.character!, name: 'Bot Editado', abilities: ['golpeBrutal', 'carrera'] as ['golpeBrutal', 'carrera'], attributes: { potencia: 8, reflejos: 6, aguante: 5, instinto: 4, sigilo: 3, ingenio: 2, carisma: 2 } };
    const r = await G.emit('lobby:updateBot', { botId: hostBot.id, character: edited, settings: { difficulty: 'experto', personality: 'traicionero', playstyle: 'cazador' } });
    expect(r.ok).toBe(true);
    const after = await H.waitFor((st) => st.participants.some((p) => p.character?.name === 'Bot Editado'));
    const b = after.participants.find((p) => p.id === hostBot.id)!;
    expect(b.bot).toEqual({ difficulty: 'experto', personality: 'traicionero', playstyle: 'cazador' });
    expect(b.lastEditedBy).toBe('invitada');
    // build inválida rechazada
    const bad = await G.emit('lobby:updateBot', { botId: hostBot.id, character: { ...edited, attributes: { ...edited.attributes, potencia: 10, reflejos: 10 } } });
    expect(bad.ok).toBe(false);
    // la invitada no puede retirar un bot del anfitrión; el anfitrión sí puede retirar uno de ella
    expect((await G.emit('lobby:removeBot', { botId: hostBot.id })).ok).toBe(false);
    const guestBot = bots(H.last()).find((x) => x.addedBy!.userId === guest.id)!;
    expect((await H.emit('lobby:removeBot', { botId: guestBot.id })).ok).toBe(true);
    await H.waitFor((st) => bots(st).length === 4);
    expect((await G.emit('lobby:rerollBot', { botId: hostBot.id, what: 'all' })).ok).toBe(true);
  });

  it('prepararse exige personaje válido; cambiar la configuración resetea y reequilibra', async () => {
    expect((await G.emit('lobby:setReady', { ready: true })).ok).toBe(true);
    expect((await H.emit('lobby:setReady', { ready: true })).ok).toBe(true);
    const ready = await H.waitFor((s) => s.participants.filter((p) => p.kind === 'human').every((p) => p.ready));
    expect(ready.start.canStart).toBe(true);
    // un invitado no puede tocar la configuración
    expect((await G.emit('lobby:updateConfig', { patch: { attributePoints: 24 } })).ok).toBe(false);
    expect((await H.emit('lobby:updateConfig', { patch: { attributePoints: 24 }, name: 'Arena renombrada' })).ok).toBe(true);
    const s = await G.waitFor((st) => st.room.config.attributePoints === 24);
    expect(s.room.name).toBe('Arena renombrada');
    expect(s.participants.filter((p) => p.kind === 'human').every((p) => !p.ready)).toBe(true);
    for (const b of bots(s)) expect(summarizeBuild(b.character!, 24).valid).toBe(true);
    // los humanos con 28 puntos ya no son válidos y no pueden prepararse
    expect(me(s).buildValid).toBe(false);
    const r = await G.emit('lobby:setReady', { ready: true });
    expect(r.ok === false && r.error.code).toBe('invalid_state');
    expect(s.start.canStart).toBe(false);
  });

  it('multidispositivo: dos sockets del mismo usuario comparten participante y presencia', async () => {
    const login = await api(srv.url, '/api/auth/login', { body: { username: 'invitada', password: 'contraseña-larga' } });
    const G2 = await connect(srv.url, cookieFrom(login.headers));
    const j = await G2.emit<LobbyState>('room:join', { code });
    expect(j.ok && j.data.me.participantId).toBe(me(G.last()).id);
    G.close();
    await sleep(150);
    expect(H.last().participants.find((p) => p.userId === guest.id)!.online).toBe(true);
    G2.close();
    const off = await H.waitFor((s) => s.participants.find((p) => p.userId === guest.id)!.online === false);
    expect(off.start.reasons.join(' ')).toMatch(/Desconectados/);
    // reconexión: conserva participante y personaje
    G = await connect(srv.url, guest.cookie);
    const back = await G.emit<LobbyState>('room:join', { code });
    expect(back.ok && me(back.data).character?.name).toBe('Nara');
    await H.waitFor((s) => s.participants.find((p) => p.userId === guest.id)!.online === true);
  });

  it('chat de sala y global', async () => {
    const T = await connect(srv.url, third.cookie);
    expect((await H.emit('chat:send', { channel: 'room', body: '  ¡Hola, arena!  ' })).ok).toBe(true);
    const msg = await G.waitEvent('chat:message');
    expect(msg.body).toBe('¡Hola, arena!');
    expect((await T.emit('chat:send', { channel: 'room', body: 'cuela' })).ok).toBe(false); // no está en la sala
    expect((await T.emit('chat:send', { channel: 'global', body: 'Hola a todos' })).ok).toBe(true);
    const hist = await G.emit<{ body: string }[]>('chat:history', { channel: 'room' });
    expect(hist.ok && hist.data.some((m) => m.body === '¡Hola, arena!')).toBe(true);
    const glob = await H.emit<{ body: string }[]>('chat:history', { channel: 'global' });
    expect(glob.ok && glob.data.some((m) => m.body === 'Hola a todos')).toBe(true);
    T.close();
  });

  it('expulsión: el expulsado recibe aviso y no puede volver', async () => {
    const T = await connect(srv.url, third.cookie);
    expect((await T.emit('room:join', { code })).ok).toBe(true);
    const tid = (await H.waitFor((s) => s.participants.some((p) => p.userId === third.id))).participants.find((p) => p.userId === third.id)!.id;
    expect((await G.emit('lobby:kick', { participantId: tid })).ok).toBe(false); // solo el anfitrión
    expect((await H.emit('lobby:kick', { participantId: tid })).ok).toBe(true);
    const kicked = await T.waitEvent('room:kicked');
    expect(kicked.code).toBe(code);
    const again = await T.emit('room:join', { code });
    expect(again.ok === false && again.error.code).toBe('forbidden');
    T.close();
  });

  it('traspaso automático de anfitrión si se desconecta demasiado tiempo', async () => {
    H.close();
    await G.waitFor((s) => s.participants.find((p) => p.userId === host.id)!.online === false);
    const rt = srv.ctx.roomManager.get(G.last().room.id)!;
    rt.tick(Date.now() + 95_000);
    const s = await G.waitFor((st) => st.room.hostUserId === guest.id);
    expect(s.me.isHost).toBe(true);
    const n = await G.waitEvent('notify');
    expect(n.text).toMatch(/anfitrión/);
  });
});

describe('persistencia y reinicio', () => {
  it('la sala sobrevive a un reinicio del servidor', async () => {
    const before = G.last();
    G.close();
    await srv.close();
    srv = await startServer();
    G = await connect(srv.url, guest.cookie);
    const r = await G.emit<LobbyState>('room:join', { code });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.room.name).toBe(before.room.name);
    expect(r.data.room.config).toEqual(before.room.config);
    expect(r.data.room.hostUserId).toBe(guest.id);
    expect(r.data.participants.map((p) => p.id).sort()).toEqual(before.participants.map((p) => p.id).sort());
    expect(bots(r.data).map((b) => b.character!.name).sort()).toEqual(bots(before).map((b) => b.character!.name).sort());
    H = await connect(srv.url, host.cookie);
    const hj = await H.emit<LobbyState>('room:join', { code });
    expect(hj.ok && me(hj.data).character?.name).toBe('Torvo');
  });

  it('salir voluntariamente traspasa el anfitrión y cierra la sala al quedar vacía', async () => {
    expect((await G.emit('room:leave')).ok).toBe(true);
    const s = await H.waitFor((st) => st.room.hostUserId === host.id && !st.participants.some((p) => p.userId === guest.id));
    expect(s.me.isHost).toBe(true);
    const mine = await api(srv.url, '/api/rooms/mine', { cookie: guest.cookie });
    expect(mine.body.rooms.length).toBe(0);
    expect((await H.emit('room:leave')).ok).toBe(true);
    const preview = await api(srv.url, `/api/rooms/${code}`, { cookie: host.cookie });
    expect(preview.status).toBe(404);
  });

  it('prioridad humana: un humano nuevo sustituye al último bot si la sala está llena', async () => {
    const c2 = await createRoom(host, 'Sala llena', { maxParticipants: 3, botsMaxTotal: 5 });
    const h = await connect(srv.url, host.cookie);
    await h.emit('room:join', { code: c2 });
    await h.emit('lobby:addBot', { cid: randomUUID() });
    await sleep(250);
    await h.emit('lobby:addBot', { cid: randomUUID() });
    await h.waitFor((s) => s.participants.length === 3);
    const g = await connect(srv.url, guest.cookie);
    const j = await g.emit<LobbyState>('room:join', { code: c2 });
    expect(j.ok).toBe(true);
    const s = await h.waitFor((st) => st.participants.some((p) => p.userId === guest.id));
    expect(s.participants.length).toBe(3);
    expect(bots(s).length).toBe(1);
    h.close();
    g.close();
  });
});
