import type { Atlas, SpriteRect } from './props';
import { CHUNK, TILE, type MapMode, type TerrainArt } from './terrain';

/**
 * Caché de bloques del terreno por nivel de detalle (8, 16, 32 o 48 px por casilla en píxeles reales de
 * pantalla). Cada fotograma pinta los bloques visibles que ya tiene; los que faltan se dibujan primero con
 * lo que haya (otro nivel o la vista general) y se van generando dentro de un presupuesto de tiempo, del
 * centro hacia fuera, para que el arrastre y el zoom no se atasquen. Los menos usados se descartan.
 */
interface Entry {
  c: HTMLCanvasElement;
  used: number;
  px: number;
}

export interface ViewBox {
  ox: number;
  oy: number;
  scale: number;
  w: number;
  h: number;
  dpr: number;
}

const LEVELS = [16, 32, 48] as const;

/**
 * Píxeles reales por casilla de los bloques para un zoom. Si el zoom es un número entero (el mapa lo deja así en
 * reposo), los bloques se hacen a ese tamaño y se copian sin escalar: sin GPU, escalarlos con filtro era lo que más
 * costaba de cada fotograma. Si no (mientras se pellizca o se gira la rueda), el nivel fijo que toque. 8 es la vista
 * general del mapa.
 */
export function chunkLevel(need: number): number {
  if (need <= 12) return 8;
  const n = Math.round(need);
  if (Math.abs(need - n) < 1e-6 && n <= 48) return n;
  return need <= 22 ? 16 : need <= 38 ? 32 : 48;
}

export class TerrainView {
  private cache = new Map<string, Entry>();
  private overviews: Partial<Record<MapMode, HTMLCanvasElement>> = {};
  private px = 0;
  private frame = 0;

  constructor(
    readonly art: TerrainArt,
    private readonly maxPx = 14_000_000,
  ) {}

  invalidate() {
    this.cache.clear();
    this.overviews = {};
    this.px = 0;
  }

  overview(mode: MapMode): HTMLCanvasElement {
    return (this.overviews[mode] ??= this.art.renderOverview(mode));
  }

  /** Pinta el terreno visible. Con `render: false` solo usa lo que ya hay (p. ej. durante el sobrevuelo). */
  draw(g: CanvasRenderingContext2D, v: ViewBox, mode: MapMode, opts: { render?: boolean; budgetMs?: number } = {}) {
    this.frame++;
    const s = v.scale * TILE;
    const need = s * v.dpr;
    const level = chunkLevel(need);
    const size = this.art.size;
    const ov = this.overview(mode);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    // Los bloques ya están casi a la resolución de pantalla: el filtro bilineal simple basta y cuesta menos.
    g.imageSmoothingQuality = 'low';
    if (level === 8) {
      g.drawImage(ov, v.ox * v.dpr, v.oy * v.dpr, size * s * v.dpr, size * s * v.dpr);
      g.restore();
      return;
    }
    const n = size / CHUNK;
    const span = CHUNK * s;
    const cx0 = Math.max(0, Math.floor(-v.ox / span));
    const cx1 = Math.min(n - 1, Math.floor((v.w - v.ox) / span));
    const cy0 = Math.max(0, Math.floor(-v.oy / span));
    const cy1 = Math.min(n - 1, Math.floor((v.h - v.oy) / span));
    const rect = (cx: number, cy: number) => {
      const X0 = Math.round((v.ox + cx * span) * v.dpr);
      const Y0 = Math.round((v.oy + cy * span) * v.dpr);
      return [X0, Y0, Math.round((v.ox + (cx + 1) * span) * v.dpr) - X0, Math.round((v.oy + (cy + 1) * span) * v.dpr) - Y0] as const;
    };
    const missing: [number, number, number][] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const [X, Y, W, H] = rect(cx, cy);
        const e = this.cache.get(`${mode}:${level}:${cx}:${cy}`);
        if (e) {
          e.used = this.frame;
          g.drawImage(e.c, X, Y, W, H);
          continue;
        }
        const alt = LEVELS.map((L) => this.cache.get(`${mode}:${L}:${cx}:${cy}`)).find(Boolean);
        if (alt) g.drawImage(alt.c, X, Y, W, H);
        else g.drawImage(ov, cx * CHUNK * 8, cy * CHUNK * 8, CHUNK * 8, CHUNK * 8, X, Y, W, H);
        const mx = v.ox + (cx + 0.5) * span - v.w / 2;
        const my = v.oy + (cy + 0.5) * span - v.h / 2;
        missing.push([cx, cy, mx * mx + my * my]);
      }
    }
    if (opts.render !== false && missing.length) {
      missing.sort((a, b) => a[2] - b[2]);
      const t0 = performance.now();
      const budget = opts.budgetMs ?? 7;
      for (const [cx, cy] of missing) {
        const c = this.art.renderChunk(level, cx, cy, mode);
        const px = c.width * c.height;
        this.cache.set(`${mode}:${level}:${cx}:${cy}`, { c, used: this.frame, px });
        this.px += px;
        const [X, Y, W, H] = rect(cx, cy);
        g.drawImage(c, X, Y, W, H);
        if (performance.now() - t0 > budget) break;
      }
      this.evict();
    }
    g.restore();
  }

  private evict() {
    if (this.px <= this.maxPx) return;
    const list = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of list) {
      if (this.px <= this.maxPx * 0.8 || e.used === this.frame) break;
      this.cache.delete(k);
      this.px -= e.px;
    }
  }
}

/** Hojas de sprites del mapa (SpriteCook), si están en /map/atlas.json; si no, se dibuja en vectorial. */
export async function loadAtlas(): Promise<Atlas | null> {
  try {
    const res = await fetch('/map/atlas.json');
    if (!res.ok) return null;
    const spec = (await res.json()) as { sheets: string[]; sprites: Record<string, SpriteRect> };
    const sheets = await Promise.all(
      spec.sheets.map(
        (src) =>
          new Promise<HTMLImageElement>((ok, ko) => {
            const img = new Image();
            img.onload = () => ok(img);
            img.onerror = ko;
            img.src = `/map/${src}`;
          }),
      ),
    );
    const shadows = sheets.map((img) => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      return c;
    });
    return { sheets, shadows, sprites: spec.sprites };
  } catch {
    return null;
  }
}
