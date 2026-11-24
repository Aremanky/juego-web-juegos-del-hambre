import { Rng } from '@ceniza/shared';
import { findPath } from './path.js';
import { T, type TerrainId } from './terrain.js';

/**
 * Generador de arena por semilla (GDD §7.1): altura y humedad con ruido de valor por octavas, lagos en
 * las zonas bajas, pantanos donde además hay mucha humedad, roca y montaña en las altas, ríos que bajan
 * desde manantiales de montaña, puntos de interés con nombre (cada uno da nombre a su región), caminos
 * que los unen con la explanada del Obelisco y el anillo de salida limpio. Determinista: la misma
 * semilla y tamaño dan siempre el mismo mapa.
 */
export interface Cell {
  x: number;
  y: number;
}

export type PoiKind = 'obelisco' | 'ruinas' | 'poblado' | 'cueva' | 'manantial';

export interface Poi {
  id: number;
  name: string;
  kind: PoiKind;
  x: number;
  y: number;
}

export interface GameMap {
  size: number;
  tiles: Uint8Array;
  /** Altura 0–255 de cada casilla, para el relieve del mapa ilustrado. */
  heights: Uint8Array;
  center: Cell;
  /** Puntos de interés; el 0 es el Obelisco. Cada casilla pertenece a la región del más cercano. */
  pois: Poi[];
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

const NAMES: Record<Exclude<PoiKind, 'obelisco'>, readonly string[]> = {
  ruinas: ['Ruinas de la Atalaya', 'Ruinas de los Ecos', 'Ruinas de Antigua Vel', 'Ruinas de los Vigías', 'Ruinas de Sal Muerta', 'Ruinas de la Torre Hueca', 'Ruinas de los Arcos', 'Ruinas del Ocaso'],
  poblado: ['Poblado de Piedrahonda', 'Poblado de Valdeceniza', 'Poblado de los Juncos', 'Poblado de Aguasclaras', 'Poblado de la Hondonada', 'Poblado de Molinos Viejos', 'Poblado del Brezal', 'Poblado de las Eras'],
  cueva: ['Cueva del Eco', 'Cueva de los Susurros', 'Cueva Negra', 'Cueva del Lobo', 'Cueva de la Sal', 'Cueva de las Lágrimas', 'Cueva Honda', 'Cueva del Vigía'],
  manantial: ['Manantial del Norte', 'Manantial Frío', 'Manantial de la Peña', 'Manantial Escondido', 'Manantial de los Sauces', 'Manantial Amargo'],
};

/** Coste para trazar caminos: evitan el agua, las cumbres y la montaña, y aprovechan los ya hechos. */
const ROAD_COSTS = (() => {
  const c: number[] = [];
  c[T.AGUA] = 40;
  c[T.PRADERA] = 1;
  c[T.BOSQUE] = 1.6;
  c[T.DENSO] = 2.4;
  c[T.ROCA] = 2;
  c[T.MONTANA] = 6;
  c[T.CUMBRE] = 60;
  c[T.PLAZA] = 1;
  c[T.ORILLA] = 1.3;
  c[T.CAMINO] = 0.5;
  c[T.RIO] = 5;
  c[T.PANTANO] = 4;
  c[T.RUINAS] = 1;
  c[T.POBLADO] = 1;
  return c;
})();

const POI_COUNT: Record<number, number> = { 64: 6, 96: 8, 128: 10 };

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
  const heights = new Uint8Array(size * size);
  const h01 = new Float32Array(size * size);
  const c = Math.floor(size / 2);
  const plazaR = Math.max(3, Math.round(size * 0.05));
  const ringR = spawnRadius(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      // Las afueras suben un poco: la arena tiene borde de cumbres, como una cuenca.
      const rim = Math.max(0, (d / (size * 0.5) - 0.78) * 1.4);
      let h = height(x, y) * 0.92 + rim;
      const m = moist(x, y);
      let t: TerrainId;
      if (h < 0.3) t = T.AGUA;
      else if (h < 0.335) t = T.ORILLA;
      else if (h > 0.86) t = T.CUMBRE;
      else if (h > 0.74) t = T.MONTANA;
      else if (h > 0.65) t = T.ROCA;
      else if (h < 0.42 && m > 0.6) t = T.PANTANO;
      else if (m > 0.62) t = T.DENSO;
      else if (m > 0.47) t = T.BOSQUE;
      else t = T.PRADERA;
      if (d <= plazaR) {
        t = T.PLAZA;
        h = 0.5;
      } else if (d <= ringR + 1.5 && (t === T.AGUA || t === T.MONTANA || t === T.CUMBRE || t === T.ROCA || t === T.PANTANO)) {
        t = T.PRADERA;
        h = Math.min(Math.max(h, 0.4), 0.6);
      }
      const i = y * size + x;
      tiles[i] = t;
      h01[i] = h;
      heights[i] = Math.max(0, Math.min(255, Math.round(h * 230)));
    }
  }
  const map: GameMap = { size, tiles, heights, center: { x: c, y: c }, pois: [{ id: 0, name: 'Explanada del Obelisco', kind: 'obelisco', x: c, y: c }] };
  const free = (x: number, y: number) => Math.hypot(x - c, y - c) > ringR + 2;

  // ── Ríos: bajan desde manantiales de montaña por la mayor pendiente hasta un lago o el borde.
  const springs: Cell[] = [];
  const mountains: number[] = [];
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.MONTANA) mountains.push(i);
  mountains.sort((a, b) => h01[b] - h01[a] || a - b);
  const riverCount = size >= 128 ? 3 : 2;
  for (const i of mountains) {
    if (springs.length >= riverCount) break;
    const x = i % size;
    const y = Math.floor(i / size);
    if (springs.some((s) => Math.hypot(s.x - x, s.y - y) < size / 4)) continue;
    springs.push({ x, y });
  }
  const riverSources: Cell[] = [];
  for (const s of springs) {
    let x = s.x;
    let y = s.y;
    const path: number[] = [];
    for (let steps = 0; steps < size * 2; steps++) {
      const i = y * size + x;
      if (tiles[i] === T.AGUA || tiles[i] === T.PLAZA || !free(x, y)) break;
      path.push(i);
      let best = -1;
      let bestH = h01[i];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!inBounds(map, nx, ny)) continue;
          const ni = ny * size + nx;
          if (path.includes(ni)) continue;
          // Un poco de ruido rompe las mesetas sin hacer subir al río.
          const nh = h01[ni] - rng.next() * 0.004;
          if (nh < bestH) {
            bestH = nh;
            best = ni;
          }
        }
      }
      if (best < 0) {
        // Hondonada sin salida: el río acaba en una laguna.
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(map, x + dx, y + dy) && free(x + dx, y + dy)) tiles[(y + dy) * size + x + dx] = T.AGUA;
        break;
      }
      x = best % size;
      y = Math.floor(best / size);
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) break;
    }
    if (path.length >= 6) {
      for (const i of path) if (tiles[i] !== T.AGUA) tiles[i] = T.RIO;
      riverSources.push({ x: path[0] % size, y: Math.floor(path[0] / size) });
    }
  }

  // ── Puntos de interés: muestreo con distancia mínima (tipo Poisson) sobre tierra firme.
  const used = { ruinas: 0, poblado: 0, cueva: 0, manantial: 0 };
  // Cada semilla empieza la lista de nombres por un sitio distinto; si se agota, se numera.
  const offset = { ruinas: rng.int(0, 7), poblado: rng.int(0, 7), cueva: rng.int(0, 7), manantial: rng.int(0, 5) };
  const nameOf = (kind: Exclude<PoiKind, 'obelisco'>) => {
    const list = NAMES[kind];
    const k = used[kind]++;
    const base = list[(k + offset[kind]) % list.length];
    return k < list.length ? base : `${base} ${['II', 'III', 'IV', 'V'][Math.floor(k / list.length) - 1] ?? k}`;
  };
  for (const s of riverSources) map.pois.push({ id: map.pois.length, name: nameOf('manantial'), kind: 'manantial', x: s.x, y: s.y });
  const target = map.pois.length + (POI_COUNT[size] ?? Math.round(size / 13));
  const minDist = size / 5.5;
  for (let tries = 0; tries < 4000 && map.pois.length < target; tries++) {
    const x = rng.int(3, size - 4);
    const y = rng.int(3, size - 4);
    const t = tiles[y * size + x];
    if (t === T.AGUA || t === T.RIO || t === T.CUMBRE || t === T.PLAZA || !free(x, y) || Math.hypot(x - c, y - c) < plazaR + 7) continue;
    if (map.pois.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)) continue;
    let kind: Exclude<PoiKind, 'obelisco' | 'manantial'>;
    if (t === T.MONTANA || t === T.ROCA) kind = 'cueva';
    else if (t === T.BOSQUE || t === T.DENSO || t === T.PANTANO) kind = 'ruinas';
    else kind = rng.chance(0.55) ? 'poblado' : 'ruinas';
    map.pois.push({ id: map.pois.length, name: nameOf(kind), kind, x, y });
    const stamp = kind === 'ruinas' ? T.RUINAS : kind === 'poblado' ? T.POBLADO : null;
    if (stamp !== null) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (kind === 'poblado' && dx && dy) continue; // en cruz
          const nx = x + dx;
          const ny = y + dy;
          const nt = tiles[ny * size + nx];
          if (nt !== T.AGUA && nt !== T.RIO && nt !== T.CUMBRE) tiles[ny * size + nx] = stamp;
        }
      }
    }
  }

  // ── Caminos desde la explanada hasta poblados y ruinas; los cruces con ríos son vados.
  const dest = map.pois.filter((p) => p.kind === 'poblado' || p.kind === 'ruinas').sort((a, b) => Math.hypot(a.x - c, a.y - c) - Math.hypot(b.x - c, b.y - c));
  for (const p of dest) {
    const path = findPath(map, { x: c, y: c }, { x: p.x, y: p.y }, 60_000, ROAD_COSTS);
    if (!path) continue;
    for (const cell of path) {
      const i = cell.y * size + cell.x;
      const t = tiles[i];
      if (t === T.PLAZA || t === T.RUINAS || t === T.POBLADO || t === T.AGUA || t === T.CUMBRE) continue;
      tiles[i] = T.CAMINO;
    }
  }
  return map;
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

// ------------------------------------------------------------------ regiones
const regionCache = new WeakMap<GameMap, Uint8Array>();

/** Región de cada casilla: la del punto de interés más cercano (empate: el de id menor). */
export function regionGrid(map: GameMap): Uint8Array {
  let g = regionCache.get(map);
  if (g) return g;
  g = new Uint8Array(map.size * map.size);
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      let best = 0;
      let bestD = Infinity;
      for (const p of map.pois) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p.id;
        }
      }
      g[y * map.size + x] = best;
    }
  }
  regionCache.set(map, g);
  return g;
}

export function regionAt(map: GameMap, x: number, y: number): number {
  if (!map.pois.length) return 0;
  const cx = Math.min(map.size - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(map.size - 1, Math.max(0, Math.round(y)));
  return regionGrid(map)[cy * map.size + cx];
}

/** Alturas aproximadas a partir del terreno, para partidas guardadas antes de la fase 7. */
export function heightsFromTiles(tiles: Uint8Array): Uint8Array {
  const byTile = [60, 110, 120, 125, 160, 185, 215, 115, 80, 110, 70, 90, 115, 110];
  return Uint8Array.from(tiles, (t) => byTile[t] ?? 110);
}
