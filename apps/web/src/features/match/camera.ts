import { TILE } from './art/terrain';

/**
 * Escala del mapa en reposo: la de un número entero de píxeles reales por casilla, la más cercana dentro de
 * [lo, hi]. Así los bloques del terreno se copian sin escalar, que en Chrome sin GPU era lo que más costaba de
 * cada fotograma (medido en la fase 7). Si ningún entero cabe entre los límites, la escala no cambia.
 */
export function snapScale(scale: number, dpr: number, lo: number, hi: number): number {
  const unit = TILE * dpr;
  const near = Math.round(scale * unit);
  for (const n of [near, near + 1, near - 1]) {
    const s = n / unit;
    if (n > 0 && s >= lo - 1e-9 && s <= hi + 1e-9) return s;
  }
  return scale;
}
