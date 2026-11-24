import { describe, expect, it } from 'vitest';
import { fogRects } from './fog';

/** Cuántas veces cubren los rectángulos cada píxel de una pantalla pequeña. */
function coverage(rects: readonly (readonly [number, number, number, number])[], W: number, H: number) {
  const n = new Array(W * H).fill(0);
  for (const [x, y, w, h] of rects) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) n[j * W + i]++;
  return n;
}

describe('niebla alrededor del recorte', () => {
  it('cubre una vez todo lo que queda fuera del cuadrado del recorte, y nada de dentro', () => {
    for (const [X, Y, R] of [[20, 15, 6], [2, 3, 6], [38, 28, 6], [-10, 15, 6], [20, 15, 40]] as const) {
      const W = 40;
      const H = 30;
      const n = coverage(fogRects(X, Y, R, W, H), W, H);
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const inside = i >= X - R && i < X + R && j >= Y - R && j < Y + R;
          expect(n[j * W + i], `${X},${Y},${R} en ${i},${j}`).toBe(inside ? 0 : 1);
        }
    }
  });

  it('sin rectángulos vacíos', () => {
    for (const r of fogRects(20, 15, 40, 40, 30)) expect(r[2] > 0 && r[3] > 0).toBe(true);
  });
});
