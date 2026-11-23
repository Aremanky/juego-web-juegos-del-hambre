import type { RouteDTO } from '@ceniza/shared';
import type { Cell, GameMap } from './map.js';
import { stepCost } from './path.js';

/**
 * Rutas con hora de llegada a cada casilla. Es la misma representación en el servidor y en el
 * cliente: con ella el cliente sabe dónde está cada personaje en cualquier instante, sin saltos.
 */
export type Route = RouteDTO;

export function buildRoute(map: GameMap, start: Cell, path: Cell[], t0: number, speed: number): Route {
  const cells = [start.x, start.y];
  const times = [t0];
  let t = t0;
  let prev = start;
  for (const c of path) {
    const diagonal = c.x !== prev.x && c.y !== prev.y;
    t += Math.round((stepCost(map, c, diagonal) / speed) * 1000);
    cells.push(c.x, c.y);
    times.push(t);
    prev = c;
  }
  return { cells, times };
}

export function routeLength(r: Route): number {
  return r.times.length;
}

export function routeCell(r: Route, i: number): Cell {
  return { x: r.cells[i * 2], y: r.cells[i * 2 + 1] };
}

export function routeEnd(r: Route): Cell {
  return routeCell(r, r.times.length - 1);
}

export function routeEndTime(r: Route): number {
  return r.times[r.times.length - 1];
}

/** Posición (con decimales) en el instante t. */
export function routePosition(r: Route, t: number): { x: number; y: number; done: boolean } {
  const n = r.times.length;
  if (t <= r.times[0]) return { ...routeCell(r, 0), done: n === 1 };
  if (t >= r.times[n - 1]) return { ...routeCell(r, n - 1), done: true };
  let i = 1;
  while (i < n && r.times[i] <= t) i++;
  const a = routeCell(r, i - 1);
  const b = routeCell(r, i);
  const k = (t - r.times[i - 1]) / (r.times[i] - r.times[i - 1]);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, done: false };
}

/** Índice de la última casilla alcanzada en el instante t. */
export function reachedIndex(r: Route, t: number): number {
  let i = 0;
  while (i + 1 < r.times.length && r.times[i + 1] <= t) i++;
  return i;
}

/**
 * Dónde puede empezar una ruta nueva sin teletransportes: si está a mitad de un paso,
 * termina ese paso primero.
 */
export function nextStop(r: Route | null, at: Cell, t: number): { cell: Cell; time: number } {
  if (!r) return { cell: at, time: t };
  const i = reachedIndex(r, t);
  if (i + 1 >= r.times.length) return { cell: routeEnd(r), time: Math.max(t, routeEndTime(r)) };
  return { cell: routeCell(r, i + 1), time: r.times[i + 1] };
}

/** Recorta la ruta para que acabe al final del paso en curso (orden de parar). */
export function truncateAfterCurrent(r: Route, t: number): Route {
  const i = Math.min(reachedIndex(r, t) + 1, r.times.length - 1);
  return { cells: r.cells.slice(0, (i + 1) * 2), times: r.times.slice(0, i + 1) };
}

/** Quita lo ya recorrido, salvo la casilla de partida del paso actual. */
export function dropReached(r: Route, t: number): Route {
  const i = reachedIndex(r, t);
  if (i === 0) return r;
  return { cells: r.cells.slice(i * 2), times: r.times.slice(i) };
}

/** Lo que se enseña de la ruta ajena: el paso en curso y el siguiente, nunca el destino. */
export function routeGlimpse(r: Route, t: number): Route {
  const i = reachedIndex(r, t);
  const end = Math.min(i + 2, r.times.length - 1);
  return { cells: r.cells.slice(i * 2, (end + 1) * 2), times: r.times.slice(i, end + 1) };
}
