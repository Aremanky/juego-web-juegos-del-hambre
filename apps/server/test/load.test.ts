/**
 * Prueba de carga de la fase 4: 24 humanos en la misma partida (el máximo de una sala), mapa grande y
 * niebla de guerra, todos dando órdenes de movimiento cada 1–2 s. Mide el bucle del servidor, la latencia
 * de las órdenes, el tráfico por jugador y que lo que ve cada cliente coincide con el servidor.
 *
 * `npm run load` la ejecuta durante 30 s y escribe docs/LOAD.md; con `npm test` dura 10 s.
 * Clientes y servidor comparten proceso, así que las cifras son pesimistas: en la VM el servidor no
 * tiene que mover además 24 clientes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { LobbyState, MatchFrame, MatchSnapshot } from '@ceniza/shared';
import { T, computeView, inBounds, positionAt, routeEndTime, tileAt, type World } from '@ceniza/engine';
import { api, character, connect, register, resetDatabase, sleep, startServer, type Client, type TestServer, type TestUser } from './helpers';

const N = 24;
const REPORT = !!process.env.LOAD_REPORT;
const PLAY_MS = REPORT ? 30_000 : 10_000;
const TIMINGS = { lobbyCountdownMs: 300, presentationMs: 300, countdownMs: 300, snapshotMs: 10_000 };

interface Player {
  user: TestUser;
  c: Client;
  phase: string | null;
  frames: number;
  bytes: number;
  acks: number[];
  failed: number;
  /** Réplica de lo que pinta el cliente: id del personaje → su vista en JSON. */
  seen: Map<string, string>;
}

let srv: TestServer;
let roomId = '';
const players: Player[] = [];

const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
};
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Generador sencillo con semilla: la prueba hace siempre los mismos movimientos. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

beforeAll(async () => {
  await resetDatabase();
  srv = await startServer({ matchTimings: TIMINGS });
  for (let i = 0; i < N; i++) {
    const user = await register(srv.url, `carga${String(i).padStart(2, '0')}`);
    const c = await connect(srv.url, user.cookie);
    const p: Player = { user, c, phase: null, frames: 0, bytes: 0, acks: [], failed: 0, seen: new Map() };
    c.socket.on('match:snapshot', (s: MatchSnapshot) => {
      p.phase = s.phase;
      p.seen = new Map(s.actors.map((a) => [a.id, JSON.stringify(a)]));
    });
    c.socket.on('match:frame', (f: MatchFrame) => {
      p.phase = f.phase;
      p.frames++;
      p.bytes += JSON.stringify(f).length;
      for (const a of f.actors) p.seen.set(a.id, JSON.stringify(a));
    });
    players.push(p);
  }
}, 60_000);

afterAll(async () => {
  for (const p of players) p.c.close();
  await srv?.close();
});

describe('prueba de carga: 24 participantes', () => {
  it('arranca la partida con la sala llena', async () => {
    const host = players[0];
    const r = await api(srv.url, '/api/rooms', {
      body: { name: 'Prueba de carga', config: { maxParticipants: N, mapSize: 'grande', visibility: 'niebla' } },
      cookie: host.user.cookie,
    });
    expect(r.status).toBe(201);
    const code = r.body.room.code as string;
    for (const [i, p] of players.entries()) {
      const j = await p.c.emit<LobbyState>('room:join', { code });
      expect(j.ok).toBe(true);
      if (i === 0 && j.ok) roomId = j.data.room.id;
      const ch = character({ name: `Carga ${i}`, gender: i < 12 ? 'M' : 'F', district: (i % 12) + 1 });
      expect((await p.c.emit('lobby:setCharacter', { character: ch })).ok).toBe(true);
    }
    for (const p of players) expect((await p.c.emit('lobby:setReady', { ready: true })).ok).toBe(true);
    const end = Date.now() + 15_000;
    while (players.some((p) => p.phase !== 'en_curso')) {
      if (Date.now() > end) throw new Error('la partida no ha empezado para todos');
      await sleep(50);
    }
    expect(srv.ctx.roomManager.get(roomId)!.match!.world.actors).toHaveLength(N);
  }, 30_000);

  it(`aguanta ${PLAY_MS / 1000} s con todos moviéndose y cada cliente ve lo mismo que el servidor`, async () => {
    const rt = srv.ctx.roomManager.get(roomId)!.match!;
    const world: World = rt.world;
    const rand = lcg(2026);
    const loop = monitorEventLoopDelay({ resolution: 10 });
    const heap0 = process.memoryUsage().heapUsed;
    rt.perf.reset();
    loop.enable();
    const t0 = Date.now();

    // Cada jugador da una orden cada 1–2 s hacia una casilla cercana transitable.
    const orders = players.map(async (p, i) => {
      await sleep(Math.floor(rand() * 1000));
      while (Date.now() - t0 < PLAY_MS) {
        const me = world.actors.find((a) => a.userId === p.user.id)!;
        const pos = positionAt(me, world.t);
        let target: { x: number; y: number } | null = null;
        for (let k = 0; k < 10 && !target; k++) {
          const x = Math.round(pos.x + (rand() * 2 - 1) * 6);
          const y = Math.round(pos.y + (rand() * 2 - 1) * 6);
          if (!inBounds(world.map, x, y)) continue;
          const t = tileAt(world.map, x, y);
          if (t !== T.AGUA && t !== T.CUMBRE) target = { x, y };
        }
        if (target) {
          const sent = Date.now();
          const ack = await p.c.emit('match:move', target);
          p.acks.push(Date.now() - sent);
          if (!ack.ok) p.failed++;
        }
        await sleep(1000 + Math.floor(rand() * 1000) + (i % 3) * 10);
      }
    });
    await Promise.all(orders);
    const playedMs = Date.now() - t0;
    loop.disable();
    const perf = rt.perf.stats();
    const heap1 = process.memoryUsage().heapUsed;

    // Parar a todos y esperar a que terminen el paso en curso para comparar con calma.
    for (const p of players) await p.c.emit('match:stop');
    const settle = Date.now() + 10_000;
    while (world.actors.some((a) => a.route && routeEndTime(a.route) > world.t)) {
      if (Date.now() > settle) break;
      await sleep(100);
    }
    await sleep(700);
    for (const p of players) {
      const server = computeView(world, p.user.id).actors;
      for (const a of server) expect(p.seen.get(a.id), `${p.user.username} ve a ${a.name}`).toBe(JSON.stringify(a));
    }

    const acks = players.flatMap((p) => p.acks);
    const failed = players.reduce((n, p) => n + p.failed, 0);
    const secs = playedMs / 1000;
    const bytesPerSec = players.map((p) => p.bytes / secs);
    const framesPerSec = players.map((p) => p.frames / secs);
    const result = {
      participantes: N,
      segundos: round(secs),
      ordenes: acks.length,
      rechazadas: failed,
      ackP50: pct(acks, 0.5),
      ackP95: pct(acks, 0.95),
      ackMax: pct(acks, 1),
      tickP50: round(perf.p50, 2),
      tickP95: round(perf.p95, 2),
      tickP99: round(perf.p99, 2),
      tickMax: round(perf.max, 2),
      ticks: perf.ticks,
      loopP99: round(loop.percentile(99) / 1e6),
      loopMax: round(loop.max / 1e6),
      kbPorJugador: round(avgOf(bytesPerSec) / 1024, 2),
      kbPorJugadorMax: round(Math.max(...bytesPerSec) / 1024, 2),
      fotogramasPorJugador: round(avgOf(framesPerSec), 2),
      kbServidor: round(perf.bytes / secs / 1024, 1),
      heapMb: round((heap1 - heap0) / 1024 / 1024, 1),
    };
    console.log('Prueba de carga', result);
    if (REPORT) writeReport(result);

    // Presupuestos (holgados: clientes y servidor comparten proceso).
    expect(acks.length).toBeGreaterThan(N * (PLAY_MS / 2000) * 0.8);
    expect(failed / acks.length).toBeLessThan(0.05);
    expect(result.ackP95).toBeLessThan(250);
    expect(result.tickP95).toBeLessThan(15);
    expect(result.tickMax).toBeLessThan(250);
    expect(result.loopP99).toBeLessThan(100);
    expect(result.kbPorJugadorMax).toBeLessThan(20);
    expect(result.fotogramasPorJugador).toBeGreaterThan(0.4);
  }, 90_000);
});

function avgOf(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function writeReport(r: Record<string, number>) {
  const md = `# Prueba de carga

Generado con \`npm run load\`: ${r.participantes} humanos en la misma partida (mapa grande, 128 × 128, con
niebla de guerra), cada uno dando una orden de movimiento cada 1–2 s durante ${r.segundos} s. Clientes y
servidor comparten proceso en la misma máquina, así que las cifras son pesimistas.

| Medida | Resultado | Presupuesto |
|---|---:|---:|
| Órdenes enviadas / rechazadas | ${r.ordenes} / ${r.rechazadas} | < 5 % rechazadas |
| Respuesta a una orden (p50 / p95 / máx.) | ${r.ackP50} / ${r.ackP95} / ${r.ackMax} ms | p95 < 250 ms |
| Tick del servidor (p50 / p95 / p99 / máx.) | ${r.tickP50} / ${r.tickP95} / ${r.tickP99} / ${r.tickMax} ms | p95 < 15 ms (hay 100 ms por tick) |
| Retraso del bucle de eventos (p99 / máx.) | ${r.loopP99} / ${r.loopMax} ms | p99 < 100 ms |
| Tráfico por jugador (media / máx.) | ${r.kbPorJugador} / ${r.kbPorJugadorMax} KB/s | < 20 KB/s |
| Fotogramas por jugador | ${r.fotogramasPorJugador} /s | — |
| Tráfico total de partida enviado por el servidor | ${r.kbServidor} KB/s | — |
| Memoria del proceso durante la prueba | ${r.heapMb >= 0 ? '+' : ''}${r.heapMb} MB | — |

Al terminar se para a todos y se comprueba que la réplica de cada cliente (instantánea + fotogramas)
coincide exactamente con la vista que el servidor calcula para él.
`;
  writeFileSync(fileURLToPath(new URL('../../../docs/LOAD.md', import.meta.url)), md);
}
