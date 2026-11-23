/**
 * Genera las curvas de nivel del fondo de la vista previa del marcador
 * (apps/web/src/assets/contornos.svg): ruido de valor con semilla y marching squares,
 * en el «modo holograma» del mapa (GDD §1). Uso: npx tsx tools/contours.ts
 */
import { writeFileSync } from 'node:fs';
import { Rng } from '../packages/shared/src/util/rng.js';

const W = 300;
const H = 120;
const CELL = 4; // px por celda de la rejilla
const GX = W / CELL + 1;
const GY = H / CELL + 1;
const rng = new Rng('contornos-vista-previa');

// Ruido de valor por octavas, interpolado con suavizado cúbico.
function lattice(n: number) {
  return Array.from({ length: n * n }, () => rng.next());
}
const OCT = [
  { f: 1 / 70, a: 1, g: lattice(16) },
  { f: 1 / 32, a: 0.45, g: lattice(32) },
  { f: 1 / 14, a: 0.16, g: lattice(64) },
];
function vnoise(x: number, y: number, g: number[], n: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const at = (i: number, j: number) => g[((j % n) + n) % n * n + (((i % n) + n) % n)]!;
  const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * s(tx);
  const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * s(tx);
  return a + (b - a) * s(ty);
}
const field: number[][] = [];
for (let j = 0; j < GY; j++) {
  field.push([]);
  for (let i = 0; i < GX; i++) {
    const x = i * CELL;
    const y = j * CELL;
    let v = 0;
    let norm = 0;
    for (const o of OCT) {
      const n = Math.sqrt(o.g.length);
      v += vnoise(x * o.f, y * o.f, o.g, n) * o.a;
      norm += o.a;
    }
    field[j]!.push(v / norm);
  }
}

type P = [number, number];
const key = (p: P) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

function contour(level: number): P[][] {
  const segs: [P, P][] = [];
  const lerp = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < GY - 1; j++) {
    for (let i = 0; i < GX - 1; i++) {
      const tl = field[j]![i]!;
      const tr = field[j]![i + 1]!;
      const br = field[j + 1]![i + 1]!;
      const bl = field[j + 1]![i]!;
      const x = i * CELL;
      const y = j * CELL;
      const top: P = [x + lerp(tl, tr) * CELL, y];
      const right: P = [x + CELL, y + lerp(tr, br) * CELL];
      const bottom: P = [x + lerp(bl, br) * CELL, y + CELL];
      const left: P = [x, y + lerp(tl, bl) * CELL];
      const c = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      const table: Record<number, [P, P][]> = {
        1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]],
        5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]],
        9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[top, right]], 12: [[left, right]],
        13: [[bottom, right]], 14: [[left, bottom]],
      };
      for (const s of table[c] ?? []) segs.push(s);
    }
  }
  // Encadenar segmentos en polilíneas.
  const ends = new Map<string, number[]>();
  segs.forEach(([a, b], idx) => {
    for (const p of [a, b]) {
      const k = key(p);
      ends.set(k, [...(ends.get(k) ?? []), idx]);
    }
  });
  const used = new Set<number>();
  const lines: P[][] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    const line: P[] = [segs[s]![0], segs[s]![1]];
    for (const dir of [1, -1]) {
      for (;;) {
        const tip = dir === 1 ? line[line.length - 1]! : line[0]!;
        const next = (ends.get(key(tip)) ?? []).find((n) => !used.has(n));
        if (next === undefined) break;
        used.add(next);
        const [a, b] = segs[next]!;
        const p = key(a) === key(tip) ? b : a;
        if (dir === 1) line.push(p);
        else line.unshift(p);
      }
    }
    if (line.length > 9) lines.push(line); // fuera islas diminutas: al simplificarse parecen triángulos
  }
  return lines;
}

const r1 = (n: number) => (Math.round(n * 10) / 10).toString();
const paths: string[] = [];
const LEVELS = 11;
for (let l = 0; l < LEVELS; l++) {
  const level = 0.3 + (l / (LEVELS - 1)) * 0.42;
  const index = l % 4 === 0; // curva maestra
  const d = contour(level)
    .map((pts) => 'M' + pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1).map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L'))
    .join('');
  if (d) paths.push(`<path d="${d}" stroke-opacity="${index ? 0.5 : 0.24}" stroke-width="${index ? 1.1 : 0.8}"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="#5fe3d0" stroke-linejoin="round" stroke-linecap="round">${paths.join('')}</g></svg>`;
writeFileSync(new URL('../apps/web/src/assets/contornos.svg', import.meta.url), svg);
console.log('contornos.svg', (svg.length / 1024).toFixed(1) + ' KB', paths.length, 'curvas');
