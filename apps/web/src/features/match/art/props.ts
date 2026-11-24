import { T } from '@ceniza/engine';
import type { PoiDTO } from '@ceniza/shared';
import { hash } from './noise';

/**
 * Objetos del mapa (árboles, rocas, montañas, casas, ruinas…). Se reparten de forma determinista a partir
 * de la semilla, con posiciones sueltas dentro de cada casilla (nada de un objeto en el centro de cada una),
 * y se dibujan en coordenadas de casilla con la misma luz para todos: del noroeste, sombra hacia el sureste.
 * Si hay hoja de sprites de SpriteCook se usa; si no, cada objeto tiene su dibujo vectorial.
 */
export type PropKind = 'tree' | 'conifer' | 'deadtree' | 'bush' | 'rock' | 'crag' | 'peak' | 'reeds' | 'house' | 'ruin' | 'cave' | 'spring' | 'well' | 'brazier';

export interface Prop {
  kind: PropKind;
  /** Punto de apoyo en casillas (centro de la base). */
  x: number;
  y: number;
  /** Ancho en casillas. */
  w: number;
  /** Variante (elige sprite o forma). */
  v: number;
  /** 0–1: variación de color. */
  tone: number;
  /** 0–1: con poco zoom solo se dibujan los de rango bajo. */
  rank: number;
}

export interface Light {
  x: number;
  y: number;
  kind: 'ventana' | 'fuego';
}

export const VARIANTS: Record<PropKind, number> = { tree: 4, conifer: 2, deadtree: 1, bush: 2, rock: 3, crag: 2, peak: 1, reeds: 1, house: 4, ruin: 3, cave: 1, spring: 1, well: 1, brazier: 1 };

/** Alto aproximado (en anchos) de cada tipo: para saber qué bloques toca. */
export const TALL: Record<PropKind, number> = { tree: 1.35, conifer: 2, deadtree: 1.6, bush: 0.8, rock: 0.7, crag: 0.95, peak: 1.05, reeds: 1.1, house: 1, ruin: 0.8, cave: 0.8, spring: 0.6, well: 1.2, brazier: 1.5 };

interface PropMap {
  size: number;
  tiles: Uint8Array;
  heights: Uint8Array;
  pois: PoiDTO[];
  center: { x: number; y: number };
}

export function buildProps(m: PropMap, seed: number): { props: Prop[]; lights: Light[] } {
  const { size, tiles, heights } = m;
  const props: Prop[] = [];
  const lights: Light[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? -1 : tiles[y * size + x]);
  const near = (x: number, y: number, t: number) => at(x - 1, y) === t || at(x + 1, y) === t || at(x, y - 1) === t || at(x, y + 1) === t;
  const add = (kind: PropKind, x: number, y: number, w: number, k: number) =>
    props.push({ kind, x, y, w, v: Math.floor(hash(x * 97, y * 89, seed + k) * VARIANTS[kind]), tone: hash(x * 13, y * 7, seed + k + 3), rank: hash(x * 31, y * 17, seed + k + 5) });

  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      const t = tiles[ty * size + tx];
      const r = (k: number) => hash(tx, ty, seed + k * 101);
      const jx = (k: number) => tx + 0.15 + r(k) * 0.7;
      const jy = (k: number) => ty + 0.2 + r(k + 50) * 0.7;
      const high = heights[ty * size + tx] > 150;
      if (t === T.BOSQUE || t === T.DENSO) {
        const n = t === T.DENSO ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const conifer = high ? r(k + 9) < 0.7 : r(k + 9) < (t === T.DENSO ? 0.25 : 0.12);
          add(conifer ? 'conifer' : 'tree', jx(k), jy(k), (conifer ? 0.8 : 1.05) + r(k + 20) * 0.45 + (t === T.DENSO ? 0.15 : 0), k);
        }
        if (r(30) < 0.25) add('bush', jx(31), jy(31), 0.45 + r(32) * 0.2, 31);
      } else if (t === T.PRADERA) {
        const v = r(1);
        if (v < 0.035) add('tree', jx(2), jy(2), 1 + r(3) * 0.4, 2);
        else if (v < 0.09) add('bush', jx(2), jy(2), 0.42 + r(3) * 0.22, 2);
        else if (v < 0.105) add('rock', jx(2), jy(2), 0.35 + r(3) * 0.2, 2);
      } else if (t === T.ORILLA) {
        if (near(tx, ty, T.AGUA) && r(1) < 0.22) add('reeds', jx(2), jy(2), 0.5 + r(3) * 0.2, 2);
        else if (r(1) > 0.96) add('rock', jx(2), jy(2), 0.3 + r(3) * 0.2, 2);
      } else if (t === T.ROCA) {
        if (r(1) < 0.4) add('rock', jx(2), jy(2), 0.4 + r(3) * 0.35, 2);
        else if (r(1) > 0.95) add('deadtree', jx(2), jy(2), 0.75 + r(3) * 0.3, 2);
      } else if (t === T.MONTANA || t === T.CUMBRE) {
        // Macizos, no una alfombra de conos: un pico cada dos casillas en una rejilla escalonada, más grande
        // cuanto más alto (con nieve solo en lo más alto) y colinas pequeñas en la falda.
        const onGrid = ty % 2 === 0 && (tx + (ty % 4 === 0 ? 0 : 1)) % 2 === 0;
        const k = Math.min(1, Math.max(0, (heights[ty * size + tx] / 255 - 0.74) / 0.2));
        const rock = (x: number, y: number) => { const n = at(x, y); return n === T.MONTANA || n === T.CUMBRE; };
        const edge = !rock(tx - 1, ty) || !rock(tx + 1, ty) || !rock(tx, ty - 1) || !rock(tx, ty + 1);
        if (onGrid) {
          const w = edge ? 1.15 + r(3) * 0.45 : 1.7 + k * 1.7 + r(3) * 0.5;
          add(t === T.CUMBRE || k > 0.8 ? 'peak' : 'crag', tx + 0.5 + (r(5) - 0.5) * 0.9, ty + 0.85 + (r(4) - 0.5) * 0.5, w, 2);
        } else if (r(1) < 0.16) add('rock', jx(2), jy(2), 0.3 + r(3) * 0.3, 2);
      } else if (t === T.PANTANO) {
        if (r(1) < 0.4) add('reeds', jx(2), jy(2), 0.5 + r(3) * 0.25, 2);
        else if (r(1) > 0.93) add('deadtree', jx(2), jy(2), 0.7 + r(3) * 0.3, 2);
      } else if (t === T.RUINAS) {
        if (r(1) < 0.3) add('rock', jx(2), jy(2), 0.3 + r(3) * 0.25, 2);
      }
    }
  }

  // Puntos de interés: cada uno con su construcción.
  for (const p of m.pois) {
    const cx = p.x + 0.5;
    const cy = p.y + 0.5;
    const v = (n: number) => p.id % n;
    if (p.kind === 'poblado') {
      props.push({ kind: 'well', x: cx, y: cy + 0.25, w: 0.75, v: 0, tone: 0.5, rank: 0 });
      const arms: [number, number][] = [[0, -1], [-1, 0], [1, 0], [0, 1]];
      arms.forEach(([dx, dy], k) => {
        if (at(p.x + dx, p.y + dy) !== T.POBLADO) return;
        const hx = cx + dx * 1.15;
        const hy = cy + dy * 1.1 + 0.42;
        props.push({ kind: 'house', x: hx, y: hy, w: 1.45 + hash(p.id, k, seed) * 0.35, v: (p.id + k) % VARIANTS.house, tone: hash(k, p.id, seed + 1), rank: 0 });
        lights.push({ x: hx + 0.18, y: hy - 0.3, kind: 'ventana' });
      });
    } else if (p.kind === 'ruinas') {
      props.push({ kind: 'ruin', x: cx, y: cy + 0.55, w: 2.1 + hash(p.id, 1, seed) * 0.4, v: v(VARIANTS.ruin), tone: 0.5, rank: 0 });
    } else if (p.kind === 'cueva') {
      props.push({ kind: 'cave', x: cx, y: cy + 0.5, w: 1.7, v: 0, tone: 0.5, rank: 0 });
    } else if (p.kind === 'manantial') {
      props.push({ kind: 'spring', x: cx, y: cy + 0.3, w: 1, v: 0, tone: 0.5, rank: 0 });
    }
  }

  // Braseros en el borde de la explanada del Obelisco.
  const c = m.center;
  let rad = 0;
  while (at(c.x + rad + 1, c.y) === T.PLAZA) rad++;
  if (rad >= 2) {
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bx = c.x + 0.5 + dx * (rad - 0.6) * 0.72;
      const by = c.y + 0.5 + dy * (rad - 0.6) * 0.72 + 0.3;
      props.push({ kind: 'brazier', x: bx, y: by, w: 0.42, v: 0, tone: 0.5, rank: 0 });
      lights.push({ x: bx, y: by - 0.5, kind: 'fuego' });
    }
  }
  props.sort((a, b) => a.y - b.y);
  return { props, lights };
}

// ───────────────────────── Dibujo vectorial (sin sprites) ─────────────────────────

const mix = (a: [number, number, number], b: [number, number, number], t: number) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.moveTo(x + r, y);
  g.arc(x, y, r, 0, Math.PI * 2);
}

function tree(g: CanvasRenderingContext2D, p: Prop) {
  const r = p.w / 2;
  const cy = p.y - r * 1.05;
  g.fillStyle = '#3d2c1e';
  g.fillRect(p.x - r * 0.1, p.y - r * 0.75, r * 0.2, r * 0.75);
  const n = 3 + (p.v % 2);
  const offs: [number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + p.v;
    offs.push([Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.3, r * (0.55 + hash(k, p.v, 7) * 0.15)]);
  }
  const dark = mix([30, 48, 28], [52, 70, 36], p.tone);
  const mid = mix([52, 78, 40], [86, 104, 52], p.tone);
  const lit = mix([96, 124, 64], [138, 150, 84], p.tone);
  g.fillStyle = dark;
  g.beginPath();
  for (const [ox, oy, rr] of offs) blob(g, p.x + ox, cy + oy, rr);
  g.fill();
  g.fillStyle = mid;
  g.beginPath();
  for (const [ox, oy, rr] of offs) blob(g, p.x + ox - rr * 0.16, cy + oy - rr * 0.2, rr * 0.8);
  g.fill();
  g.fillStyle = lit;
  g.globalAlpha = 0.75;
  g.beginPath();
  for (const [ox, oy, rr] of offs) blob(g, p.x + ox - rr * 0.34, cy + oy - rr * 0.4, rr * 0.36);
  g.fill();
  g.globalAlpha = 1;
}

function conifer(g: CanvasRenderingContext2D, p: Prop) {
  const w = p.w;
  const h = w * 1.9;
  g.fillStyle = '#3a2a1c';
  g.fillRect(p.x - w * 0.06, p.y - h * 0.16, w * 0.12, h * 0.16);
  for (let k = 0; k < 3; k++) {
    const top = p.y - h + k * h * 0.24;
    const bot = p.y - h * 0.12 - (2 - k) * h * 0.13;
    const half = (w / 2) * (0.62 + k * 0.19);
    g.fillStyle = mix([46, 74, 46], [64, 92, 56], p.tone);
    g.beginPath();
    g.moveTo(p.x, top);
    g.lineTo(p.x - half, bot);
    g.lineTo(p.x, bot - h * 0.03);
    g.fill();
    g.fillStyle = mix([24, 44, 30], [34, 56, 36], p.tone);
    g.beginPath();
    g.moveTo(p.x, top);
    g.lineTo(p.x + half, bot);
    g.lineTo(p.x, bot - h * 0.03);
    g.fill();
  }
}

function deadtree(g: CanvasRenderingContext2D, p: Prop) {
  const h = p.w * 1.5;
  g.strokeStyle = '#6f685d';
  g.lineCap = 'round';
  g.lineWidth = p.w * 0.1;
  g.beginPath();
  g.moveTo(p.x, p.y);
  g.lineTo(p.x + p.w * 0.04, p.y - h * 0.7);
  g.stroke();
  g.lineWidth = p.w * 0.05;
  g.beginPath();
  for (let k = 0; k < 4; k++) {
    const by = p.y - h * (0.35 + k * 0.15);
    const dir = k % 2 ? 1 : -1;
    g.moveTo(p.x, by);
    g.quadraticCurveTo(p.x + dir * p.w * 0.25, by - h * 0.1, p.x + dir * p.w * 0.38, by - h * 0.28);
  }
  g.stroke();
}

function bush(g: CanvasRenderingContext2D, p: Prop) {
  const r = p.w / 2;
  const cy = p.y - r * 0.6;
  g.fillStyle = mix([36, 56, 30], [56, 74, 38], p.tone);
  g.beginPath();
  blob(g, p.x - r * 0.35, cy + r * 0.05, r * 0.6);
  blob(g, p.x + r * 0.35, cy + r * 0.1, r * 0.55);
  blob(g, p.x, cy - r * 0.2, r * 0.62);
  g.fill();
  g.fillStyle = mix([84, 110, 58], [120, 136, 76], p.tone);
  g.beginPath();
  blob(g, p.x - r * 0.18, cy - r * 0.38, r * 0.3);
  g.fill();
  if (p.v === 1) {
    g.fillStyle = '#a3362a';
    g.beginPath();
    for (let k = 0; k < 5; k++) blob(g, p.x + (hash(k, 3, p.v) - 0.5) * r * 1.2, cy + (hash(k, 5, p.v) - 0.5) * r * 0.8, r * 0.09);
    g.fill();
  }
}

function rockShape(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  const pts: [number, number][] = [];
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k / 6) * Math.PI;
    const rr = 0.8 + hash(k, seed, 11) * 0.25;
    pts.push([x + Math.cos(a) * (w / 2) * rr, y + Math.sin(a) * h * rr]);
  }
  g.beginPath();
  g.moveTo(x - w / 2, y);
  for (const [px, py] of pts) g.lineTo(px, py);
  g.lineTo(x + w / 2, y);
  g.closePath();
}

function rock(g: CanvasRenderingContext2D, p: Prop) {
  const w = p.w;
  const h = w * 0.62;
  const s = Math.round(p.x * 7 + p.y * 3);
  g.fillStyle = mix([94, 88, 78], [116, 108, 94], p.tone);
  rockShape(g, p.x, p.y, w, h, s);
  g.fill();
  g.fillStyle = 'rgba(30,26,22,0.35)';
  g.beginPath();
  g.moveTo(p.x + w * 0.05, p.y - h * 0.85);
  g.lineTo(p.x + w / 2, p.y);
  g.lineTo(p.x, p.y);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(230,222,204,0.28)';
  g.beginPath();
  g.ellipse(p.x - w * 0.15, p.y - h * 0.62, w * 0.2, h * 0.16, -0.3, 0, Math.PI * 2);
  g.fill();
}

/** Un pico en 3/4: cara oeste iluminada, cara este en sombra, aristas quebradas, estratos y nieve. */
function peakShape(g: CanvasRenderingContext2D, cx: number, base: number, pw: number, ph: number, seed: number, snow: number, k: number) {
  const j = (i: number) => hash(i, seed, 23) - 0.5;
  const sx = cx + j(1) * pw * 0.18;
  const sy = base - ph;
  const mid = cx + pw * 0.04 + j(2) * pw * 0.08;
  const lit = `rgb(${Math.round((150 + j(3) * 16) * k)},${Math.round((140 + j(3) * 14) * k)},${Math.round((122 + j(3) * 12) * k)})`;
  const dark = `rgb(${Math.round(84 * k)},${Math.round(78 * k)},${Math.round(68 * k)})`;
  g.fillStyle = lit;
  g.beginPath();
  g.moveTo(cx - pw / 2, base);
  g.lineTo(cx - pw * 0.34 + j(4) * pw * 0.06, base - ph * 0.32);
  g.lineTo(cx - pw * 0.2 + j(5) * pw * 0.05, base - ph * 0.5);
  g.lineTo(sx - pw * 0.08, sy + ph * 0.16);
  g.lineTo(sx, sy);
  g.lineTo(mid, base);
  g.closePath();
  g.fill();
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(sx + pw * 0.12, sy + ph * 0.22);
  g.lineTo(cx + pw * 0.24 + j(6) * pw * 0.05, base - ph * 0.42);
  g.lineTo(cx + pw * 0.36, base - ph * 0.18);
  g.lineTo(cx + pw / 2, base);
  g.lineTo(mid, base);
  g.closePath();
  g.fill();
  // Arista central y estratos.
  g.strokeStyle = `rgba(250,240,220,${0.18 * k})`;
  g.lineWidth = pw * 0.018;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(mid, base);
  g.stroke();
  g.strokeStyle = 'rgba(30,26,22,0.32)';
  g.lineWidth = pw * 0.014;
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const t = 0.35 + i * 0.18;
    const yy = sy + ph * t;
    g.moveTo(sx + pw * (0.05 + t * 0.1), yy);
    g.lineTo(sx + pw * (0.12 + t * 0.22), yy + ph * 0.06);
  }
  g.stroke();
  if (snow > 0) {
    const sh = ph * snow;
    g.fillStyle = '#ecebe5';
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx - pw * 0.08 - sh * 0.18, sy + sh * 0.85);
    g.lineTo(sx - pw * 0.04, sy + sh * 0.65);
    g.lineTo(sx - pw * 0.01, sy + sh);
    g.lineTo(sx + pw * 0.015, sy + sh * 0.7);
    g.closePath();
    g.fill();
    g.fillStyle = '#aab0b8';
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + pw * 0.015, sy + sh * 0.7);
    g.lineTo(sx + pw * 0.05, sy + sh * 0.9);
    g.lineTo(sx + pw * 0.09, sy + sh * 0.55);
    g.lineTo(sx + pw * 0.12, sy + ph * 0.22 > sy + sh * 0.6 ? sy + sh * 0.6 : sy + ph * 0.22);
    g.closePath();
    g.fill();
  }
}

function mountain(g: CanvasRenderingContext2D, p: Prop, snowy: boolean) {
  const w = p.w;
  const seed = Math.round(p.x * 31 + p.y * 17);
  const h = w * (snowy ? 0.82 : 0.62 + p.tone * 0.18);
  const peaks = 1 + (p.v % 2) + (w > 2.2 ? 1 : 0);
  // Picos de atrás (más pequeños y oscuros), luego el principal delante.
  for (let i = peaks - 1; i >= 1; i--) {
    const side = i % 2 ? -1 : 1;
    const pw = w * (0.55 - i * 0.06);
    peakShape(g, p.x + side * w * (0.26 + hash(i, seed, 3) * 0.1), p.y - h * 0.12, pw, h * (0.62 + hash(i, seed, 5) * 0.2), seed + i * 7, snowy ? 0.4 : 0, 0.86);
  }
  peakShape(g, p.x, p.y, w * 0.78, h, seed, snowy ? 0.45 : w > 3.1 ? 0.14 : 0, 1);
}

function reeds(g: CanvasRenderingContext2D, p: Prop) {
  const h = p.w * 1.05;
  g.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const ox = (k / 6 - 0.5) * p.w * 0.7;
    const lean = (hash(k, 2, Math.round(p.x * 5)) - 0.5) * p.w * 0.35;
    const hh = h * (0.6 + hash(k, 4, Math.round(p.y * 5)) * 0.4);
    g.strokeStyle = k % 2 ? '#6f7c42' : '#4f5b2f';
    g.lineWidth = p.w * 0.045;
    g.beginPath();
    g.moveTo(p.x + ox, p.y);
    g.quadraticCurveTo(p.x + ox, p.y - hh * 0.6, p.x + ox + lean, p.y - hh);
    g.stroke();
    if (k % 3 === 0) {
      g.fillStyle = '#5a3c22';
      g.beginPath();
      g.ellipse(p.x + ox + lean * 0.85, p.y - hh * 0.9, p.w * 0.035, p.w * 0.09, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

const ROOFS: [string, string][] = [['#55606a', '#3c444c'], ['#9a8550', '#73623a'], ['#6d5236', '#4f3b27'], ['#94503a', '#6c3627']];
const WALLS = ['#a39b8a', '#9c8360', '#86684a', '#b3a184'];

function house(g: CanvasRenderingContext2D, p: Prop) {
  const W = p.w * 0.78;
  const Hw = W * 0.34;
  const D = W * 0.62;
  const x0 = p.x - W / 2;
  const eave = p.y - Hw;
  const ridge = eave - D * 0.55;
  const o = W * 0.06;
  // Fachada sur.
  g.fillStyle = WALLS[p.v];
  g.fillRect(x0, eave, W, Hw);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(x0 + W * 0.72, eave, W * 0.28, Hw);
  g.fillStyle = '#2e2218';
  g.fillRect(p.x - W * 0.22, p.y - Hw * 0.78, W * 0.15, Hw * 0.78);
  g.fillStyle = '#1e1c1a';
  g.fillRect(p.x + W * 0.12, p.y - Hw * 0.72, W * 0.14, Hw * 0.32);
  // Tejado a dos aguas: faldón trasero (iluminado) y delantero.
  const [lit, dark] = ROOFS[p.v];
  g.fillStyle = lit;
  g.beginPath();
  g.moveTo(x0 - o, ridge);
  g.lineTo(x0 + W + o, ridge);
  g.lineTo(x0 + W + o * 0.4, ridge - D * 0.32);
  g.lineTo(x0 - o * 0.4, ridge - D * 0.32);
  g.closePath();
  g.fill();
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(x0 - o, ridge);
  g.lineTo(x0 + W + o, ridge);
  g.lineTo(x0 + W + o, eave + o * 0.3);
  g.lineTo(x0 - o, eave + o * 0.3);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,240,210,0.25)';
  g.lineWidth = W * 0.025;
  g.beginPath();
  g.moveTo(x0 - o, ridge);
  g.lineTo(x0 + W + o, ridge);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = W * 0.012;
  g.beginPath();
  for (let k = 1; k < 4; k++) {
    const yy = ridge + ((eave - ridge) * k) / 4;
    g.moveTo(x0 - o, yy);
    g.lineTo(x0 + W + o, yy);
  }
  g.stroke();
  if (p.v === 0 || p.v === 3) {
    g.fillStyle = '#5e574c';
    g.fillRect(p.x + W * 0.22, ridge - D * 0.3, W * 0.1, D * 0.34);
    g.fillStyle = '#3e3933';
    g.fillRect(p.x + W * 0.27, ridge - D * 0.3, W * 0.05, D * 0.34);
  }
}

function ruin(g: CanvasRenderingContext2D, p: Prop) {
  const w = p.w;
  const top = '#a7a08f';
  const face = '#6d675b';
  const wall = (x: number, y: number, len: number, h: number) => {
    g.fillStyle = face;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + len, y);
    for (let k = 4; k >= 0; k--) g.lineTo(x + (len * k) / 4, y - h * (0.55 + hash(k, Math.round(x * 9), 3) * 0.45));
    g.closePath();
    g.fill();
    g.fillStyle = top;
    g.fillRect(x, y - h * 0.62 - w * 0.06, len, w * 0.06);
  };
  if (p.v === 1) {
    // Base de torre redonda.
    g.fillStyle = face;
    g.beginPath();
    g.ellipse(p.x, p.y - w * 0.12, w * 0.36, w * 0.2, 0, 0, Math.PI);
    g.lineTo(p.x - w * 0.36, p.y - w * 0.32);
    g.ellipse(p.x, p.y - w * 0.32, w * 0.36, w * 0.2, 0, Math.PI, 0, true);
    g.closePath();
    g.fill();
    g.fillStyle = top;
    g.beginPath();
    g.ellipse(p.x, p.y - w * 0.32, w * 0.36, w * 0.2, 0, 0, Math.PI * 2);
    g.ellipse(p.x, p.y - w * 0.32, w * 0.27, w * 0.13, 0, 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.fillStyle = '#3d3a32';
    g.beginPath();
    g.ellipse(p.x, p.y - w * 0.32, w * 0.27, w * 0.13, 0, 0, Math.PI * 2);
    g.fill();
  } else if (p.v === 2) {
    // Columnas en pie y una caída.
    for (const dx of [-0.28, 0.12]) {
      const h = w * (0.45 + hash(Math.round(dx * 10), 2, 5) * 0.2);
      g.fillStyle = face;
      g.fillRect(p.x + dx * w, p.y - h, w * 0.12, h);
      g.fillStyle = top;
      g.beginPath();
      g.ellipse(p.x + dx * w + w * 0.06, p.y - h, w * 0.06, w * 0.03, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#8d8676';
    g.beginPath();
    g.roundRect(p.x - w * 0.1, p.y - w * 0.08, w * 0.5, w * 0.1, w * 0.05);
    g.fill();
  } else {
    wall(p.x - w * 0.42, p.y - w * 0.18, w * 0.62, w * 0.42);
    wall(p.x + w * 0.12, p.y, w * 0.3, w * 0.3);
  }
  // Escombros.
  g.fillStyle = '#827b6c';
  g.beginPath();
  for (let k = 0; k < 6; k++) blob(g, p.x + (hash(k, 1, p.v) - 0.5) * w * 0.9, p.y - hash(k, 2, p.v) * w * 0.12, w * 0.03 + hash(k, 3, p.v) * w * 0.03);
  g.fill();
}

function cave(g: CanvasRenderingContext2D, p: Prop) {
  mountain(g, { ...p, w: p.w, tone: 0.3 }, false);
  g.fillStyle = '#14110e';
  g.beginPath();
  g.moveTo(p.x - p.w * 0.16, p.y);
  g.quadraticCurveTo(p.x - p.w * 0.14, p.y - p.w * 0.36, p.x + p.w * 0.02, p.y - p.w * 0.37);
  g.quadraticCurveTo(p.x + p.w * 0.17, p.y - p.w * 0.34, p.x + p.w * 0.17, p.y);
  g.closePath();
  g.fill();
}

function spring(g: CanvasRenderingContext2D, p: Prop) {
  const w = p.w;
  g.fillStyle = '#2f5b64';
  g.beginPath();
  g.ellipse(p.x, p.y - w * 0.18, w * 0.36, w * 0.2, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(160,210,210,0.45)';
  g.beginPath();
  g.ellipse(p.x - w * 0.1, p.y - w * 0.23, w * 0.14, w * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8b8574';
  g.beginPath();
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    blob(g, p.x + Math.cos(a) * w * 0.4, p.y - w * 0.18 + Math.sin(a) * w * 0.23, w * 0.06);
  }
  g.fill();
}

function well(g: CanvasRenderingContext2D, p: Prop) {
  const w = p.w;
  g.fillStyle = '#7d7666';
  g.beginPath();
  g.ellipse(p.x, p.y - w * 0.15, w * 0.32, w * 0.16, 0, 0, Math.PI);
  g.lineTo(p.x - w * 0.32, p.y - w * 0.3);
  g.ellipse(p.x, p.y - w * 0.3, w * 0.32, w * 0.16, 0, Math.PI, 0, true);
  g.fill();
  g.fillStyle = '#a49c8a';
  g.beginPath();
  g.ellipse(p.x, p.y - w * 0.3, w * 0.32, w * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1d2a2c';
  g.beginPath();
  g.ellipse(p.x, p.y - w * 0.3, w * 0.22, w * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4a3624';
  g.fillRect(p.x - w * 0.3, p.y - w * 0.95, w * 0.05, w * 0.65);
  g.fillRect(p.x + w * 0.25, p.y - w * 0.95, w * 0.05, w * 0.65);
  g.fillStyle = '#6d5236';
  g.beginPath();
  g.moveTo(p.x - w * 0.42, p.y - w * 0.9);
  g.lineTo(p.x, p.y - w * 1.15);
  g.lineTo(p.x + w * 0.42, p.y - w * 0.9);
  g.closePath();
  g.fill();
}

function brazier(g: CanvasRenderingContext2D, p: Prop) {
  const w = p.w;
  g.fillStyle = '#6e675a';
  g.fillRect(p.x - w * 0.22, p.y - w * 0.9, w * 0.44, w * 0.9);
  g.fillStyle = '#4f4a40';
  g.fillRect(p.x + w * 0.06, p.y - w * 0.9, w * 0.16, w * 0.9);
  g.fillStyle = '#2a2622';
  g.beginPath();
  g.ellipse(p.x, p.y - w * 0.95, w * 0.4, w * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f26a2e';
  g.beginPath();
  g.ellipse(p.x, p.y - w * 1.0, w * 0.26, w * 0.09, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffc070';
  g.beginPath();
  g.ellipse(p.x - w * 0.05, p.y - w * 1.03, w * 0.1, w * 0.04, 0, 0, Math.PI * 2);
  g.fill();
}

const DRAW: Record<PropKind, (g: CanvasRenderingContext2D, p: Prop) => void> = {
  tree,
  conifer,
  deadtree,
  bush,
  rock,
  crag: (g, p) => mountain(g, p, false),
  peak: (g, p) => mountain(g, p, true),
  reeds,
  house,
  ruin,
  cave,
  spring,
  well,
  brazier,
};

/** Recorte de un sprite en la hoja, con su punto de apoyo (fracción del alto desde arriba). */
export interface SpriteRect {
  sheet: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fracción del ancho que ocupa el objeto real en el sprite (para cuadrar con w). */
  foot?: number;
}

export interface Atlas {
  sheets: (HTMLImageElement | HTMLCanvasElement)[];
  /** Siluetas negras de cada hoja, para proyectar sombras con la forma del sprite. */
  shadows: HTMLCanvasElement[];
  sprites: Partial<Record<string, SpriteRect>>;
}

export const spriteKey = (kind: PropKind | 'obelisk', v: number) => `${kind}:${v}`;

/** Sombra arrojada hacia el sureste: silueta aplastada y cizallada del sprite, o una elipse. */
export function drawPropShadow(g: CanvasRenderingContext2D, p: Prop, atlas: Atlas | null) {
  const s = atlas?.sprites[spriteKey(p.kind, p.v)];
  if (s && atlas) {
    const dw = p.w / (s.foot ?? 1);
    const dh = (dw * s.h) / s.w;
    g.save();
    g.translate(p.x, p.y);
    g.transform(1, 0, -0.75, -0.38, 0, 0);
    g.drawImage(atlas.shadows[s.sheet], s.x, s.y, s.w, s.h, -dw / 2, -dh, dw, dh);
    g.restore();
    return;
  }
  const h = p.w * TALL[p.kind];
  g.beginPath();
  g.ellipse(p.x + h * 0.3, p.y + h * 0.08, p.w * 0.4 + h * 0.3, p.w * 0.28, 0.38, 0, Math.PI * 2);
  g.fill();
}

export function drawProp(g: CanvasRenderingContext2D, p: Prop, atlas: Atlas | null) {
  const s = atlas?.sprites[spriteKey(p.kind, p.v)];
  if (s && atlas) {
    const dw = p.w / (s.foot ?? 1);
    const dh = (dw * s.h) / s.w;
    g.drawImage(atlas.sheets[s.sheet], s.x, s.y, s.w, s.h, p.x - dw / 2, p.y - dh, dw, dh);
    return;
  }
  DRAW[p.kind](g, p);
}
