import { describe, expect, it } from 'vitest';
import { defaultCharacter, type Character } from '@ceniza/shared';
import {
  T,
  TICK_MS,
  actorById,
  castVote,
  computeView,
  createWorld,
  decodeTiles,
  eliminate,
  encodeTiles,
  findPath,
  generateMap,
  hashWorld,
  moveIntent,
  pauseForRestart,
  positionAt,
  proposePause,
  restoreWorld,
  routeEndTime,
  serializeWorld,
  setConnected,
  setResumeReady,
  spawnRing,
  stepCost,
  stopIntent,
  terrainCost,
  tick,
  tileAt,
  type ActorInit,
  type World,
  type WorldRules,
} from './index.js';

const RULES: WorldRules = {
  visibility: 'visible',
  pauseVote: 'mayoria',
  disconnectPolicy: 'piloto',
  disconnectGraceMs: 60_000,
  presentationMs: 1000,
  countdownMs: 1000,
};

function char(name: string, over: Partial<Character> = {}): Character {
  return { ...defaultCharacter({ name, seed: name }), ...over };
}

function actors(n: number, humans = n): ActorInit[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    kind: i < humans ? ('human' as const) : ('bot' as const),
    userId: i < humans ? `u${i}` : null,
    character: char(`P${i}`),
    district: (i % 12) + 1,
    gender: i % 2 ? ('F' as const) : ('M' as const),
  }));
}

function world(n = 4, humans = n, rules: Partial<WorldRules> = {}): World {
  const w = createWorld({ seed: 'prueba', mapSize: 64, actors: actors(n, humans), rules: { ...RULES, ...rules } });
  for (const a of w.actors) setConnected(w, a.id, true);
  return w;
}

function run(w: World, ms: number, eligible: string[] = w.actors.filter((a) => a.kind === 'human' && a.alive && a.connected).map((a) => a.userId!)) {
  for (let i = 0; i < ms / TICK_MS; i++) tick(w, 0, eligible);
}

describe('mapa', () => {
  it('es determinista por semilla y cambia con otra semilla', () => {
    const a = generateMap('semilla', 64);
    const b = generateMap('semilla', 64);
    const c = generateMap('otra', 64);
    expect(encodeTiles(a.tiles)).toBe(encodeTiles(b.tiles));
    expect(encodeTiles(a.tiles)).not.toBe(encodeTiles(c.tiles));
  });

  it('tiene la explanada en el centro, varios biomas y un anillo de salida transitable', () => {
    const m = generateMap('semilla', 96);
    expect(tileAt(m, m.center.x, m.center.y)).toBe(T.PLAZA);
    expect(new Set(m.tiles).size).toBeGreaterThanOrEqual(5);
    for (const s of spawnRing(m, 24)) expect([T.AGUA, T.MONTANA, T.CUMBRE, T.ROCA]).not.toContain(tileAt(m, s.x, s.y));
    expect(new Set(spawnRing(m, 24).map((s) => `${s.x},${s.y}`)).size).toBe(24);
  });

  it('codifica y decodifica las casillas sin pérdidas', () => {
    const m = generateMap('x', 64);
    expect(Array.from(decodeTiles(encodeTiles(m.tiles)))).toEqual(Array.from(m.tiles));
    const odd = new Uint8Array([1, 2, 3, 4, 5]);
    expect(Array.from(decodeTiles(encodeTiles(odd)))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('rutas', () => {
  it('A* encuentra un camino contiguo y no más caro que la línea recta', () => {
    const m = generateMap('rutas', 64);
    const from = m.center;
    const to = { x: m.center.x + 12, y: m.center.y + 7 };
    const path = findPath(m, from, to)!;
    expect(path.at(-1)).toEqual(to);
    let prev = from;
    let cost = 0;
    for (const c of path) {
      expect(Math.max(Math.abs(c.x - prev.x), Math.abs(c.y - prev.y))).toBe(1);
      cost += stepCost(m, c, c.x !== prev.x && c.y !== prev.y);
      prev = c;
    }
    // Recta (diagonal y después horizontal) con el peor coste posible: el camino óptimo nunca la supera.
    expect(cost).toBeLessThanOrEqual((7 * Math.SQRT2 + 5) * 3);
  });

  it('el tiempo de cada paso sale de la velocidad y del terreno', () => {
    const w = world(2);
    run(w, 2000); // presentación + cuenta atrás
    expect(w.phase).toBe('en_curso');
    const a = w.actors[0];
    const target = { x: a.x + 3, y: a.y };
    moveIntent(w, a.id, target);
    const r = a.route!;
    let expected = w.t;
    for (let i = 1; i < r.times.length; i++) {
      const c = { x: r.cells[i * 2], y: r.cells[i * 2 + 1] };
      const p = { x: r.cells[i * 2 - 2], y: r.cells[i * 2 - 1] };
      expected += Math.round((stepCost(w.map, c, c.x !== p.x && c.y !== p.y) / a.speed) * 1000);
      expect(r.times[i]).toBe(expected);
    }
    run(w, routeEndTime(r) - w.t + TICK_MS);
    expect({ x: a.x, y: a.y }).toEqual(target);
    expect(a.route).toBeNull();
  });

  it('una orden nueva a mitad de paso termina ese paso antes de girar (sin teletransporte)', () => {
    const w = world(2);
    run(w, 2000);
    const a = w.actors[0];
    moveIntent(w, a.id, { x: a.x + 6, y: a.y });
    run(w, 300);
    const before = positionAt(a, w.t);
    moveIntent(w, a.id, { x: a.x, y: a.y + 5 });
    const after = positionAt(a, w.t);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    stopIntent(w, a.id);
    run(w, 5000);
    expect(a.route).toBeNull();
  });

  it('no deja moverse antes de la cuenta atrás ni durante la pausa', () => {
    const w = world(2);
    expect(() => moveIntent(w, 'a0', { x: 1, y: 1 })).toThrow(/cuenta atrás/);
    run(w, 2000);
    w.paused = { reason: 'votacion', since: 0, ready: [], resumeAt: null };
    expect(() => moveIntent(w, 'a0', { x: 1, y: 1 })).toThrow(/pausa/);
  });
});

describe('simulación', () => {
  it('es determinista: misma semilla e intenciones dan el mismo estado', () => {
    const play = () => {
      const w = world(6, 2);
      run(w, 2000);
      moveIntent(w, 'a0', { x: w.actors[0].x + 5, y: w.actors[0].y - 4 });
      run(w, 1500);
      moveIntent(w, 'a1', { x: w.actors[1].x - 6, y: w.actors[1].y + 2 });
      run(w, 8000);
      return hashWorld(w);
    };
    expect(play()).toBe(play());
  });

  it('una instantánea restaurada sigue exactamente igual que la original', () => {
    const w = world(5, 1);
    run(w, 4000);
    moveIntent(w, 'a0', { x: w.actors[0].x + 4, y: w.actors[0].y + 4 });
    const copy = restoreWorld(JSON.parse(JSON.stringify(serializeWorld(w))));
    run(w, 9000);
    run(copy, 9000);
    expect(hashWorld(copy)).toBe(hashWorld(w));
  });

  it('los bots se mueven solos (piloto provisional) y el reloj se congela en pausa', () => {
    const w = world(4, 1);
    run(w, 6000);
    expect(w.actors.slice(1).some((b) => b.route !== null || b.x !== w.actors[0].x)).toBe(true);
    const t = w.t;
    w.paused = { reason: 'votacion', since: 0, ready: [], resumeAt: null };
    run(w, 3000, ['u0']);
    expect(w.t).toBe(t);
  });

  it('el abandono deja el puesto y la partida termina cuando queda uno', () => {
    const w = world(3);
    run(w, 2500);
    const e1 = eliminate(w, 'a1', 'abandono');
    expect(e1[0]).toMatchObject({ type: 'eliminado', place: 3 });
    const e2 = eliminate(w, 'a2', 'abandono');
    expect(e2.map((e) => e.type)).toEqual(['eliminado', 'fase', 'fin']);
    expect(w.phase).toBe('terminada');
    expect(w.winnerId).toBe('a0');
    expect(actorById(w, 'a0')!.place).toBe(1);
    expect(actorById(w, 'a2')!.place).toBe(2);
  });

  it('desconexión: piloto, a cubierto o eliminación tras la gracia', () => {
    const piloto = world(2);
    run(piloto, 2000);
    setConnected(piloto, 'a0', false);
    expect(actorById(piloto, 'a0')!.control).toBe('piloto');
    setConnected(piloto, 'a0', true);
    expect(actorById(piloto, 'a0')!.control).toBe('jugador');

    const elim = world(3, 3, { disconnectPolicy: 'eliminar', disconnectGraceMs: 2000 });
    run(elim, 2000);
    setConnected(elim, 'a2', false);
    expect(actorById(elim, 'a2')!.control).toBe('protegido');
    run(elim, 2100);
    expect(actorById(elim, 'a2')!.alive).toBe(false);
    expect(actorById(elim, 'a2')!.cause).toBe('desconexion');
  });
});

describe('pausa por votación', () => {
  it('mayoría: con 3 votantes hacen falta 2 síes; se reanuda cuando todos pulsan «Listo»', () => {
    const w = world(3);
    run(w, 2000);
    const voters = ['u0', 'u1', 'u2'];
    const ev = proposePause(w, 'u0', 'P0', voters, 1000);
    expect(ev.map((e) => e.type)).toEqual(['votacion']);
    expect(w.paused).toBeNull();
    const ev2 = castVote(w, 'u1', true, voters, 2000);
    expect(ev2.map((e) => e.type)).toEqual(['votacion', 'pausa']);
    expect(w.paused?.reason).toBe('votacion');
    setResumeReady(w, 'u0', true, voters, 3000);
    setResumeReady(w, 'u1', true, voters, 3000);
    expect(w.paused!.resumeAt).toBeNull();
    setResumeReady(w, 'u2', true, voters, 4000);
    expect(w.paused!.resumeAt).toBe(7000);
    expect(tick(w, 6999, voters)).toEqual([]);
    expect(tick(w, 7000, voters).map((e) => e.type)).toEqual(['reanudada']);
  });

  it('unanimidad: un «no» basta para rechazar; las votaciones caducan', () => {
    const w = world(3, 3, { pauseVote: 'unanimidad' });
    run(w, 2000);
    const voters = ['u0', 'u1', 'u2'];
    proposePause(w, 'u0', 'P0', voters, 0);
    expect(castVote(w, 'u2', false, voters).map((e) => e.type)).toEqual(['votacion']);
    expect(w.vote).toBeNull();
    proposePause(w, 'u1', 'P1', voters, 0);
    expect(tick(w, 31_000, voters)[0]).toMatchObject({ type: 'votacion', result: 'caducada' });
  });

  it('tras un reinicio vuelve en pausa y sin nadie conectado', () => {
    const w = world(3, 2);
    run(w, 3000);
    pauseForRestart(w, 5000);
    expect(w.paused?.reason).toBe('reinicio');
    expect(w.actors.filter((a) => a.kind === 'human').every((a) => !a.connected)).toBe(true);
    // Nadie conectado: sigue en pausa aunque pase el tiempo.
    run(w, 5000, []);
    expect(w.paused).not.toBeNull();
  });
});

describe('vista por jugador', () => {
  it('con niebla solo ve a quien tiene dentro de su radio de visión', () => {
    const w = world(4, 4, { visibility: 'niebla' });
    run(w, 2000);
    const me = w.actors[0];
    const far = w.actors[1];
    far.x = Math.min(w.map.size - 1, me.x + 40);
    far.y = me.y;
    const near = w.actors[2];
    near.x = me.x + 1;
    near.y = me.y;
    const v = computeView(w, 'u0');
    expect(v.me).toBe('a0');
    expect(v.actors.find((a) => a.id === far.id)!.seen).toBe(false);
    expect(v.actors.find((a) => a.id === far.id)!.x).toBe(-1);
    expect(v.actors.find((a) => a.id === near.id)!.seen).toBe(true);
    // Sin niebla y para espectadores se ve todo.
    expect(computeView(w, null).actors.every((a) => a.seen)).toBe(true);
  });

  it('de los demás solo se ve el paso en curso y el siguiente, no el destino', () => {
    const w = world(2);
    run(w, 2000);
    moveIntent(w, 'a1', { x: w.actors[1].x + 10, y: w.actors[1].y });
    const other = computeView(w, 'u0').actors.find((a) => a.id === 'a1')!;
    const own = computeView(w, 'u1').actors.find((a) => a.id === 'a1')!;
    expect(other.route!.times.length).toBeLessThanOrEqual(3);
    expect(own.route!.times.length).toBeGreaterThan(3);
  });

  it('el coste de terreno ordena los biomas como en el GDD', () => {
    expect(terrainCost(T.PRADERA)).toBeLessThan(terrainCost(T.BOSQUE));
    expect(terrainCost(T.BOSQUE)).toBeLessThan(terrainCost(T.DENSO));
    expect(terrainCost(T.MONTANA)).toBeLessThan(terrainCost(T.CUMBRE));
  });
});
