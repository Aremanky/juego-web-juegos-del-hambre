/**
 * Bocadillos con lo que dicen los bots (GDD §13). Una cartela de hueso con tinta de hollín, como un papel
 * sobre la mesa de los Arquitectos, con su sombra al sureste igual que todo lo demás del mapa. En el
 * holograma, placa oscura con trazo y letra turquesa. Entra subiendo un poco, se queda y se apaga; nada
 * se repite en bucle. Dónde va cada uno lo decide `layoutSpeech`; aquí solo se mide, se desliza y se pinta.
 */
import { EDGE, RADIUS, TAIL_HALF, layoutSpeech, tailFor, type Box, type HeadPoint, type SpeechSpot, type SpotKind } from './speechLayout';

export const BUBBLE_MS = 5_000;
const ENTER_MS = 160;
const FADE_MS = 600;
/** Cuando otro empieza a hablar al lado, el bocadillo se aparta deslizándose (constante de tiempo, ms). */
const GLIDE_MS = 70;
export const SPEECH_FONT = '500 12px "Archivo Variable", Archivo, sans-serif';
const LINE_H = 15;
const PAD_X = 8;
const PAD_Y = 5;
const MAX_TEXT_W = 196;
const MIN_TEXT_W = 120;

/**
 * Parte el texto en líneas que caben en `maxWidth`; si sobran, la última acaba en «…». Si hace falta más
 * de una línea, las reparte como un rotulista de tebeo: las mismas líneas, lo más parejas posible, sin
 * dejar una palabra sola al final.
 */
export function wrapLines(g: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const fill = (limit: number) => {
    const out: string[] = [];
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (!cur || g.measureText(next).width <= limit) cur = next;
      else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
    return out;
  };
  const lines = fill(maxWidth);
  if (lines.length <= maxLines) {
    if (lines.length < 2) return lines;
    // El ancho más estrecho que sigue dando las mismas líneas.
    let lo = Math.max(...words.map((w) => g.measureText(w).width));
    let hi = maxWidth;
    let best = lines;
    for (let i = 0; i < 10 && hi - lo > 0.5; i++) {
      const mid = (lo + hi) / 2;
      const tried = fill(mid);
      if (tried.length <= lines.length) {
        best = tried;
        hi = mid;
      } else lo = mid;
    }
    return best;
  }
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.includes(' ') && g.measureText(`${last}…`).width > maxWidth) last = last.slice(0, last.lastIndexOf(' '));
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Lo que alguien está diciendo y dónde tiene la cabeza (coronilla y medio ancho) en la pantalla. */
export interface SpeechItem {
  id: string;
  text: string;
  /** Hora local (ms) a la que llegó la frase. */
  at: number;
  hx: number;
  hy: number;
  hr: number;
}

interface Measured {
  lines: string[];
  w: number;
  h: number;
}

/** Contorno de la cartela con el pico dentro del mismo trazo, sin costura entre los dos. */
function outline(g: CanvasRenderingContext2D, b: Box, t: Pick<SpeechSpot, 'edge' | 'base' | 'tip'>) {
  const { x, y, w, h } = b;
  const r = RADIUS;
  const s = TAIL_HALF;
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  if (t.edge === 'der') {
    g.lineTo(x + w, t.base - s);
    g.lineTo(t.tip.x, t.tip.y);
    g.lineTo(x + w, t.base + s);
  }
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  if (t.edge === 'abajo') {
    g.lineTo(t.base + s, y + h);
    g.lineTo(t.tip.x, t.tip.y);
    g.lineTo(t.base - s, y + h);
  }
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  if (t.edge === 'izq') {
    g.lineTo(x, t.base + s);
    g.lineTo(t.tip.x, t.tip.y);
    g.lineTo(x, t.base - s);
  }
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

function paint(g: CanvasRenderingContext2D, box: Box, tail: Pick<SpeechSpot, 'edge' | 'base' | 'tip'>, lines: string[], holo: boolean, alpha: number) {
  g.globalAlpha = alpha;
  outline(g, box, tail);
  if (holo) {
    g.fillStyle = 'rgba(4, 16, 15, 0.9)';
    g.fill();
    g.strokeStyle = 'rgba(95, 227, 208, 0.75)';
    g.lineWidth = 1;
    g.stroke();
  } else {
    // Sombra al sureste, como los árboles y las casas: la luz del mapa viene del noroeste.
    g.shadowColor = 'rgba(10, 8, 5, 0.45)';
    g.shadowBlur = 6;
    g.shadowOffsetX = 2;
    g.shadowOffsetY = 3;
    g.fillStyle = '#efe7da';
    g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(23, 19, 15, 0.4)';
    g.lineWidth = 1;
    g.stroke();
  }
  g.fillStyle = holo ? '#5fe3d0' : '#17130f';
  lines.forEach((l, i) => g.fillText(l, box.x + PAD_X, box.y + PAD_Y + i * LINE_H + 1));
}

/**
 * Capa de bocadillos de un mapa. Guarda de un fotograma a otro dónde estaba cada uno, para que se deslice
 * en vez de saltar cuando tiene que apartarse, y no cambie de sitio sin motivo.
 */
export class SpeechLayer {
  private sizes = new Map<string, Measured>();
  private shown = new Map<string, { dx: number; dy: number }>();
  private prev = new Map<string, { kind: SpotKind; lift: number }>();
  private last = 0;

  draw(
    g: CanvasRenderingContext2D,
    items: readonly SpeechItem[],
    opts: { holo: boolean; reduced: boolean; bounds: { w: number; h: number }; heads: readonly HeadPoint[]; now: number },
  ): void {
    const { now } = opts;
    const dt = Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    const live = items.filter((it) => now - it.at >= 0 && now - it.at <= BUBBLE_MS);
    if (!live.length) {
      this.shown.clear();
      this.prev.clear();
      return;
    }
    g.save();
    g.font = SPEECH_FONT;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    // En un móvil caben dos bocadillos uno al lado del otro.
    const maxW = Math.max(MIN_TEXT_W, Math.min(MAX_TEXT_W, Math.floor((opts.bounds.w - 3 * EDGE) / 2) - PAD_X * 2));
    const sized = new Map(live.map((it) => [it.id, { it, m: this.measure(g, it.text, maxW) }]));
    const spots = layoutSpeech(
      live.map((it) => ({ id: it.id, hx: it.hx, hy: it.hy, hr: it.hr, w: sized.get(it.id)!.m.w, h: sized.get(it.id)!.m.h, at: it.at })),
      { bounds: opts.bounds, heads: opts.heads, prev: this.prev },
    );
    const k = opts.reduced ? 1 : 1 - Math.exp(-dt / GLIDE_MS);
    this.prev = new Map();
    for (const spot of spots) {
      const { it, m } = sized.get(spot.id)!;
      this.prev.set(it.id, { kind: spot.kind, lift: spot.lift });
      // El sitio se guarda respecto a la cabeza: si quien habla anda, el bocadillo va con él sin retraso.
      const tx = spot.box.x - it.hx;
      const ty = spot.box.y - it.hy;
      const cur = this.shown.get(it.id);
      const off = cur ? { dx: cur.dx + (tx - cur.dx) * k, dy: cur.dy + (ty - cur.dy) * k } : { dx: tx, dy: ty };
      this.shown.set(it.id, off);
      const age = now - it.at;
      const alpha = age < ENTER_MS ? easeOut(age / ENTER_MS) : age > BUBBLE_MS - FADE_MS ? (BUBBLE_MS - age) / FADE_MS : 1;
      const rise = opts.reduced ? 0 : (1 - easeOut(Math.min(1, age / ENTER_MS))) * 4;
      const box = { x: Math.round(it.hx + off.dx), y: Math.round(it.hy + off.dy + rise), w: m.w, h: m.h };
      paint(g, box, tailFor(box, spot.kind, it.hx, it.hy, it.hr), m.lines, opts.holo, alpha);
    }
    for (const id of [...this.shown.keys()]) if (!sized.has(id)) this.shown.delete(id);
    g.restore();
  }

  private measure(g: CanvasRenderingContext2D, text: string, maxW: number): Measured {
    const key = `${maxW}|${text}`;
    let m = this.sizes.get(key);
    if (!m) {
      const lines = wrapLines(g, text, maxW);
      const textW = Math.max(...lines.map((l) => g.measureText(l).width));
      m = { lines, w: Math.ceil(textW) + PAD_X * 2, h: lines.length * LINE_H + PAD_Y * 2 };
      if (this.sizes.size > 200) this.sizes.clear();
      this.sizes.set(key, m);
    }
    return m;
  }
}
