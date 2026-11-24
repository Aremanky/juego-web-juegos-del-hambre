import { darken, lighten, type Appearance } from '@ceniza/shared';
import type { Facing } from './facing';

export type { Facing } from './facing';

/**
 * Personaje animado del mapa (GDD §5.9): figura de proporciones de juego (cabeza grande, cuerpo corto)
 * dibujada por piezas sobre un esqueleto, así cualquier combinación de piel, peinado, ropa y complemento
 * sirve para todas las animaciones. Vista cenital en 3/4 con cinco vistas dibujadas: de frente (S), de 3/4
 * de frente (SE), de lado (E), de 3/4 de espaldas (NE) y de espaldas (N); el suroeste, el oeste y el
 * noroeste son su espejo. Sombreado a dos tonos con la luz del noroeste, como el resto del mapa, y un
 * contorno fino para que se lea sobre cualquier terreno.
 *
 * Se dibuja en un sistema de 100 unidades de alto con los pies en (0, 0).
 */
export interface Pose {
  facing: Facing;
  /** ms, para las animaciones. */
  t: number;
  moving: boolean;
  running: boolean;
  swimming: boolean;
  /** Agachado entre la maleza, quieto. */
  crouched: boolean;
  dead: boolean;
  celebrating: boolean;
  /** Trepando (montaña y cumbre): inclinado, con los brazos que se alternan hacia arriba. */
  climbing: boolean;
  /** Con `dead`: cuánto lleva de la caída (0 de pie, 1 caído). Sin él, caído del todo. */
  fall?: number;
}

/** Ritmo de la zancada (radianes por ms) al trepar, correr y andar, y de la respiración y el parpadeo en reposo. */
export const STRIDE = { climb: 0.008, run: 0.019, walk: 0.011 } as const;
export const BREATH = 0.003;
export const BLINK_EVERY = 4300;
export const BLINK_MS = 120;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

interface Palette {
  skin: string;
  skinD: string;
  hair: string;
  hairD: string;
  hairL: string;
  cloth: string;
  clothD: string;
  clothL: string;
  trim: string;
  trimD: string;
  pants: string;
  pantsD: string;
  boots: string;
}

/**
 * Vista dibujada. En las de 3/4 se ve el frente (o la espalda) girado hacia el este: el lado cercano queda a
 * un lado de la pantalla y el lejano se tapa en parte. De 3/4 de frente, el lado lejano es el este; de 3/4
 * de espaldas, el oeste.
 */
type View = 'front' | 'front34' | 'side' | 'back34' | 'back';
const VIEW_OF: Record<Facing, View> = { S: 'front', SE: 'front34', E: 'side', NE: 'back34', N: 'back', NW: 'back34', W: 'side', SW: 'front34' };
const MIRRORED: ReadonlySet<Facing> = new Set<Facing>(['SW', 'W', 'NW']);

const palettes = new WeakMap<Appearance, Palette>();
function palette(a: Appearance): Palette {
  let p = palettes.get(a);
  if (!p) {
    p = {
      skin: a.skin,
      skinD: a.skinShade,
      hair: a.hair,
      hairD: a.hairShade,
      hairL: lighten(a.hair, 0.22),
      cloth: a.outfit,
      clothD: darken(a.outfit, 0.3),
      clothL: lighten(a.outfit, 0.18),
      trim: a.trim,
      trimD: darken(a.trim, 0.3),
      pants: a.pants,
      pantsD: darken(a.pants, 0.3),
      boots: a.boots,
    };
    palettes.set(a, p);
  }
  return p;
}

/**
 * Gris de la figura que se está dibujando (0 en color; 0,85 caída del todo). Se aplica a cada color en vez de
 * con `filter` del lienzo: en Chrome sin GPU, el filtro costaba unos 30 ms por figura caída y fotograma.
 */
let gray = 0;
const grays = new Map<string, string>();
function tone(c: string): string {
  if (gray <= 0) return c;
  const key = `${c}|${gray}`;
  let out = grays.get(key);
  if (out === undefined) {
    out = toGray(c, gray);
    if (grays.size > 4096) grays.clear();
    grays.set(key, out);
  }
  return out;
}

/** Lo mismo que `grayscale(a)` de CSS sobre un color #rgb, #rrggbb(aa), rgb() o rgba(): la matriz de la especificación. */
function toGray(c: string, a: number): string {
  let r: number, gr: number, b: number, al = 1;
  if (c[0] === '#') {
    const h = c.length === 4 ? [...c.slice(1)].map((d) => d + d).join('') : c.slice(1, 7);
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return c;
    [r, gr, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    if (c.length === 9) al = parseInt(c.slice(7, 9), 16) / 255;
  } else {
    const m = /^rgba?\(([^)]+)\)$/.exec(c);
    if (!m) return c;
    const p = m[1].split(',').map(Number);
    [r, gr, b] = p;
    if (p.length > 3) al = p[3];
  }
  const k = 1 - a;
  const q = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  const R = (0.2126 + 0.7874 * k) * r + (0.7152 - 0.7152 * k) * gr + (0.0722 - 0.0722 * k) * b;
  const G = (0.2126 - 0.2126 * k) * r + (0.7152 + 0.2848 * k) * gr + (0.0722 - 0.0722 * k) * b;
  const B = (0.2126 - 0.2126 * k) * r + (0.7152 - 0.7152 * k) * gr + (0.0722 + 0.9278 * k) * b;
  return `rgba(${q(R)},${q(G)},${q(B)},${al})`;
}

const INK = 'rgba(20,14,10,0.72)';
const LINE = 2.4;

function shape(g: CanvasRenderingContext2D, fill: string, build: () => void, outline = true) {
  g.beginPath();
  build();
  g.fillStyle = tone(fill);
  g.fill();
  if (outline) {
    g.strokeStyle = tone(INK);
    g.lineWidth = LINE;
    g.stroke();
  }
}

/** Pierna desde la cadera (x, y) con ángulo y largo; la bota al final. */
function leg(g: CanvasRenderingContext2D, P: Palette, x: number, y: number, len: number, angle: number, w: number, dark: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  shape(g, dark ? P.pantsD : P.pants, () => g.roundRect(-w / 2, 0, w, len - 7, 3));
  shape(g, P.boots, () => g.roundRect(-w / 2 - 0.5, len - 10, w + 1, 10, [2, 2, 3, 3]));
  g.restore();
}

/** Brazo desde el hombro: manga y mano. */
function arm(g: CanvasRenderingContext2D, P: Palette, x: number, y: number, len: number, angle: number, sleeve: string, dark: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  shape(g, dark ? darken(sleeve, 0.22) : sleeve, () => g.roundRect(-4.6, -1, 9.2, len - 5, 4.6));
  shape(g, dark ? P.skinD : P.skin, () => g.arc(0, len - 3.5, 4.4, 0, Math.PI * 2));
  g.restore();
}

function hairBack(g: CanvasRenderingContext2D, a: Appearance, P: Palette, hy: number, r: number, view: View) {
  // Lo que queda detrás de la cabeza (melena, trenza, coleta, capucha).
  const s = a.hairStyle;
  if (s === 'melena' && view !== 'back' && view !== 'back34') {
    // De 3/4 de frente, la melena asoma más por el lado de la nuca (el oeste).
    if (view === 'front34') shape(g, P.hairD, () => g.roundRect(-r * 1.14, hy - r * 0.2, r * 1.9, r * 1.55, r * 0.5));
    else shape(g, P.hairD, () => g.roundRect(-r * (view === 'side' ? 1.05 : 1.08), hy - r * 0.2, r * (view === 'side' ? 1.3 : 2.16), r * 1.55, r * 0.5));
  }
  if (s === 'capucha') shape(g, P.trimD, () => g.arc(view === 'side' ? -2 : view === 'front34' ? -1 : view === 'back34' ? 1 : 0, hy + 1, r * 1.28, 0, Math.PI * 2));
}

function hairFront(g: CanvasRenderingContext2D, a: Appearance, P: Palette, hy: number, r: number, drawn: View) {
  // De 3/4, el mismo pelo que de frente o de espaldas, corrido hacia donde gira la cara (o hacia la nuca).
  const view = drawn === 'front34' ? 'front' : drawn === 'back34' ? 'back' : drawn;
  // De 3/4 de espaldas, el pelo se corre hacia la nuca y deja ver el borde de la mejilla.
  const shift = drawn === 'front34' ? r * 0.16 : drawn === 'back34' ? -3.4 : 0;
  if (shift) {
    g.save();
    g.translate(shift, 0);
  }
  const s = a.hairStyle;
  const cap = (top: number, color: string, extra = 0) =>
    shape(g, color, () => {
      if (view === 'back') g.arc(0, hy, r + 1 + extra, 0, Math.PI * 2);
      else if (view === 'side') {
        g.arc(-1.5, hy - 1, r + 1 + extra, Math.PI * 0.62, Math.PI * 1.95);
        g.quadraticCurveTo(r * 0.6, hy - r * top, r * 0.2, hy - r * 0.15);
        g.closePath();
      } else {
        g.arc(0, hy - 1.5, r + 1 + extra, Math.PI * 0.92, Math.PI * 2.08);
        g.quadraticCurveTo(r * 0.4, hy - r * top, 0, hy - r * 0.45);
        g.quadraticCurveTo(-r * 0.5, hy - r * top, -r - 1, hy - 1);
        g.closePath();
      }
    });
  switch (s) {
    case 'rapado':
      cap(0.55, P.skinD);
      break;
    case 'capucha':
      shape(g, P.trim, () => {
        if (view === 'back') g.arc(0, hy, r * 1.25, 0, Math.PI * 2);
        else {
          g.arc(view === 'side' ? -2 : 0, hy, r * 1.25, Math.PI * (view === 'side' ? 0.55 : 0.82), Math.PI * (view === 'side' ? 2.0 : 2.18));
          g.closePath();
        }
      });
      g.strokeStyle = tone(P.trimD);
      g.lineWidth = 2;
      g.beginPath();
      if (view !== 'back') g.arc(view === 'side' ? -2 : 0, hy + 1, r * 1.02, Math.PI * (view === 'side' ? 1.2 : 1.05), Math.PI * (view === 'side' ? 1.95 : 1.95));
      g.stroke();
      break;
    case 'rizos': {
      const n = view === 'back' ? 8 : 6;
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const ang = view === 'back' ? (k / n) * Math.PI * 2 : Math.PI * (0.95 + (k * 1.1) / (n - 1));
        const cx = (view === 'side' ? -2 : 0) + Math.cos(ang) * r * 0.9;
        const cy = hy - 1 + Math.sin(ang) * r * 0.9;
        g.moveTo(cx + r * 0.45, cy);
        g.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      }
      g.fillStyle = tone(P.hair);
      g.fill();
      g.strokeStyle = tone(INK);
      g.lineWidth = LINE;
      g.stroke();
      if (view === 'back') cap(0.4, P.hair, -2);
      break;
    }
    case 'cresta':
      cap(0.5, P.skinD, -1);
      shape(g, P.hair, () => g.roundRect(view === 'side' ? -r * 0.4 : -3.2, hy - r - 7, view === 'side' ? r * 1.2 : 6.4, view === 'back' ? r * 2.2 : 10, 3));
      break;
    default:
      cap(s === 'corto' ? 0.7 : 0.55, P.hair);
  }
  // Brillo del pelo (luz del noroeste).
  if (s !== 'rapado' && s !== 'capucha') {
    g.strokeStyle = tone(P.hairL);
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(view === 'side' ? -3 : -2, hy - 2, r * 0.72, Math.PI * 1.15, Math.PI * 1.45);
    g.stroke();
  }
  // Piezas que asoman.
  if (s === 'mono') shape(g, P.hair, () => g.arc(view === 'side' ? -r * 0.9 : 0, hy - r * (view === 'side' ? 0.55 : 1.05), r * 0.42, 0, Math.PI * 2));
  if ((s === 'coleta' || s === 'trenza') && view !== 'front') {
    const x0 = view === 'side' ? -r * 1.05 : 0;
    shape(g, P.hairD, () => g.roundRect(x0 - 3, hy - 2, 6, s === 'trenza' ? r * 2 : r * 1.5, 3));
    if (s === 'trenza') {
      g.strokeStyle = tone(INK);
      g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 1; k < 4; k++) {
        g.moveTo(x0 - 3, hy - 2 + k * r * 0.45);
        g.lineTo(x0 + 3, hy - 2 + k * r * 0.45 + 2);
      }
      g.stroke();
    }
  }
  if (a.accessory === 'cinta' && s !== 'capucha') {
    g.strokeStyle = tone(P.trim);
    g.lineWidth = 3;
    g.beginPath();
    if (view === 'side') g.arc(-1.5, hy - 1, r + 0.5, Math.PI * 1.02, Math.PI * 1.9);
    else g.arc(0, hy - 1, r + 0.5, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
  }
  if (shift) g.restore();
}

function face(g: CanvasRenderingContext2D, P: Palette, hy: number, r: number, view: 'front' | 'front34' | 'side', blink: boolean, dead: boolean) {
  g.fillStyle = tone('rgba(28,18,14,0.92)');
  g.strokeStyle = tone('rgba(28,18,14,0.92)');
  g.lineWidth = 1.6;
  /** Ojo en x; `k` < 1 lo estrecha (el ojo lejano de 3/4, que se ve de canto). */
  const eye = (x: number, k = 1) => {
    if (dead) {
      g.beginPath();
      g.moveTo(x - 2 * k, hy - 1);
      g.lineTo(x + 2 * k, hy + 3);
      g.moveTo(x + 2 * k, hy - 1);
      g.lineTo(x - 2 * k, hy + 3);
      g.stroke();
    } else if (blink) {
      g.beginPath();
      g.moveTo(x - 2.2 * k, hy + 1.5);
      g.lineTo(x + 2.2 * k, hy + 1.5);
      g.stroke();
    } else {
      g.beginPath();
      g.ellipse(x, hy + 1.2, 1.9 * k, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = tone('rgba(255,255,255,0.85)');
      g.beginPath();
      g.arc(x - 0.6, hy + 0.2, 0.7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = tone('rgba(28,18,14,0.92)');
    }
  };
  if (view === 'front') {
    eye(-r * 0.36);
    eye(r * 0.36);
    // Mejillas.
    g.fillStyle = tone('rgba(200,90,70,0.18)');
    g.beginPath();
    g.ellipse(-r * 0.55, hy + r * 0.38, 2.6, 1.5, 0, 0, Math.PI * 2);
    g.ellipse(r * 0.55, hy + r * 0.38, 2.6, 1.5, 0, 0, Math.PI * 2);
    g.fill();
  } else if (view === 'front34') {
    // La cara gira hacia el este: el ojo cercano cerca del centro y el lejano, estrecho, junto al borde.
    eye(r * 0.04);
    eye(r * 0.68, 0.62);
    g.fillStyle = tone('rgba(200,90,70,0.18)');
    g.beginPath();
    g.ellipse(-r * 0.22, hy + r * 0.38, 2.6, 1.5, 0, 0, Math.PI * 2);
    g.ellipse(r * 0.82, hy + r * 0.38, 1.4, 1.4, 0, 0, Math.PI * 2);
    g.fill();
    // La nariz apunta hacia donde mira.
    g.strokeStyle = tone(P.skinD);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(r * 0.4, hy + 2.3);
    g.lineTo(r * 0.56, hy + 4.6);
    g.lineTo(r * 0.38, hy + 5.5);
    g.stroke();
  } else {
    eye(r * 0.5);
    g.strokeStyle = tone(P.skinD);
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(r * 0.95, hy + 2);
    g.lineTo(r * 1.08, hy + 4);
    g.lineTo(r * 0.92, hy + 5);
    g.stroke();
  }
}

/** Torso con la prenda elegida; devuelve el color de las mangas. */
function torso(g: CanvasRenderingContext2D, a: Appearance, P: Palette, top: number, hip: number, w: number, view: View): string {
  const style = a.outfitStyle;
  const hw = w / 2;
  const front = view === 'front' || view === 'front34';
  // De 3/4 de frente, la línea del pecho (botones, escote, hebilla) se corre hacia el este.
  const cx = view === 'front34' ? hw * 0.3 : 0;
  const hem = style === 'tunica' ? hip + 9 : style === 'vestido' ? hip + 15 : hip + 2;
  const flare = style === 'vestido' ? 6 : style === 'tunica' ? 2 : 0;
  shape(g, P.cloth, () => {
    g.moveTo(-hw + 2, top);
    g.quadraticCurveTo(-hw - 1, top + 2, -hw, top + 8);
    g.lineTo(-hw - flare, hem);
    g.lineTo(hw + flare, hem);
    g.lineTo(hw, top + 8);
    g.quadraticCurveTo(hw + 1, top + 2, hw - 2, top);
    g.closePath();
  });
  // Lado en sombra (este).
  g.fillStyle = tone(P.clothD);
  g.globalAlpha = 0.55;
  g.beginPath();
  g.moveTo(hw * 0.35, top + 1);
  g.lineTo(hw - 1, top + 4);
  g.lineTo(hw + flare - 1, hem - 1);
  g.lineTo(hw * 0.35 + flare * 0.4, hem - 1);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  // Detalles de cada prenda.
  if (style === 'chaqueta' && front) {
    shape(g, lighten(a.trim, 0.35), () => {
      g.moveTo(cx - 3.5, top);
      g.lineTo(cx + 3.5, top);
      g.lineTo(cx + 2, hem);
      g.lineTo(cx - 2, hem);
      g.closePath();
    }, false);
    g.strokeStyle = tone(P.clothD);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 3.5, top);
    g.lineTo(cx - 6, top + 9);
    g.moveTo(cx + 3.5, top);
    g.lineTo(cx + 6, top + 9);
    g.stroke();
  }
  if (style === 'peto') {
    g.strokeStyle = tone('rgba(255,240,210,0.35)');
    g.lineWidth = 1.1;
    g.setLineDash([2, 2]);
    g.beginPath();
    g.roundRect(-hw + 4, top + 5, w - 8, hip - top - 6, 3);
    g.stroke();
    g.setLineDash([]);
    if (view !== 'side') {
      // De 3/4, la hombrera lejana se ve más pequeña.
      const farW = view === 'back34' ? 5 : 6.5;
      const farE = view === 'front34' ? 5 : 6.5;
      shape(g, P.trim, () => g.ellipse(-hw + 1, top + 3, farW, farW === 5 ? 4 : 4.5, 0, 0, Math.PI * 2));
      shape(g, P.trim, () => g.ellipse(hw - 1, top + 3, farE, farE === 5 ? 4 : 4.5, 0, 0, Math.PI * 2));
    } else shape(g, P.trim, () => g.ellipse(1, top + 3, 6.5, 4.5, 0, 0, Math.PI * 2));
  }
  if (style === 'tunica' && front) {
    shape(g, P.trim, () => {
      g.moveTo(cx - 5, top);
      g.lineTo(cx, top + 8);
      g.lineTo(cx + 5, top);
      g.closePath();
    }, false);
  }
  // Cinturón o fajín.
  if (style !== 'capa' || view === 'side') {
    shape(g, style === 'vestido' ? P.trim : darken(P.boots, -0.2), () => g.rect(-hw - (style === 'vestido' ? 1 : 0), hip - 3, w + (style === 'vestido' ? 2 : 0), 4.5), false);
    if (front && style !== 'vestido') shape(g, '#d8b45a', () => g.rect(cx - 2.2, hip - 3.5, 4.4, 5.5), false);
  }
  return style === 'peto' ? lighten(a.pants, 0.25) : style === 'chaqueta' ? P.cloth : style === 'capa' ? lighten(a.trim, 0.3) : P.cloth;
}

/** Dibuja la figura con los pies en (x, y) y una altura de `h` píxeles. */
export function drawFigure(g: CanvasRenderingContext2D, look: Appearance, x: number, y: number, h: number, pose: Pose) {
  const P = palette(look);
  const view = VIEW_OF[pose.facing];
  /** Vista de 3/4: el lado lejano (este de frente, oeste de espaldas) queda detrás y en parte tapado. */
  const q = view === 'front34' || view === 'back34';
  const climbing = pose.climbing && pose.moving && !pose.swimming;
  const speed = climbing ? STRIDE.climb : pose.running ? STRIDE.run : STRIDE.walk;
  const ph = pose.moving ? pose.t * speed : 0;
  // Trepando, zancada corta y los brazos que se alternan hacia arriba (`reach`).
  const swing = pose.moving ? Math.sin(ph) * (climbing ? 0.6 : 1) : 0;
  const reach = climbing ? Math.sin(ph) : 0;
  // Caer: de 0 (de pie) a 1 (tumbado y apagado), con las rodillas que ceden a mitad.
  const down = pose.dead ? (pose.fall === undefined ? 1 : Math.min(1, Math.max(0, pose.fall))) : 0;
  const e = easeInOut(down);
  const sink = e > 0 && e < 1 ? Math.sin(Math.PI * e) * 7 : 0;
  const bob = pose.moving ? Math.abs(Math.sin(ph)) * 2.6 : Math.sin(pose.t * BREATH) * 0.7;
  const blink = !pose.moving && pose.t % BLINK_EVERY < BLINK_MS;
  const bw = look.build;

  gray = e > 0 ? 0.85 * e : 0;
  g.save();
  g.translate(x, y);
  const k = (h / 100) * look.height;
  g.scale(k, k);
  if (e > 0) {
    g.translate(0, -8 * e);
    g.rotate((Math.PI / 2) * e);
    g.globalAlpha *= 1 - 0.25 * e;
  }
  if (MIRRORED.has(pose.facing)) g.scale(-1, 1);
  if (pose.celebrating) g.translate(0, -Math.abs(Math.sin(pose.t * 0.008)) * 12);
  if (pose.crouched) g.scale(1, 0.78);
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // Al caer, las rodillas ceden: baja la cadera y las piernas se acortan lo mismo, así los pies no se levantan.
  const hip = -33 - bob + sink;
  const top = -60 - bob + sink;
  // De 3/4 el torso se ve algo más estrecho: está girado.
  const w = 28 * bw * (q ? 0.84 : 1);
  const headR = 16.5;
  const hy = top - headR + 1;
  const lean = climbing ? (view === 'side' ? 0.16 : q ? 0.09 : 0) : pose.running ? (view === 'side' ? 0.1 : q ? 0.06 : 0) : 0;
  const legLen = 31 - sink;
  const capeColor = look.outfitStyle === 'capa' ? P.cloth : null;

  // Capa por detrás (de frente se ve por los lados; de lado ondea; de 3/4 asoma por el lado lejano).
  if (capeColor && view !== 'back' && view !== 'back34') {
    const flap = pose.moving ? Math.sin(ph * 0.5) * 3 + (pose.running ? 6 : 3) : 0;
    shape(g, P.clothD, () => {
      if (view === 'side') {
        g.moveTo(-4, top + 1);
        g.quadraticCurveTo(-14 - flap, top + 18, -10 - flap * 1.4, -12);
        g.lineTo(2, -14);
        g.closePath();
      } else if (view === 'front34') {
        g.moveTo(-w / 2 + 1, top + 2);
        g.lineTo(-w / 2 - 2, -14);
        g.lineTo(w / 2 + 9 + flap * 0.4, -14);
        g.lineTo(w / 2 + 2, top + 2);
        g.closePath();
      } else {
        g.moveTo(-w / 2 - 1, top + 2);
        g.lineTo(-w / 2 - 6, -14);
        g.lineTo(w / 2 + 6, -14);
        g.lineTo(w / 2 + 1, top + 2);
        g.closePath();
      }
    });
  }
  // Mochila o carcaj de lado: detrás del cuerpo. De 3/4 de frente asoman por el lado lejano.
  if (view === 'side' && look.accessory === 'mochila') shape(g, '#6d5236', () => g.roundRect(-w / 2 - 6, top + 4, 9, 20, 3));
  if (view === 'side' && look.accessory === 'carcaj') shape(g, '#5a4028', () => g.roundRect(-w / 2 - 4, top - 6, 6, 28, 2));
  if (view === 'front34' && look.accessory === 'mochila') shape(g, '#6d5236', () => g.roundRect(w / 2 - 5, top + 4, 9, 19, 3));
  if (view === 'front34' && look.accessory === 'carcaj') shape(g, '#5a4028', () => g.roundRect(w / 2 - 3, top - 6, 6, 28, 2));

  g.save();
  g.rotate(lean);
  if (!pose.swimming) {
    if (view === 'side') {
      const a = swing * (pose.running ? 0.75 : 0.5);
      leg(g, P, 1, hip, legLen, -a, 10.5, true);
      leg(g, P, -1, hip, legLen, a, 10.5, false);
    } else {
      const sw = look.outfitStyle === 'mono' ? P.cloth : null;
      if (sw) {
        P.pants = sw;
        P.pantsD = darken(sw, 0.3);
      }
      if (q) {
        // De 3/4, piernas más juntas y una zancada entre la de frente y la de lado; la lejana, detrás.
        const a = swing * (pose.running ? 0.55 : 0.38);
        const farX = view === 'front34' ? 4 * bw : -4 * bw;
        // La lejana, algo más alta: queda detrás en el suelo.
        leg(g, P, farX, hip, legLen - 1.5 - Math.max(0, -swing) * 2.5, a, 10.5, true);
        leg(g, P, -farX, hip, legLen - Math.max(0, swing) * 2.5, -a, 10.5, view === 'back34');
      } else {
        const lift = 5;
        const L1 = legLen - Math.max(0, swing) * lift;
        const L2 = legLen - Math.max(0, -swing) * lift;
        leg(g, P, -6.5 * bw, hip, L1, 0.03, 10.5, false);
        leg(g, P, 6.5 * bw, hip, L2, -0.03, 10.5, true);
      }
      if (sw) {
        P.pants = look.pants;
        P.pantsD = darken(look.pants, 0.3);
      }
    }
  }
  const armLen = 25;
  const armA = pose.celebrating ? 2.7 : pose.moving ? swing * (pose.running ? 0.9 : 0.6) : 0.06;
  const sleeveGuess = look.outfitStyle === 'peto' ? lighten(look.pants, 0.25) : look.outfitStyle === 'capa' ? lighten(look.trim, 0.3) : look.outfit;
  // De 3/4, los brazos se balancean en sentidos opuestos; el lejano, medio tapado por el torso.
  const qA = pose.celebrating ? 2.7 : pose.moving ? swing * (pose.running ? 0.8 : 0.5) : 0.08 + Math.sin(pose.t * BREATH) * 0.03;
  // Brazo de atrás (de lado) o el lejano (de 3/4).
  if (view === 'side') arm(g, P, 2, top + 3, armLen, climbing ? -2.2 + 0.5 * reach : armA, sleeveGuess, true);
  const farA = climbing ? 2.4 - 0.4 * reach : qA;
  if (q) arm(g, P, view === 'front34' ? w / 2 - 2.5 : -w / 2 + 2.5, top + 3, armLen - 1, view === 'front34' ? -farA : farA, sleeveGuess, true);
  const sleeve = torso(g, look, P, top, hip, w, view);
  // Espalda: capa, mochila o carcaj por encima del torso. De 3/4, la espalda queda corrida hacia el oeste.
  if (view === 'back' || view === 'back34') {
    const o = view === 'back34' ? -2 : 0;
    if (capeColor) shape(g, P.cloth, () => {
      g.moveTo(o - w / 2 - 1, top + 1);
      g.lineTo(o - w / 2 - 5, -13);
      g.lineTo(o + w / 2 + 5, -13);
      g.lineTo(o + w / 2 + 1, top + 1);
      g.closePath();
    });
    if (look.accessory === 'mochila') shape(g, '#6d5236', () => g.roundRect(o - 9, top + 5, 18, 20, 4));
    if (look.accessory === 'carcaj') {
      g.save();
      g.translate(o, 0);
      g.rotate(-0.4);
      shape(g, '#5a4028', () => g.roundRect(-3, top - 4, 7, 30, 2));
      g.restore();
    }
  }
  if (q) {
    const nearA = climbing ? 2.4 + 0.4 * reach : qA;
    arm(g, P, view === 'front34' ? -w / 2 - 1.5 : w / 2 + 1.5, top + 3, armLen, view === 'front34' ? nearA : -nearA, sleeve, view === 'back34');
    if (view === 'front34' && (look.accessory === 'mochila' || look.accessory === 'carcaj')) {
      g.strokeStyle = tone('#4a3624');
      g.lineWidth = 2.6;
      g.beginPath();
      if (look.accessory === 'mochila') {
        g.moveTo(-w / 2 + 6, top + 1);
        g.lineTo(-w / 2 + 7, top + 18);
        g.moveTo(w / 2 - 3, top + 1);
        g.lineTo(w / 2 - 4, top + 18);
      } else {
        g.moveTo(w / 2 - 1, top + 1);
        g.lineTo(-w / 2 + 5, hip - 4);
      }
      g.stroke();
    }
  }
  if (view === 'front' || view === 'back') {
    const s1 = pose.celebrating ? 2.7 : climbing ? 2.5 + 0.4 * reach : 0.12 + (pose.moving ? swing * 0.35 : Math.sin(pose.t * BREATH) * 0.03);
    const s2 = pose.celebrating ? -2.7 : climbing ? -(2.5 - 0.4 * reach) : -0.12 + (pose.moving ? swing * 0.35 : -Math.sin(pose.t * BREATH) * 0.03);
    arm(g, P, -w / 2 - 1.5, top + 3, armLen, s1, sleeve, false);
    arm(g, P, w / 2 + 1.5, top + 3, armLen, s2, sleeve, true);
    if (view === 'front' && (look.accessory === 'mochila' || look.accessory === 'carcaj')) {
      g.strokeStyle = tone('#4a3624');
      g.lineWidth = 2.6;
      g.beginPath();
      if (look.accessory === 'mochila') {
        g.moveTo(-w / 2 + 5, top + 1);
        g.lineTo(-w / 2 + 6, top + 18);
        g.moveTo(w / 2 - 5, top + 1);
        g.lineTo(w / 2 - 6, top + 18);
      } else {
        g.moveTo(w / 2 - 3, top + 1);
        g.lineTo(-w / 2 + 3, hip - 4);
      }
      g.stroke();
    }
  }
  // Cabeza.
  const hx = view === 'side' ? 1 : view === 'front34' ? 0.5 : view === 'back34' ? -0.5 : 0;
  g.save();
  g.translate(hx, 0);
  hairBack(g, look, P, hy, headR, view);
  shape(g, P.skin, () => g.arc(0, hy, headR, 0, Math.PI * 2));
  if (view !== 'back' && view !== 'back34') {
    // Sombra de la cara hacia el este y orejas.
    g.fillStyle = tone(P.skinD);
    g.globalAlpha = 0.6;
    g.beginPath();
    g.arc(0, hy, headR - 1.2, -Math.PI * 0.35, Math.PI * 0.55);
    g.quadraticCurveTo(headR * 0.25, hy + 2, headR * 0.6, hy - headR * 0.8);
    g.fill();
    g.globalAlpha = 1;
    if (view === 'side') shape(g, P.skinD, () => g.ellipse(-3, hy + 2, 3, 4, 0, 0, Math.PI * 2));
    // De 3/4 de frente se ve la oreja cercana, la del oeste.
    if (view === 'front34') shape(g, P.skinD, () => g.ellipse(-headR * 0.8, hy + 2, 2.6, 3.8, 0, 0, Math.PI * 2));
    face(g, P, hy, headR, view === 'side' ? 'side' : view === 'front34' ? 'front34' : 'front', blink, pose.dead && e >= 1);
  }
  hairFront(g, look, P, hy, headR, view);
  // De 3/4 de espaldas asoma la oreja cercana (la del este) por el borde del pelo.
  if (view === 'back34') shape(g, P.skinD, () => g.ellipse(headR * 0.9, hy + 2.5, 2.4, 3.6, 0, 0, Math.PI * 2));
  if (look.accessory === 'carcaj' && view === 'front') {
    // Plumas de las flechas asomando por el hombro.
    g.fillStyle = tone('#e8dcc0');
    for (const dx of [0, 3.5, 7]) {
      g.beginPath();
      g.moveTo(-headR - 2 + dx, top - 3);
      g.lineTo(-headR + dx, top - 11);
      g.lineTo(-headR + 2 + dx, top - 3);
      g.fill();
    }
  }
  g.restore();
  if (look.accessory === 'bufanda') {
    shape(g, P.trim, () => g.roundRect(-w / 2 + 3, top - 3, w - 6, 7, 3.5));
    if (view !== 'back' && view !== 'back34') shape(g, P.trimD, () => g.roundRect(view === 'side' ? -6 - (pose.moving ? 4 : 0) : view === 'front34' ? 6 : 4, top + 2, 5, 13, 2));
  }
  // Brazo de delante (de lado).
  if (view === 'side') arm(g, P, -1, top + 3, armLen, climbing ? -2.2 - 0.5 * reach : -armA, sleeve, false);
  g.restore();
  g.restore();
  gray = 0;
}
