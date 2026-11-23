import { Rng } from '@ceniza/shared';
import { T, type TerrainId } from './terrain.js';

/**
 * Generador básico de arena por semilla (GDD §7.1): altura y humedad con ruido de valor por octavas,
 * lagos en las zonas bajas, roca y montaña en las altas, bosque según humedad y la explanada del
 * Obelisco en el centro. Determinista: la misma semilla y tamaño dan siempre el mismo mapa.
 */
export interface Cell {
  x: number;
  y: number;
}

export interface GameMap {
  size: number;
  tiles: Uint8Array;
  center: Cell;
}

export const MAP_SIZES = { pequeno: 64, mediano: 96, grande: 128 } as const;

export function tileAt(map: GameMap, x: number, y: number): TerrainId {
  return map.tiles[y * map.size + x] as TerrainId;
}

export function inBounds(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.size && y < map.size;
}

function noiseLayer(rng: Rng, cells: number) {
  const n = cells + 1;
  const g = Float64Array.from({ length: n * n }, () => rng.next());
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = x - xi;
    const ty = y - yi;
    const s = (t: number) => t * t * (3 - 2 * t);
    const at = (i: number, j: number) => g[Math.min(j, n - 1) * n + Math.min(i, n - 1)];
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * s(tx);
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * s(tx);
    return a + (b - a) * s(ty);
  };
}

function fractal(rng: Rng, size: number, octaves: [number, number][]) {
  const layers = octaves.map(([cellPx, amp]) => ({ f: noiseLayer(rng, Math.ceil(size / cellPx) + 1), cellPx, amp }));
  const norm = octaves.reduce((s, [, a]) => s + a, 0);
  return (x: number, y: number) => layers.reduce((v, l) => v + l.f(x / l.cellPx, y / l.cellPx) * l.amp, 0) / norm;
}

export function generateMap(seed: string, size: number): GameMap {
  const rng = new Rng('mapa:' + seed);
  const height = fractal(rng, size, [
    [size / 3, 1],
    [size / 7, 0.5],
    [6, 0.22],
  ]);
  const moist = fractal(rng, size, [
    [size / 4, 1],
    [9, 0.4],
  ]);
  const tiles = new Uint8Array(size * size);
  const c = Math.floor(size / 2);
  const plazaR = Math.max(3, Math.round(size * 0.05));
  const ringR = spawnRadius(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      // Las afueras suben un poco: la arena tiene borde de cumbres, como una cuenca.
      const rim = Math.max(0, (d / (size * 0.5) - 0.78) * 1.4);
      const h = height(x, y) * 0.92 + rim;
      const m = moist(x, y);
      let t: TerrainId;
      if (h < 0.3) t = T.AGUA;
      else if (h < 0.335) t = T.ORILLA;
      else if (h > 0.86) t = T.CUMBRE;
      else if (h > 0.74) t = T.MONTANA;
      else if (h > 0.65) t = T.ROCA;
      else if (m > 0.62) t = T.DENSO;
      else if (m > 0.47) t = T.BOSQUE;
      else t = T.PRADERA;
      if (d <= plazaR) t = T.PLAZA;
      else if (d <= ringR + 1.5 && (t === T.AGUA || t === T.MONTANA || t === T.CUMBRE || t === T.ROCA)) t = T.PRADERA;
      tiles[y * size + x] = t;
    }
  }
  return { size, tiles, center: { x: c, y: c } };
}

/** Radio del anillo de salida alrededor del Obelisco (GDD §2, cuenta atrás). */
export function spawnRadius(size: number): number {
  return Math.max(5, Math.round(size * 0.07));
}

/** Casillas de salida en anillo, repartidas por igual y sin repetir. */
export function spawnRing(map: GameMap, count: number): Cell[] {
  const r = spawnRadius(map.size);
  const out: Cell[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
    let x = Math.round(map.center.x + Math.cos(a) * r);
    let y = Math.round(map.center.y + Math.sin(a) * r);
    while (seen.has(`${x},${y}`)) x += 1;
    seen.add(`${x},${y}`);
    out.push({ x, y });
  }
  return out;
}
