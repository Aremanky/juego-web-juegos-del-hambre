/**
 * Dónde va cada bocadillo. Encima de la cabeza si cabe; si dos hablan juntos, cada uno hacia su lado, como
 * en un tebeo; si no hay hueco, uno sube por encima del otro o se pone al costado. Mientras haya sitio, no
 * pisa a otro, no tapa ninguna cara y el pico va a quien habla sin atravesar nada. Sin lienzo: solo
 * geometría, para poder probarla.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Una cara a la vista que conviene no tapar. */
export interface HeadPoint {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface SpeechBubbleIn {
  id: string;
  /** Punto más alto de la cabeza, en píxeles de pantalla. */
  hx: number;
  hy: number;
  /** Medio ancho de la cabeza. */
  hr: number;
  /** Tamaño de la cartela ya medida. */
  w: number;
  h: number;
  /** Cuándo empezó a hablar: lo más antiguo va debajo. */
  at: number;
}

export type SpotKind = 'arriba' | 'arriba-izq' | 'arriba-der' | 'lado-der' | 'lado-izq';
export type TailEdge = 'abajo' | 'izq' | 'der';

export interface SpeechSpot {
  id: string;
  box: Box;
  kind: SpotKind;
  /** Cuánto ha subido sobre su sitio para dejar hueco (px). */
  lift: number;
  /** Borde del que sale el pico y su centro en ese borde (x si sale por abajo, y si sale de lado). */
  edge: TailEdge;
  base: number;
  tip: { x: number; y: number };
}

export interface LayoutOpts {
  bounds: { w: number; h: number };
  /** Caras a la vista; las de quien habla ya cuentan aunque no estén aquí. */
  heads?: readonly HeadPoint[];
  /** Lo elegido en el fotograma anterior: entre dos sitios igual de buenos, se queda donde estaba. */
  prev?: ReadonlyMap<string, { kind: SpotKind; lift: number }>;
}

export const EDGE = 6;
export const RADIUS = 4;
export const TAIL_HALF = 5;
/** Largo del pico cuando el bocadillo está en su sitio. */
const TAIL = 6;
const SIDE_TAIL = 7;
/** Desde la punta del lado hasta donde puede salir el pico. */
const INSET = RADIUS + TAIL_HALF + 6;
const STACK_GAP = 4;
const KINDS: readonly SpotKind[] = ['arriba', 'arriba-izq', 'arriba-der', 'lado-der', 'lado-izq'];

// Pesos: cualquier sitio limpio sale más barato que pisar algo.
const KIND_COST: Record<SpotKind, number> = { arriba: 0, 'arriba-izq': 6, 'arriba-der': 6, 'lado-der': 45, 'lado-izq': 45 };
const LIFT_COST = 0.6;
const SHIFT_COST = 0.04;
const OVERLAP_COST = 600;
const OVERLAP_AREA_COST = 3;
const TAIL_CROSS_COST = 1500;
const FACE_COST = 800;
const INVALID_COST = 100_000;
const STAY_BONUS = 15;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const area = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** La cara (con un margen): de la coronilla hasta la barbilla. */
export function faceBox(h: { x: number; y: number; r: number }): Box {
  return { x: h.x - h.r - 1, y: h.y - 2, w: h.r * 2 + 2, h: h.r * 2 + 4 };
}

/** De dónde sale el pico y adónde apunta, para una cartela ya colocada. */
export function tailFor(box: Box, kind: SpotKind, hx: number, hy: number, hr: number): Pick<SpeechSpot, 'edge' | 'base' | 'tip'> {
  const lo = (start: number) => start + RADIUS + TAIL_HALF;
  if (kind === 'lado-der') return { edge: 'izq', base: clamp(hy + hr, lo(box.y), box.y + box.h - RADIUS - TAIL_HALF), tip: { x: hx + hr + 1, y: hy + hr } };
  if (kind === 'lado-izq') return { edge: 'der', base: clamp(hy + hr, lo(box.y), box.y + box.h - RADIUS - TAIL_HALF), tip: { x: hx - hr - 1, y: hy + hr } };
  return { edge: 'abajo', base: clamp(hx, lo(box.x), box.x + box.w - RADIUS - TAIL_HALF), tip: { x: hx, y: hy - 1 } };
}

type Seg = readonly [number, number, number, number];

/** El pico como tres segmentos: el eje y los dos lados de la cuña. */
function tailSegs(s: Pick<SpeechSpot, 'box' | 'edge' | 'base' | 'tip'>): Seg[] {
  const { box, edge, base, tip } = s;
  if (edge === 'abajo') {
    const y = box.y + box.h;
    return [[base, y, tip.x, tip.y], [base - TAIL_HALF, y, tip.x, tip.y], [base + TAIL_HALF, y, tip.x, tip.y]];
  }
  const x = edge === 'izq' ? box.x : box.x + box.w;
  return [[x, base, tip.x, tip.y], [x, base - TAIL_HALF, tip.x, tip.y], [x, base + TAIL_HALF, tip.x, tip.y]];
}

/** ¿El segmento entra en la caja? (recorte de Liang-Barsky, con 1 px de holgura en los bordes). */
function segHits([x0, y0, x1, y1]: Seg, b: Box): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, x0 - (b.x + 1)],
    [dx, b.x + b.w - 1 - x0],
    [-dy, y0 - (b.y + 1)],
    [dy, b.y + b.h - 1 - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 < t1;
}

const tailHits = (segs: readonly Seg[], b: Box) => segs.some((s) => segHits(s, b));

interface Placed {
  spot: SpeechSpot;
  segs: Seg[];
}

interface Cand {
  spot: SpeechSpot;
  valid: boolean;
}

/** Hacia dónde se abre: −1 a la izquierda, +1 a la derecha (lejos de quien habla al lado), 0 si está solo. */
function leanOf(it: SpeechBubbleIn, items: readonly SpeechBubbleIn[]): number {
  let best: SpeechBubbleIn | undefined;
  for (const o of items) {
    if (o === it) continue;
    const dx = Math.abs(o.hx - it.hx);
    if (dx >= (o.w + it.w) / 2 + 20 || Math.abs(o.hy - it.hy) >= Math.max(o.h, it.h) + 60) continue;
    if (!best || dx < Math.abs(best.hx - it.hx)) best = o;
  }
  if (!best) return 0;
  const dx = best.hx - it.hx;
  if (Math.abs(dx) > 0.5) return dx > 0 ? -1 : 1;
  // Uno encima del otro: el que habló antes se abre a la izquierda.
  return it.at < best.at || (it.at === best.at && it.id < best.id) ? -1 : 1;
}

function candidates(it: SpeechBubbleIn, bounds: LayoutOpts['bounds'], blocks: readonly Box[]): Cand[] {
  const { hx, hy, hr, w, h } = it;
  const own = faceBox({ x: hx, y: hy, r: hr });
  const maxX = bounds.w - EDGE - w;
  const maxY = bounds.h - EDGE - h;
  const out: Cand[] = [];
  const push = (kind: SpotKind, x: number, y: number, lift: number) => {
    const box = { x, y, w, h };
    const spot: SpeechSpot = { id: it.id, box, kind, lift, ...tailFor(box, kind, hx, hy, hr) };
    const { tip, edge } = spot;
    const pointsOut = edge === 'abajo' ? tip.y >= y + h + 2 : edge === 'izq' ? tip.x <= x - 2 : tip.x >= x + w + 2;
    out.push({ spot, valid: pointsOut && !overlaps(box, own) });
  };
  for (const kind of KINDS.slice(0, 3)) {
    const x0 = kind === 'arriba' ? hx - w / 2 : kind === 'arriba-izq' ? hx + INSET - w : hx - INSET;
    const x = clamp(x0, EDGE, maxX);
    const natural = hy - 1 - TAIL - h;
    let y = clamp(natural, EDGE, maxY);
    push(kind, x, y, 0);
    // Si algo estorba, sube justo por encima (hasta tres veces) sin salirse por arriba.
    for (let lift = 0; lift < 3; lift++) {
      const box = { x, y, w, h };
      const hit = blocks.filter((b) => overlaps(box, b));
      if (!hit.length) break;
      const next = Math.min(...hit.map((b) => b.y)) - h - STACK_GAP;
      if (next < EDGE) break;
      y = next;
      push(kind, x, y, natural - y);
    }
  }
  const sideY = clamp(hy + hr - h / 2, EDGE, maxY);
  push('lado-der', clamp(hx + hr + 1 + SIDE_TAIL, EDGE, maxX), sideY, 0);
  push('lado-izq', clamp(hx - hr - 1 - SIDE_TAIL - w, EDGE, maxX), sideY, 0);
  return out;
}

function costOf(
  c: Cand,
  it: SpeechBubbleIn,
  lean: number,
  placed: readonly Placed[],
  faces: readonly Box[],
  prev: { kind: SpotKind; lift: number } | undefined,
): number {
  const { box, kind, lift } = c.spot;
  let cost = c.valid ? 0 : INVALID_COST;
  cost += KIND_COST[kind];
  if (lean !== 0) {
    const away = lean < 0 ? ['arriba-izq', 'lado-izq'] : ['arriba-der', 'lado-der'];
    const toward = lean < 0 ? ['arriba-der', 'lado-der'] : ['arriba-izq', 'lado-izq'];
    if (kind === 'arriba') cost += 6;
    else if (away.includes(kind)) cost -= kind.startsWith('arriba') ? 12 : 6;
    else if (toward.includes(kind)) cost += kind.startsWith('arriba') ? 24 : 12;
  }
  cost += lift * LIFT_COST + Math.abs(box.x + box.w / 2 - it.hx) * SHIFT_COST;
  const segs = tailSegs(c.spot);
  for (const p of placed) {
    const a = area(box, p.spot.box);
    if (a > 0) cost += OVERLAP_COST + a * OVERLAP_AREA_COST;
    if (tailHits(segs, p.spot.box)) cost += TAIL_CROSS_COST;
    if (tailHits(p.segs, box)) cost += TAIL_CROSS_COST;
  }
  for (const f of faces) {
    if (overlaps(box, f)) cost += FACE_COST;
    else if (tailHits(segs, f)) cost += FACE_COST;
  }
  if (prev && prev.kind === kind && prev.lift > 0 === lift > 0) cost -= STAY_BONUS;
  return cost;
}

function* permutations(n: number): Generator<number[]> {
  const a = Array.from({ length: n }, (_, i) => i);
  yield a.slice();
  // Orden lexicográfico a partir del de antigüedad.
  for (;;) {
    let i = n - 2;
    while (i >= 0 && a[i] >= a[i + 1]) i--;
    if (i < 0) return;
    let j = n - 1;
    while (a[j] <= a[i]) j--;
    [a[i], a[j]] = [a[j], a[i]];
    a.splice(i + 1, n - i - 1, ...a.slice(i + 1).reverse());
    yield a.slice();
  }
}

/**
 * Coloca los bocadillos y los devuelve en orden de antigüedad (el orden en que se dibujan). Con hasta
 * cuatro a la vez prueba todos los órdenes de colocación y se queda con el más limpio; con más, coloca
 * del más antiguo al más nuevo.
 */
export function layoutSpeech(items: readonly SpeechBubbleIn[], opts: LayoutOpts): SpeechSpot[] {
  const sorted = [...items].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!sorted.length) return [];
  const heads = new Map<string, HeadPoint>();
  for (const hp of opts.heads ?? []) heads.set(hp.id, hp);
  for (const it of sorted) heads.set(it.id, { id: it.id, x: it.hx, y: it.hy, r: it.hr });
  const leans = sorted.map((it) => leanOf(it, sorted));
  // Para cada uno, las caras ajenas cercanas (las lejanas no pueden estorbar).
  const faces = sorted.map((it) =>
    [...heads.values()]
      .filter((hp) => hp.id !== it.id && Math.abs(hp.x - it.hx) < it.w + 40 && hp.y - it.hy < it.h * 2 + 40 && it.hy - hp.y < it.h * 3 + 60)
      .map(faceBox),
  );

  let best: SpeechSpot[] | undefined;
  let bestCost = Infinity;
  const orders = sorted.length <= 4 ? permutations(sorted.length) : [sorted.map((_, i) => i)];
  for (const order of orders) {
    const placed: Placed[] = [];
    let total = 0;
    for (const i of order) {
      const it = sorted[i];
      const blocks = [...placed.map((p) => p.spot.box), ...faces[i]];
      let pick: SpeechSpot | undefined;
      let pickCost = Infinity;
      for (const c of candidates(it, opts.bounds, blocks)) {
        const cost = costOf(c, it, leans[i], placed, faces[i], opts.prev?.get(it.id));
        if (cost < pickCost) {
          pickCost = cost;
          pick = c.spot;
        }
      }
      placed.push({ spot: pick!, segs: tailSegs(pick!) });
      total += pickCost;
      if (total >= bestCost) break;
    }
    if (placed.length === sorted.length && total < bestCost) {
      bestCost = total;
      best = sorted.map((it) => placed.find((p) => p.spot.id === it.id)!.spot);
    }
  }
  return best!;
}
