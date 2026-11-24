import { describe, expect, it } from 'vitest';
import { TERRAIN_KINDS, TERRAIN_RULES, defaultCharacter } from '@ceniza/shared';
import {
  T,
  TERRAIN,
  actorById,
  computeView,
  createWorld,
  moveIntent,
  restoreWorld,
  routeEndTime,
  serializeWorld,
  tick,
  tileAt,
  visionAt,
  type ActorInit,
  type World,
} from './index.js';

const RULES = {
  visibility: 'niebla',
  pauseVote: 'mayoria',
  disconnectPolicy: 'piloto',
  disconnectGraceMs: 60_000,
  presentationMs: 100,
  countdownMs: 100,
} as const;

/** Dos personajes idénticos salvo el distrito. */
function twins(districtA: number, districtB: number, seed = 'estadisticas'): World {
  const actors: ActorInit[] = [districtA, districtB].map((district, i) => ({
    id: `a${i}`,
    kind: 'human',
    userId: `u${i}`,
    character: defaultCharacter({ name: `Gemelo ${i}`, seed: 'gemelo' }),
    district,
    gender: 'M',
  }));
  const w = createWorld({ seed, mapSize: 96, rules: { ...RULES }, actors });
  for (let now = 100; now <= 1000 && w.phase !== 'en_curso'; now += 100) tick(w, now, ['u0', 'u1']);
  expect(w.phase).toBe('en_curso');
  return w;
}

/** Primera fila con `len` casillas seguidas de los terrenos pedidos. */
function stripOf(w: World, tiles: number[], len: number): { x: number; y: number } {
  for (let y = 1; y < w.map.size - 1; y++) {
    let run = 0;
    for (let x = 1; x < w.map.size - 1; x++) {
      run = tiles.includes(tileAt(w.map, x, y)) ? run + 1 : 0;
      if (run === len) return { x: x - len + 1, y };
    }
  }
  throw new Error('El mapa de prueba no tiene esa franja');
}

/** Tiempo que tarda cada gemelo en recorrer la misma franja. */
function crossTimes(w: World, start: { x: number; y: number }, len: number): number[] {
  return w.actors.map((a) => {
    a.x = start.x;
    a.y = start.y;
    a.route = null;
    moveIntent(w, a.id, { x: start.x + len - 1, y: start.y });
    return routeEndTime(actorById(w, a.id)!.route!) - w.t;
  });
}

describe('estadísticas aplicadas a la partida', () => {
  it('el motor y las reglas comparten la misma tabla de terrenos', () => {
    expect(TERRAIN.map((t) => t.cost)).toEqual(TERRAIN_KINDS.map((k) => TERRAIN_RULES[k].cost));
    expect(TERRAIN_KINDS.indexOf('denso')).toBe(T.DENSO);
    expect(TERRAIN_KINDS.indexOf('cumbre')).toBe(T.CUMBRE);
  });

  it('el distrito VII cruza el bosque un 12 % más rápido y en la pradera no gana nada', () => {
    const w = twins(7, 2);
    const forest = stripOf(w, [T.BOSQUE, T.DENSO], 6);
    const [lumber, other] = crossTimes(w, forest, 6);
    expect(lumber / other).toBeGreaterThan(0.87);
    expect(lumber / other).toBeLessThan(0.9);
    const meadow = stripOf(w, [T.PRADERA], 6);
    const [a, b] = crossTimes(w, meadow, 6);
    expect(a).toBe(b);
  });

  it('el distrito X camina por la roca sin penalización', () => {
    const w = twins(10, 2);
    const rock = stripOf(w, [T.ROCA, T.MONTANA], 4);
    const [climber, other] = crossTimes(w, rock, 4);
    expect(climber).toBeLessThan(other * 0.75);
  });

  it('la visión depende del terreno que se pisa y la niebla la respeta', () => {
    const w = twins(2, 3);
    const [me, other] = w.actors;
    const meadow = stripOf(w, [T.PRADERA], 1);
    const dense = stripOf(w, [T.DENSO], 1);
    const open = visionAt(w, me, meadow);
    const closed = visionAt(w, me, dense);
    expect(closed).toBeCloseTo(open * 0.7, 1);

    // El otro, a una distancia entre los dos radios: se ve desde la pradera y no desde el bosque denso.
    const d = (open + closed) / 2;
    for (const [spot, visible] of [[meadow, true], [dense, false]] as const) {
      me.x = spot.x;
      me.y = spot.y;
      me.route = null;
      other.x = spot.x;
      other.y = spot.y;
      other.route = null;
      // Se coloca al otro en vertical o en horizontal, donde quepa dentro del mapa.
      if (spot.y + Math.ceil(d) < w.map.size) other.y = spot.y + d;
      else other.y = spot.y - d;
      const view = computeView(w, 'u0');
      expect(view.actors.find((a) => a.id === 'a1')!.seen).toBe(visible);
      expect(view.actors.find((a) => a.id === 'a0')!.vision).toBeCloseTo(visible ? open : closed, 5);
    }
  });

  it('una partida guardada por la 0.4 se recupera con las reglas de entonces', () => {
    const w = twins(7, 10);
    const json = serializeWorld(w) as unknown as { actors: Record<string, unknown>[] };
    for (const a of json.actors) {
      delete a.costs;
      delete a.visionBy;
    }
    const back = restoreWorld(json as never);
    for (const a of back.actors) {
      expect(a.costs).toEqual(TERRAIN.map((t) => t.cost));
      expect(new Set(a.visionBy)).toEqual(new Set([a.vision]));
    }
  });
});
