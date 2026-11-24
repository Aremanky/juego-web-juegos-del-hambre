import { describe, expect, it } from 'vitest';
import { TILE } from './art/terrain';
import { snapScale } from './camera';

/** Píxeles reales por casilla con esa escala y densidad. */
const px = (scale: number, dpr: number) => scale * TILE * dpr;

describe('zoom en reposo', () => {
  it('queda en un número entero de píxeles reales por casilla, el más cercano', () => {
    expect(px(snapScale(25.6 / TILE, 1, 0.1, 6), 1)).toBeCloseTo(26, 9);
    expect(px(snapScale(13.73 / TILE, 2, 0.1, 6), 2)).toBeCloseTo(27, 9);
    expect(px(snapScale(24 / TILE, 1, 0.1, 6), 1)).toBeCloseTo(24, 9);
  });

  it('sin salirse de los límites: si el entero cercano se sale, el de dentro', () => {
    // Límite inferior de 25,4 px: 25 se sale, vale 26.
    expect(px(snapScale(25.45 / TILE, 1, 25.4 / TILE, 6), 1)).toBeCloseTo(26, 9);
    // Límite superior de 30,6 px: 31 se sale, vale 30.
    expect(px(snapScale(30.6 / TILE, 1, 0.1, 30.6 / TILE), 1)).toBeCloseTo(30, 9);
  });

  it('si no cabe ningún entero entre los límites, se queda como está', () => {
    expect(snapScale(25.5 / TILE, 1, 25.2 / TILE, 25.8 / TILE)).toBe(25.5 / TILE);
  });
});
