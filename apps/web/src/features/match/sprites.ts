import type { Appearance } from '@ceniza/shared';
import { BLINK_EVERY, BLINK_MS, BREATH, STRIDE, drawFigure, type Pose } from './figure';

const TAU = 2 * Math.PI;
/** Fotogramas por ciclo al moverse (la capa ondea a media frecuencia, así que el ciclo es de 4π): 12 por zancada. */
const MOVE_STEPS = 24;
/** Fotogramas por respiración en reposo (unos 2,1 s). */
const IDLE_STEPS = 16;
const mod = (a: number, m: number) => ((a % m) + m) % m;

export interface Frame {
  /** Lo que distingue el fotograma: paso de la animación, parpadeo, nadar, agacharse… */
  readonly key: string;
  /** La postura con el tiempo justo del fotograma (se calcula solo si hace falta dibujarlo). */
  readonly pose: Pose;
}

const frame = (key: string, make: () => Pose): Frame => {
  let p: Pose | null = null;
  return {
    key,
    get pose() {
      return (p ??= make());
    },
  };
};

/**
 * Fotograma de la animación de una postura: el paso más cercano de 24 por ciclo al moverse, de 16 por
 * respiración en reposo (con su parpadeo), o el de caído del todo. A mitad de una caída o celebrando no hay
 * fotograma (null): se dibuja tal cual.
 */
export function animFrame(pose: Pose): Frame | null {
  if (pose.celebrating) return null;
  if (pose.dead) {
    if (pose.fall !== undefined && pose.fall < 1) return null;
    return frame('dead', () => ({ ...pose, t: 1000, fall: undefined, moving: false }));
  }
  const state = `${pose.swimming ? 's' : ''}${pose.crouched ? 'k' : ''}`;
  if (pose.moving) {
    const climbing = pose.climbing && !pose.swimming;
    const speed = climbing ? STRIDE.climb : pose.running ? STRIDE.run : STRIDE.walk;
    const step = (2 * TAU) / MOVE_STEPS;
    const i = Math.round(mod(pose.t * speed, 2 * TAU) / step) % MOVE_STEPS;
    return frame(`${climbing ? 'c' : pose.running ? 'r' : 'w'}${i}${state}`, () => ({ ...pose, t: (i * step) / speed }));
  }
  const step = TAU / IDLE_STEPS;
  const i = Math.round(mod(pose.t * BREATH, TAU) / step) % IDLE_STEPS;
  const blink = mod(pose.t, BLINK_EVERY) < BLINK_MS;
  return frame(`i${i}${blink ? 'b' : ''}${state}`, () => {
    // Un tiempo con esa respiración y ese parpadeo: la respiración se repite cada 2π/BREATH ms.
    const base = (i * step) / BREATH;
    for (let j = 0; j < 4000; j++) {
      const t = base + j * (TAU / BREATH);
      if (mod(t, BLINK_EVERY) < BLINK_MS === blink) return { ...pose, t };
    }
    return { ...pose, t: base };
  });
}

/** Margen de la imagen alrededor de los pies, en tamaños de figura: de pie, y caído (tumbado hacia un lado). */
const STAND = { left: 0.75, right: 0.75, top: 1.5, bottom: 0.35 };
const LYING = { left: 0.7, right: 1.5, top: 0.9, bottom: 0.7 };

interface Entry {
  c: HTMLCanvasElement;
  ox: number;
  oy: number;
  px: number;
}

/**
 * Figuras del mapa guardadas como imágenes, una por participante, rumbo, tamaño, densidad y fotograma de su
 * animación: cada una se dibuja una vez y después se copia sin escalar, en píxeles reales enteros. Sin GPU,
 * dibujar las figuras era lo que más costaba de cada fotograma una vez arreglado el terreno (medido en la
 * fase 7). Caben unos 6 millones de píxeles (24 MB); si no, se olvidan las que llevan más tiempo sin dibujarse.
 */
export class FigureSprites {
  private cache = new Map<string, Entry>();
  private px = 0;

  constructor(
    private readonly make: (w: number, h: number) => HTMLCanvasElement = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    },
    private readonly maxPx = 6_000_000,
  ) {}

  /**
   * Como `drawFigure(g, look, x, y, fig, pose)`, con `g` en la densidad `dpr`. Con `steady` a false (el zoom está
   * cambiando y el tamaño de la figura con él) se dibuja directamente: guardarla no serviría para el siguiente
   * fotograma y echaría de la caché las que sí sirven.
   */
  draw(g: CanvasRenderingContext2D, id: string, look: Appearance, x: number, y: number, fig: number, pose: Pose, dpr: number, steady = true) {
    const f = steady ? animFrame(pose) : null;
    if (!f) {
      drawFigure(g, look, x, y, fig, pose);
      return;
    }
    const key = `${id}|${pose.facing}|${fig}|${dpr}|${f.key}`;
    let e = this.cache.get(key);
    if (e) this.cache.delete(key); // vuelve al final: los primeros son los que menos se usan
    else {
      const b = pose.dead ? LYING : STAND;
      // Pies en un píxel entero de la imagen: así la copia queda en la misma rejilla de píxeles que el mapa.
      const ox = Math.ceil(b.left * fig * dpr);
      const oy = Math.ceil(b.top * fig * dpr);
      const w = Math.ceil((b.left + b.right) * fig * dpr);
      const h = Math.ceil((b.top + b.bottom) * fig * dpr);
      // Si no cabe, fuera las que menos se usan; un lienzo del mismo tamaño se reutiliza (crear lienzos cuesta).
      let reuse: HTMLCanvasElement | null = null;
      for (const [k, old] of this.cache) {
        if (this.px + w * h <= this.maxPx) break;
        this.cache.delete(k);
        this.px -= old.px;
        if (!reuse && old.c.width === w && old.c.height === h) reuse = old.c;
      }
      const c = reuse ?? this.make(w, h);
      const s = c.getContext('2d')!;
      if (reuse) {
        s.setTransform(1, 0, 0, 1, 0, 0);
        s.clearRect(0, 0, w, h);
      }
      s.setTransform(dpr, 0, 0, dpr, ox, oy);
      drawFigure(s, look, 0, 0, fig, f.pose);
      e = { c, ox, oy, px: w * h };
      this.px += e.px;
    }
    this.cache.set(key, e);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(e.c, Math.round(x * dpr - e.ox), Math.round(y * dpr - e.oy));
    g.restore();
  }
}
