/** Rumbo de un personaje en el mapa (GDD §5.9): ocho, con la y creciendo hacia el sur. */
export type Facing = 'S' | 'SE' | 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW';

const BY_OCTANT: readonly Facing[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/** Rumbo del movimiento (dx, dy) en sectores de 45°. Quieto, conserva el que tenía. */
export function facingOf(dx: number, dy: number, prev: Facing): Facing {
  if (Math.hypot(dx, dy) < 0.01) return prev;
  const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return BY_OCTANT[(k + 8) % 8];
}
