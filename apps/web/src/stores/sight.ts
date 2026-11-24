/**
 * Lo que el cliente recuerda de lo que ha visto (GDD §7.4). Con niebla, quien sale de tu vista deja una
 * marca donde lo viste por última vez; el servidor no manda nada nuevo, así que no puede delatar a nadie.
 */
import type { ActorView } from '@ceniza/shared';

export interface LastSeen {
  x: number;
  y: number;
  /** Hora de partida (ms) en que dejó de verse. */
  at: number;
}

/**
 * Marcas tras un cambio de vista: se guarda la posición interpolada de quien deja de verse; se borra la de
 * quien vuelve a verse o cae (eso lo sabe toda la arena). Sin cambios devuelve el mismo objeto.
 */
export function trackSight(
  prev: Readonly<Record<string, LastSeen>>,
  before: Readonly<Record<string, ActorView>>,
  after: Readonly<Record<string, ActorView>>,
  at: number,
  posOf: (a: ActorView) => { x: number; y: number },
): Record<string, LastSeen> {
  let next: Record<string, LastSeen> | null = null;
  for (const id in after) {
    const a = after[id];
    const b = before[id];
    if (!a.alive || a.seen) {
      if (id in (next ?? prev)) delete (next ??= { ...prev })[id];
    } else if (b && b.alive && b.seen) {
      const p = posOf(b);
      (next ??= { ...prev })[id] = { x: p.x, y: p.y, at };
    }
  }
  return next ?? prev;
}

/** Hora (local) a la que cada uno cayó delante de ti, para animar la caída. Quien ya estaba caído no se anima. */
export function trackFalls(
  prev: Readonly<Record<string, number>>,
  before: Readonly<Record<string, ActorView>>,
  after: Readonly<Record<string, ActorView>>,
  at: number,
): Record<string, number> {
  let next: Record<string, number> | null = null;
  for (const id in after) if (before[id]?.alive && !after[id].alive && !(id in prev)) (next ??= { ...prev })[id] = at;
  return next ?? prev;
}
