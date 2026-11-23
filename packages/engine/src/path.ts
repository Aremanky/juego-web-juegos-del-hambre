import { inBounds, tileAt, type Cell, type GameMap } from './map.js';
import { terrainCost } from './terrain.js';

/**
 * A* con 8 vecinos y coste de terreno (GDD §3: «el servidor calcula la ruta»).
 * El coste de un paso es la distancia (1 o √2) por el coste de la casilla de destino.
 * Devuelve las casillas tras el origen (sin incluirlo), o null si no hay ruta.
 */
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

class Heap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, p: number) {
    const a = this.items;
    const q = this.prio;
    a.push(item);
    q.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (q[parent] <= q[i]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      [q[parent], q[i]] = [q[i], q[parent]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items;
    const q = this.prio;
    const top = a[0];
    const lastItem = a.pop()!;
    const lastPrio = q.pop()!;
    if (a.length) {
      a[0] = lastItem;
      q[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && q[l] < q[m]) m = l;
        if (r < a.length && q[r] < q[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [q[m], q[i]] = [q[i], q[m]];
        i = m;
      }
    }
    return top;
  }
}

export function stepCost(map: GameMap, to: Cell, diagonal: boolean): number {
  return (diagonal ? Math.SQRT2 : 1) * terrainCost(tileAt(map, to.x, to.y));
}

export function findPath(map: GameMap, from: Cell, to: Cell, maxExpanded = 30_000): Cell[] | null {
  if (!inBounds(map, to.x, to.y) || !inBounds(map, from.x, from.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const n = map.size;
  const start = from.y * n + from.x;
  const goal = to.y * n + to.x;
  const g = new Float64Array(n * n).fill(Infinity);
  const came = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  const h = (i: number) => {
    const dx = Math.abs((i % n) - to.x);
    const dy = Math.abs(Math.floor(i / n) - to.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const open = new Heap();
  g[start] = 0;
  open.push(start, h(start));
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expanded > maxExpanded) return null;
    const cx = cur % n;
    const cy = Math.floor(cur / n);
    for (const [dx, dy, dist] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const ni = ny * n + nx;
      if (closed[ni]) continue;
      const cost = g[cur] + dist * terrainCost(map.tiles[ni]);
      if (cost < g[ni]) {
        g[ni] = cost;
        came[ni] = cur;
        open.push(ni, cost + h(ni));
      }
    }
  }
  if (came[goal] === -1) return null;
  const path: Cell[] = [];
  for (let i = goal; i !== start; i = came[i]) path.push({ x: i % n, y: Math.floor(i / n) });
  return path.reverse();
}
