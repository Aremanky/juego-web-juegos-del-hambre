/**
 * Vista previa de una orden de ir (GDD §7.5): la ruta y el tiempo antes de moverse. Sale de `planRoute`, la
 * misma cuenta que hace el servidor, con la velocidad y los costes que este manda solo al propio jugador.
 */
import { planRoute, type Cell, type GameMap } from '@ceniza/engine';
import type { ActorView, RouteDTO } from '@ceniza/shared';

const NB = ' ';

/** Duración en español sin partir número y unidad: «25 s», «1 min 20 s», «2 min». */
export function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}${NB}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}${NB}min ${r}${NB}s` : `${m}${NB}min`;
}

export const formatEta = (ms: number): string => `≈${NB}${formatDuration(ms)}`;

export type Preview =
  | { x: number; y: number; route: RouteDTO | null; eta: number; cells: number; error: null }
  | { x: number; y: number; route: null; eta: null; cells: null; error: string };

/** Lo que haría ir a `to` ahora. Sin personaje propio vivo (o sin datos de movimiento), nada. */
export function previewFor(map: GameMap, me: ActorView | null, to: Cell, now: number): Preview | null {
  if (!me || !me.alive || !me.move) return null;
  const plan = planRoute(map, { x: me.x, y: me.y, route: me.route }, to, now, me.move.speed, me.move.costs);
  if (!plan.ok) return { x: to.x, y: to.y, route: null, eta: null, cells: null, error: plan.error };
  return { x: to.x, y: to.y, route: plan.route, eta: plan.arrival - now, cells: plan.route ? plan.route.times.length - 1 : 0, error: null };
}

/** Lo que dura una vista previa táctil sin tocar nada. */
export const TAP_PREVIEW_MS = 8_000;

export type TapState = { cell: Cell; at: number } | null;
export type TapEvent = { type: 'tap'; cell: Cell; at: number } | { type: 'tick'; at: number } | { type: 'go' } | { type: 'cancel' };

/**
 * Con el dedo: el primer toque enseña la ruta y el tiempo; el segundo en la misma casilla (o el botón «Ir»)
 * va. Otro toque mueve la vista previa, que caduca sola.
 */
export function tapPreview(s: TapState, e: TapEvent): { state: TapState; go: Cell | null } {
  const fresh = (at: number) => !!s && at - s.at <= TAP_PREVIEW_MS;
  switch (e.type) {
    case 'tap':
      if (s && fresh(e.at) && s.cell.x === e.cell.x && s.cell.y === e.cell.y) return { state: null, go: s.cell };
      return { state: { cell: e.cell, at: e.at }, go: null };
    case 'tick':
      return { state: s && !fresh(e.at) ? null : s, go: null };
    case 'go':
      return { state: null, go: s ? s.cell : null };
    case 'cancel':
      return { state: null, go: null };
  }
}
