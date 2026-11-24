/**
 * Marching squares: segmentos de la isolínea `level` sobre una rejilla de muestras `w × h` (fila a fila),
 * con la muestra (i, j) en (x0 + i·step, y0 + j·step). Devuelve [x1, y1, x2, y2, …] en esas unidades.
 * Sirve para costas suaves y curvas de nivel sin escalones de casilla.
 */
export function isoSegments(v: Float32Array, w: number, h: number, level: number, x0: number, y0: number, step: number, out: number[] = []): number[] {
  const t = (p: number, q: number) => (q === p ? 0.5 : (level - p) / (q - p));
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = v[j * w + i];
      const b = v[j * w + i + 1];
      const c = v[(j + 1) * w + i + 1];
      const d = v[(j + 1) * w + i];
      const code = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const x = x0 + i * step;
      const y = y0 + j * step;
      const top = [x + t(a, b) * step, y];
      const right = [x + step, y + t(b, c) * step];
      const bottom = [x + t(d, c) * step, y + step];
      const left = [x, y + t(a, d) * step];
      const seg = (p: number[], q: number[]) => out.push(p[0], p[1], q[0], q[1]);
      const center = (a + b + c + d) / 4 >= level;
      switch (code) {
        case 1: case 14: seg(left, bottom); break;
        case 2: case 13: seg(bottom, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(top, right); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, top); break;
        case 5:
          if (center) { seg(left, top); seg(bottom, right); } else { seg(left, bottom); seg(top, right); }
          break;
        case 10:
          if (center) { seg(top, right); seg(left, bottom); } else { seg(left, top); seg(bottom, right); }
          break;
      }
    }
  }
  return out;
}

/** Suavizado de Chaikin para recorridos de casilla a casilla (ríos y caminos). */
export function chaikin(pts: number[], rounds = 2): number[] {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    if (p.length < 6) return p;
    const q: number[] = [p[0], p[1]];
    for (let i = 0; i + 3 < p.length; i += 2) {
      const [x0, y0, x1, y1] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
      q.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
    }
    q.push(p[p.length - 2], p[p.length - 1]);
    p = q;
  }
  return p;
}
