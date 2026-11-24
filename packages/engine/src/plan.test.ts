import { describe, expect, it } from 'vitest';
import { ARCHETYPES, defaultCharacter, type Character } from '@ceniza/shared';
import {
  T,
  computeView,
  createWorld,
  moveIntent,
  nextStop,
  planRoute,
  routeEndTime,
  tick,
  truncateAfterCurrent,
  type ActorInit,
  type ActorState,
  type GameMap,
  type World,
  type WorldRules,
} from './index.js';

const RULES: WorldRules = { visibility: 'visible', pauseVote: 'mayoria', disconnectPolicy: 'piloto', disconnectGraceMs: 60_000, presentationMs: 100, countdownMs: 100, dayMs: 40_000, nightMs: 20_000 };
const USERS = ['u-yo', 'u-otro'];

function char(name: string): Character {
  const a = ARCHETYPES.find((x) => x.key === 'equilibrado')!;
  return { ...defaultCharacter({ name, seed: name }), attributes: { ...a.attributes }, abilities: [...a.abilities], trait: a.trait };
}
const human = (id: string, district: number): ActorInit => ({ id, kind: 'human', userId: `u-${id}`, character: char(id), district, gender: 'F' });

function start(): World {
  const w = createWorld({ seed: 'rutas', mapSize: 96, actors: [human('yo', 2), human('otro', 3)], rules: RULES });
  for (let now = 100; w.phase !== 'en_curso'; now += 100) tick(w, now, USERS);
  return w;
}
const advance = (w: World, ms: number) => {
  for (let i = 0; i < ms / 100; i++) tick(w, 0, USERS);
};
const yo = (w: World): ActorState => w.actors.find((a) => a.id === 'yo')!;
/** Mapa de pradera a mano, para distancias que un mapa generado no da. */
const flat = (size: number): GameMap => ({ size, tiles: new Uint8Array(size * size).fill(T.PRADERA), heights: new Uint8Array(size * size), center: { x: 0, y: 0 }, pois: [], rivers: [], roads: [] });

describe('ruta prevista (fase 7)', () => {
  it('planRoute da la misma ruta que moveIntent, parado y a mitad de camino', () => {
    const w = start();
    const a = yo(w);
    const to = { x: Math.min(w.map.size - 1, a.x + 6), y: Math.min(w.map.size - 1, a.y + 4) };
    const r = planRoute(w.map, a, to, w.t, a.speed, a.costs);
    moveIntent(w, 'yo', to);
    expect(r).toEqual({ ok: true, route: a.route, arrival: routeEndTime(a.route!) });

    advance(w, 1500);
    expect(a.route).not.toBeNull();
    const to2 = { x: Math.max(0, to.x - 9), y: Math.max(0, to.y - 2) };
    const r2 = planRoute(w.map, a, to2, w.t, a.speed, a.costs);
    moveIntent(w, 'yo', to2);
    expect(r2).toEqual({ ok: true, route: a.route, arrival: routeEndTime(a.route!) });
  });

  it('planRoute da los mismos errores que moveIntent', () => {
    const w = start();
    const a = yo(w);
    expect(planRoute(w.map, a, { x: -1, y: 0 }, w.t, a.speed, a.costs)).toEqual({ ok: false, error: 'Ese destino está fuera de la arena' });
    const walled = a.costs.map(() => Number.POSITIVE_INFINITY);
    expect(planRoute(w.map, a, { x: a.x + 3, y: a.y }, w.t, a.speed, walled)).toEqual({ ok: false, error: 'No hay camino hasta ahí' });
    expect(planRoute(flat(240), { x: 0, y: 0, route: null }, { x: 239, y: 0 }, 0, 1)).toEqual({
      ok: false,
      error: 'Demasiado lejos para una sola orden: elige un punto más cercano',
    });
  });

  it('hasta la casilla siguiente, para allí', () => {
    const w = start();
    const a = yo(w);
    moveIntent(w, 'yo', { x: Math.min(w.map.size - 1, a.x + 8), y: a.y });
    advance(w, 500);
    const stop = nextStop(a.route, { x: a.x, y: a.y }, w.t);
    const head = truncateAfterCurrent(a.route!, w.t);
    expect(planRoute(w.map, a, stop.cell, w.t, a.speed, a.costs)).toEqual({ ok: true, route: head.times.length > 1 ? head : null, arrival: stop.time });
  });

  it('la vista propia lleva velocidad y costes; la de los demás, no', () => {
    const w = start();
    const view = computeView(w, 'u-yo');
    const a = yo(w);
    expect(view.actors.find((x) => x.id === 'yo')!.move).toEqual({ speed: a.speed, costs: a.costs });
    expect(view.actors.find((x) => x.id === 'otro')!.move).toBeNull();
  });
});
