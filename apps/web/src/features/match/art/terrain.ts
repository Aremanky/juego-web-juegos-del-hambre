import { T } from '@ceniza/engine';
import type { PoiDTO } from '@ceniza/shared';
import { chaikin, isoSegments } from './iso';
import { fbm, hashString, makeNoise, smooth } from './noise';
import { buildProps, drawProp, drawPropShadow, TALL, type Atlas, type Light, type Prop } from './props';

/**
 * Arte del terreno de la arena (GDD §7). En vez de una imagen de 8 px por casilla ampliada (que se veía a
 * cuadros), el mapa se pinta por bloques de 16×16 casillas a la resolución del zoom de cada momento:
 *  - un suelo continuo calculado una vez por píxel (biomas con bordes orgánicos por deformación de dominio,
 *    relieve sombreado con luz del noroeste, profundidad del agua);
 *  - encima, en vectorial y nítido: costas, ríos y caminos curvos, la explanada empedrada y los objetos
 *    (árboles, rocas, montañas, casas, ruinas…) ordenados por profundidad, con sombras hacia el sureste.
 * El holograma de la Ciudadela es otra pasada: curvas de nivel, agua, ríos y caminos en turquesa.
 */
export const TILE = 8;
export const CHUNK = 16;
export type MapMode = 'carta' | 'holograma';

export interface ArtMap {
  seed: string;
  size: number;
  tiles: Uint8Array;
  heights: Uint8Array;
  pois: PoiDTO[];
  center: { x: number; y: number };
  rivers: number[][];
  roads: number[][];
}

type RGB = [number, number, number];

/** Recorridos suavizados en casillas (centros) con el ancho de cada tramo. */
interface Path {
  pts: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function toPath(cells: number[]): Path {
  const raw: number[] = [];
  for (let i = 0; i + 1 < cells.length; i += 2) raw.push(cells[i] + 0.5, cells[i + 1] + 0.5);
  const pts = chaikin(raw, 3);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]);
    maxY = Math.max(maxY, pts[i + 1]);
  }
  return { pts, minX, minY, maxX, maxY };
}

/** Partidas antiguas sin recorridos: se unen las casillas vecinas del mismo tipo. */
function linksFromTiles(size: number, tiles: Uint8Array, match: (t: number) => boolean, also: (t: number) => boolean): number[][] {
  const out: number[][] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? -1 : tiles[y * size + x]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!match(at(x, y))) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        if (!also(at(x + dx, y + dy))) continue;
        if (dx && dy && (match(at(x + dx, y)) || match(at(x, y + dy)))) continue;
        out.push([x, y, x + dx, y + dy]);
      }
    }
  }
  return out;
}

export class TerrainArt {
  readonly size: number;
  readonly props: Prop[];
  readonly lights: Light[];
  readonly plaza: { x: number; y: number; r: number };
  atlas: Atlas | null = null;
  private readonly m: ArtMap;
  private readonly seedNum: number;
  private readonly warp: (x: number, y: number) => number;
  private readonly detail: (x: number, y: number) => number;
  private readonly water: Float32Array;
  private readonly depth: Float32Array;
  private readonly hs: Float32Array;
  private readonly shadeGrid: Float32Array;
  private readonly rivers: Path[];
  private readonly roads: Path[];
  private readonly buckets: number[][];
  private readonly G: number;
  private tex: Partial<Record<MapMode, HTMLCanvasElement>> = {};
  private grain: HTMLCanvasElement | null = null;
  private scratch: HTMLCanvasElement | null = null;

  constructor(m: ArtMap) {
    this.m = m;
    const { size, tiles, heights } = m;
    this.size = size;
    this.seedNum = hashString(m.seed || 'ceniza');
    this.warp = makeNoise(this.seedNum ^ 0x9e37);
    this.detail = makeNoise(this.seedNum ^ 0x51ed);
    this.G = size <= 96 ? 6 : 4;
    const n = size * size;
    this.water = new Float32Array(n);
    for (let i = 0; i < n; i++) this.water[i] = tiles[i] === T.AGUA ? 1 : 0;
    this.depth = blur(blur(this.water, size), size);
    const h = new Float32Array(n);
    for (let i = 0; i < n; i++) h[i] = heights[i] / 255;
    this.hs = blur(blur(h, size), size);
    this.shadeGrid = new Float32Array(n);
    const hAt = (x: number, y: number) => this.hs[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const slope = (hAt(x - 1, y) - hAt(x + 1, y) + hAt(x, y - 1) - hAt(x, y + 1)) * 255;
        this.shadeGrid[y * size + x] = Math.max(0.72, Math.min(1.28, 1 + slope * 0.012));
      }
    }
    const built = buildProps(m, this.seedNum);
    this.props = built.props;
    this.lights = built.lights;
    const nc = size / CHUNK;
    this.buckets = Array.from({ length: nc * nc }, () => []);
    this.props.forEach((p, i) => {
      const cx = Math.min(nc - 1, Math.max(0, Math.floor(p.x / CHUNK)));
      const cy = Math.min(nc - 1, Math.max(0, Math.floor(p.y / CHUNK)));
      this.buckets[cy * nc + cx].push(i);
    });
    const isRiver = (t: number) => t === T.RIO;
    const wet = (t: number) => t === T.RIO || t === T.AGUA;
    const isRoad = (t: number) => t === T.CAMINO;
    const roadEnd = (t: number) => t === T.CAMINO || t === T.PLAZA || t === T.RUINAS || t === T.POBLADO;
    this.rivers = (m.rivers.length ? m.rivers : linksFromTiles(size, tiles, isRiver, wet)).map(toPath);
    this.roads = (m.roads.length ? m.roads : linksFromTiles(size, tiles, isRoad, roadEnd)).map(toPath);
    let r = 0;
    while (r < size && tiles[m.center.y * size + m.center.x + r + 1] === T.PLAZA) r++;
    this.plaza = { x: m.center.x + 0.5, y: m.center.y + 0.5, r: r + 0.45 };
  }

  /** Coordenadas deformadas: bordes de bioma orgánicos sin apartarse más de media casilla de la rejilla. */
  private warped(u: number, v: number): [number, number] {
    const a = 0.42;
    return [u + a * fbm(this.warp, u * 0.33, v * 0.33, 2), v + a * fbm(this.warp, u * 0.33 + 41.7, v * 0.33 + 13.1, 2)];
  }

  private bilinear(f: Float32Array, u: number, v: number): number {
    const s = this.size;
    const fx = Math.min(s - 1.001, Math.max(0, u - 0.5));
    const fy = Math.min(s - 1.001, Math.max(0, v - 0.5));
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const tx = fx - x;
    const ty = fy - y;
    const i = y * s + x;
    const x1 = Math.min(s - 1, x + 1);
    const y1 = Math.min(s - 1, y + 1);
    const a = f[i] + (f[y * s + x1] - f[i]) * tx;
    const b = f[y1 * s + x] + (f[y1 * s + x1] - f[y1 * s + x]) * tx;
    return a + (b - a) * ty;
  }

  /** Campo del agua (0–1) con la misma deformación que el suelo: su isolínea 0,5 es la orilla. */
  private waterField(u: number, v: number): number {
    const [wu, wv] = this.warped(u, v);
    return this.bilinear(this.water, wu, wv);
  }

  /** Color del suelo de una clase de terreno en un punto, con su textura. */
  private ground(t: number, u: number, v: number, large: number, small: number, out: RGB): boolean {
    const set = (c: RGB, k = 1) => {
      out[0] += c[0] * k;
      out[1] += c[1] * k;
      out[2] += c[2] * k;
    };
    switch (t) {
      case T.AGUA: {
        const d = smooth(0.5, 0.97, this.bilinear(this.depth, u, v));
        const c: RGB = [62 - 34 * d + small * 4, 106 - 46 * d + small * 5, 110 - 38 * d + small * 5];
        set(c);
        return true;
      }
      case T.ORILLA:
        set([150 + large * 12 + small * 8, 134 + large * 10 + small * 7, 92 + large * 6 + small * 5]);
        return true;
      case T.PRADERA: {
        const dry = smooth(0.15, 0.6, large);
        set([86 + dry * 30 + small * 8, 100 + dry * 14 + small * 8, 52 + dry * 6 + small * 4]);
        return true;
      }
      case T.BOSQUE:
        set([56 + large * 8 + small * 6, 76 + large * 8 + small * 6, 44 + small * 4]);
        return true;
      case T.DENSO:
        set([40 + small * 5, 58 + small * 6, 36 + small * 4]);
        return true;
      case T.ROCA:
        set([112 + large * 10 + small * 14, 104 + large * 8 + small * 12, 88 + small * 10]);
        return true;
      case T.MONTANA:
        set([112 + large * 16 + small * 16, 104 + large * 12 + small * 14, 90 + large * 6 + small * 12]);
        return true;
      case T.CUMBRE:
        set([214 + small * 10, 214 + small * 10, 208 + small * 9]);
        return true;
      case T.PLAZA:
        set([142, 130, 104]);
        return true;
      case T.PANTANO: {
        const pool = smooth(0.18, 0.32, small + large * 0.4);
        set([70 - pool * 22 + small * 5, 80 - pool * 18 + small * 5, 56 - pool * 2 + small * 4]);
        return true;
      }
      case T.RUINAS:
        set([104 + small * 12, 104 + small * 10, 80 + small * 8]);
        return true;
      case T.POBLADO:
        set([138 + small * 10, 118 + small * 8, 80 + small * 6]);
        return true;
      default:
        return false; // ríos y caminos: el suelo es el de alrededor y el trazo va encima
    }
  }

  private groundTexture(mode: MapMode): HTMLCanvasElement {
    const cached = this.tex[mode];
    if (cached) return cached;
    const { size, tiles } = this.m;
    const G = this.G;
    const W = size * G;
    const c = document.createElement('canvas');
    c.width = c.height = W;
    const g = c.getContext('2d')!;
    const img = g.createImageData(W, W);
    const d = img.data;
    const acc: RGB = [0, 0, 0];
    const tmp: RGB = [0, 0, 0];
    const holo = mode === 'holograma';
    for (let py = 0; py < W; py++) {
      const v = (py + 0.5) / G;
      for (let px = 0; px < W; px++) {
        const u = (px + 0.5) / G;
        const o = (py * W + px) * 4;
        const shade = this.bilinear(this.shadeGrid, u, v);
        if (holo) {
          const wv = this.waterField(u, v);
          const hh = this.bilinear(this.hs, u, v);
          const k = 0.8 + (shade - 1) * 1.6;
          d[o] = (6 + hh * 10) * k + wv * 6;
          d[o + 1] = (16 + hh * 16) * k + wv * 26;
          d[o + 2] = (15 + hh * 14) * k + wv * 24;
          d[o + 3] = 255;
          continue;
        }
        const [wu, wv] = this.warped(u, v);
        const large = fbm(this.detail, u * 0.18, v * 0.18, 2);
        const small = this.detail(u * 2.3 + 91.3, v * 2.3 + 17.7);
        const fx = Math.min(size - 1.001, Math.max(0, wu - 0.5));
        const fy = Math.min(size - 1.001, Math.max(0, wv - 0.5));
        const x = Math.floor(fx);
        const y = Math.floor(fy);
        const tx = fx - x;
        const ty = fy - y;
        acc[0] = acc[1] = acc[2] = 0;
        let wsum = 0;
        for (let k = 0; k < 4; k++) {
          const xx = Math.min(size - 1, x + (k & 1));
          const yy = Math.min(size - 1, y + (k >> 1));
          let w = (k & 1 ? tx : 1 - tx) * (k >> 1 ? ty : 1 - ty);
          if (w <= 0) continue;
          w = w * w * w;
          tmp[0] = tmp[1] = tmp[2] = 0;
          if (!this.ground(tiles[yy * size + xx], u, v, large, small, tmp)) continue;
          acc[0] += tmp[0] * w;
          acc[1] += tmp[1] * w;
          acc[2] += tmp[2] * w;
          wsum += w;
        }
        if (wsum === 0) {
          acc[0] = 120;
          acc[1] = 102;
          acc[2] = 70;
          wsum = 1;
        }
        // El agua no lleva sombreado de relieve.
        const lit = this.bilinear(this.water, u, v) > 0.5 ? 1 : shade;
        d[o] = (acc[0] / wsum) * lit;
        d[o + 1] = (acc[1] / wsum) * lit;
        d[o + 2] = (acc[2] / wsum) * lit;
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.tex[mode] = c;
    return c;
  }

  private grainPattern(g: CanvasRenderingContext2D): CanvasPattern | null {
    if (!this.grain) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      const img = x.createImageData(64, 64);
      for (let i = 0; i < 64 * 64; i++) {
        const v = 128 + (Math.floor(this.detail(i % 64, Math.floor(i / 64)) * 70) + ((i * 2654435761) >>> 24) % 30 - 15);
        img.data.set([v, v, v, 255], i * 4);
      }
      x.putImageData(img, 0, 0);
      this.grain = c;
    }
    const p = g.createPattern(this.grain, 'repeat');
    p?.setTransform(new DOMMatrix([1 / 16, 0, 0, 1 / 16, 0, 0]));
    return p;
  }

  private strokeSegs(g: CanvasRenderingContext2D, segs: number[]) {
    g.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      g.moveTo(segs[i], segs[i + 1]);
      g.lineTo(segs[i + 2], segs[i + 3]);
    }
    g.stroke();
  }

  private field(x0: number, y0: number, w: number, h: number, per: number, f: (u: number, v: number) => number) {
    const gw = Math.round(w * per) + 1;
    const gh = Math.round(h * per) + 1;
    const vals = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) vals[j * gw + i] = f(x0 + i / per, y0 + j / per);
    return { vals, gw, gh };
  }

  private strokePath(g: CanvasRenderingContext2D, p: Path, width: (t: number) => number) {
    const n = p.pts.length / 2;
    const run = 6;
    for (let i = 0; i < n - 1; i += run) {
      g.lineWidth = width((i + run / 2) / Math.max(1, n - 1));
      g.beginPath();
      g.moveTo(p.pts[i * 2], p.pts[i * 2 + 1]);
      for (let k = i + 1; k <= Math.min(n - 1, i + run); k++) g.lineTo(p.pts[k * 2], p.pts[k * 2 + 1]);
      g.stroke();
    }
  }

  /** Pinta la región [x0, x0+w) × [y0, y0+h) de casillas; `g` ya está en coordenadas de casilla. */
  paint(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, level: number, mode: MapMode) {
    const holo = mode === 'holograma';
    const G = this.G;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(this.groundTexture(mode), x0 * G, y0 * G, w * G, h * G, x0, y0, w, h);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const inView = (p: Path) => p.maxX >= x0 - 1 && p.minX <= x0 + w + 1 && p.maxY >= y0 - 1 && p.minY <= y0 + h + 1;
    const coast = this.field(x0 - 1, y0 - 1, w + 2, h + 2, 3, (u, v) => this.waterField(u, v));
    const shore = isoSegments(coast.vals, coast.gw, coast.gh, 0.5, x0 - 1, y0 - 1, 1 / 3);

    if (holo) {
      const hf = this.field(x0 - 1, y0 - 1, w + 2, h + 2, 2, (u, v) => this.bilinear(this.hs, u, v));
      for (let k = 1; k < 16; k++) {
        const segs = isoSegments(hf.vals, hf.gw, hf.gh, k / 16, x0 - 1, y0 - 1, 0.5);
        if (!segs.length) continue;
        g.strokeStyle = k % 4 === 0 ? 'rgba(95,227,208,0.5)' : 'rgba(95,227,208,0.24)';
        g.lineWidth = k % 4 === 0 ? 0.07 : 0.04;
        this.strokeSegs(g, segs);
      }
      g.strokeStyle = 'rgba(95,227,208,0.85)';
      g.lineWidth = 0.08;
      this.strokeSegs(g, shore);
      g.strokeStyle = 'rgba(95,227,208,0.75)';
      for (const r of this.rivers) if (inView(r)) this.strokePath(g, r, (t) => 0.1 + t * 0.12);
      g.strokeStyle = 'rgba(95,227,208,0.45)';
      g.setLineDash([0.3, 0.2]);
      for (const r of this.roads) if (inView(r)) this.strokePath(g, r, () => 0.08);
      g.setLineDash([]);
      g.strokeStyle = 'rgba(95,227,208,0.6)';
      g.lineWidth = 0.08;
      g.beginPath();
      g.arc(this.plaza.x, this.plaza.y, this.plaza.r, 0, Math.PI * 2);
      g.stroke();
      return;
    }

    // Grano fino para que el suelo no parezca plástico de cerca.
    const grain = this.grainPattern(g);
    if (grain) {
      g.save();
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = 0.16;
      g.fillStyle = grain;
      g.fillRect(x0, y0, w, h);
      g.restore();
    }

    // Orillas: arena mojada, espuma y un anillo de profundidad.
    if (shore.length) {
      g.strokeStyle = 'rgba(52,46,30,0.32)';
      g.lineWidth = 0.24;
      this.strokeSegs(g, shore);
      g.strokeStyle = 'rgba(214,228,216,0.5)';
      g.lineWidth = 0.05;
      this.strokeSegs(g, shore);
      const inner = isoSegments(coast.vals, coast.gw, coast.gh, 0.82, x0 - 1, y0 - 1, 1 / 3);
      g.strokeStyle = 'rgba(150,196,196,0.16)';
      g.lineWidth = 0.04;
      this.strokeSegs(g, inner);
    }

    // Ríos: más anchos aguas abajo, con orilla, cauce y reflejo.
    const rivers = this.rivers.filter(inView);
    g.strokeStyle = 'rgba(58,52,32,0.55)';
    for (const r of rivers) this.strokePath(g, r, (t) => 0.5 + t * 0.5);
    g.strokeStyle = '#2f5a64';
    for (const r of rivers) this.strokePath(g, r, (t) => 0.32 + t * 0.42);
    g.save();
    g.translate(-0.05, -0.05);
    g.strokeStyle = 'rgba(150,200,200,0.3)';
    for (const r of rivers) this.strokePath(g, r, (t) => 0.08 + t * 0.1);
    g.restore();

    // Caminos de tierra con borde y huella central.
    const roads = this.roads.filter(inView);
    g.strokeStyle = 'rgba(48,38,24,0.32)';
    for (const r of roads) this.strokePath(g, r, () => 0.52);
    g.strokeStyle = '#9b855a';
    for (const r of roads) this.strokePath(g, r, () => 0.38);
    g.strokeStyle = 'rgba(214,192,140,0.32)';
    for (const r of roads) this.strokePath(g, r, () => 0.12);

    this.paintPlaza(g, x0, y0, w, h);
    this.paintProps(g, x0, y0, w, h, level);
  }

  private paintPlaza(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
    const { x, y, r } = this.plaza;
    if (r < 1 || x + r < x0 || x - r > x0 + w || y + r < y0 || y - r > y0 + h) return;
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#8b806a';
    g.fillRect(x - r, y - r, r * 2, r * 2);
    // Anillos de losas con juntas; cada losa con su tono.
    const ring = 0.72;
    for (let k = 0, rin = 1.15; rin < r; k++, rin += ring) {
      const n = Math.max(8, Math.round((Math.PI * 2 * (rin + ring / 2)) / 0.85));
      for (let s = 0; s < n; s++) {
        const a0 = (s / n) * Math.PI * 2 + k * 0.37;
        const a1 = ((s + 1) / n) * Math.PI * 2 + k * 0.37;
        const t = ((s * 7 + k * 13) % 9) / 9;
        g.fillStyle = `rgb(${132 + t * 26},${121 + t * 22},${98 + t * 18})`;
        g.beginPath();
        g.arc(x, y, rin + ring, a0, a1);
        g.arc(x, y, rin, a1, a0, true);
        g.closePath();
        g.fill();
      }
    }
    g.strokeStyle = 'rgba(40,32,22,0.35)';
    g.lineWidth = 0.035;
    g.beginPath();
    for (let rin = 1.15; rin < r; rin += ring) {
      g.moveTo(x + rin, y);
      g.arc(x, y, rin, 0, Math.PI * 2);
    }
    g.stroke();
    // Estrado del Obelisco.
    g.fillStyle = '#a69b80';
    g.beginPath();
    g.arc(x, y, 1.15, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,32,22,0.4)';
    g.lineWidth = 0.05;
    g.stroke();
    g.restore();
    // Bordillo.
    g.strokeStyle = '#5c5442';
    g.lineWidth = 0.16;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(230,220,196,0.25)';
    g.lineWidth = 0.04;
    g.beginPath();
    g.arc(x - 0.03, y - 0.03, r - 0.06, Math.PI * 0.9, Math.PI * 1.8);
    g.stroke();
  }

  private paintProps(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, level: number) {
    const nc = this.size / CHUNK;
    const density = level <= 8 ? 0.45 : level <= 16 ? 0.8 : 1;
    const idx: number[] = [];
    const cx0 = Math.max(0, Math.floor((x0 - 3) / CHUNK));
    const cx1 = Math.min(nc - 1, Math.floor((x0 + w + 3) / CHUNK));
    const cy0 = Math.max(0, Math.floor((y0 - 1) / CHUNK));
    const cy1 = Math.min(nc - 1, Math.floor((y0 + h + 4) / CHUNK));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        for (const i of this.buckets[cy * nc + cx]) {
          const p = this.props[i];
          if (p.rank > density) continue;
          const tall = p.w * TALL[p.kind];
          if (p.x + p.w / 2 + tall * 0.9 < x0 || p.x - p.w / 2 > x0 + w || p.y - tall > y0 + h || p.y + tall * 0.5 < y0) continue;
          idx.push(i);
        }
      }
    }
    if (!idx.length) return;
    idx.sort((a, b) => a - b);
    // Sombras en una capa aparte: donde se pisan dos no se oscurece el doble.
    const t = g.getTransform();
    const W = g.canvas.width;
    const H = g.canvas.height;
    if (!this.scratch || this.scratch.width !== W || this.scratch.height !== H) {
      this.scratch = document.createElement('canvas');
      this.scratch.width = W;
      this.scratch.height = H;
    }
    const sc = this.scratch;
    const sg = sc.getContext('2d')!;
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, W, H);
    sg.setTransform(t);
    sg.fillStyle = '#000';
    for (const i of idx) drawPropShadow(sg, this.props[i], this.atlas);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.3;
    g.drawImage(sc, 0, 0);
    g.restore();
    for (const i of idx) drawProp(g, this.props[i], this.atlas);
  }

  renderChunk(level: number, cx: number, cy: number, mode: MapMode): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = CHUNK * level;
    const g = c.getContext('2d')!;
    g.setTransform(level, 0, 0, level, -cx * CHUNK * level, -cy * CHUNK * level);
    this.paint(g, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, level, mode);
    return c;
  }

  renderOverview(mode: MapMode): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = this.size * 8;
    const g = c.getContext('2d')!;
    g.setTransform(8, 0, 0, 8, 0, 0);
    this.paint(g, 0, 0, this.size, this.size, 8, mode);
    return c;
  }
}

/** Desenfoque de caja 3×3 sobre una rejilla cuadrada. */
function blur(f: Float32Array, size: number): Float32Array {
  const out = new Float32Array(f.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
          s += f[yy * size + xx];
          n++;
        }
      }
      out[y * size + x] = s / n;
    }
  }
  return out;
}

