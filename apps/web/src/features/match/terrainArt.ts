import { T, TERRAIN } from '@ceniza/engine';

/**
 * Mapa ilustrado de la arena (GDD §1 y §7), horneado una vez en un canvas: relieve sombreado con luz del
 * noroeste a partir de las alturas, curvas de nivel, árboles, rocas y cumbres dibujados, ríos y caminos
 * continuos, pantanos, ruinas y poblados. El modo holograma es otra pasada con la paleta turquesa de la
 * Ciudadela: solo curvas, agua, ríos y caminos.
 */
export const TILE = 8;

export function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex: string, k: number): string {
  const [r, g, b] = rgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

const BANK = '#55603a';
const CONTOUR_STEP = 18;

type Mode = 'carta' | 'holograma';

export function paintTerrain(size: number, tiles: Uint8Array, heights: Uint8Array, seedNum: number, mode: Mode = 'carta'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size * TILE;
  const g = c.getContext('2d')!;
  const at = (x: number, y: number) => tiles[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
  const hAt = (x: number, y: number) => heights[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
  const wet = (t: number) => t === T.AGUA || t === T.RIO;
  const holo = mode === 'holograma';

  g.fillStyle = holo ? '#06100f' : '#2a2a20';
  g.fillRect(0, 0, c.width, c.height);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = at(x, y);
      const px = x * TILE;
      const py = y * TILE;
      const r = hash(x, y, seedNum);
      if (holo) {
        if (t === T.AGUA) {
          g.fillStyle = 'rgba(95,227,208,0.10)';
          g.fillRect(px, py, TILE, TILE);
        }
        continue;
      }
      // Relieve: pendiente hacia la luz del noroeste.
      const slope = (hAt(x - 1, y) - hAt(x + 1, y) + hAt(x, y - 1) - hAt(x, y + 1)) * 0.5;
      const light = t === T.AGUA ? 1 - (110 - Math.min(110, hAt(x, y))) / 260 : Math.max(0.72, Math.min(1.3, 1 + slope * 0.016));
      const base = t === T.RIO ? BANK : (TERRAIN[t]?.color ?? '#555555');
      g.fillStyle = shade(base, light * (0.95 + r * 0.1));
      g.fillRect(px, py, TILE, TILE);
      const cx = px + TILE / 2;
      const cy = py + TILE / 2;
      if (t === T.BOSQUE || t === T.DENSO) {
        const n = t === T.DENSO ? 3 : 1 + Math.round(r);
        for (let k = 0; k < n; k++) {
          const ox = (hash(x, y, seedNum + k + 1) - 0.5) * 5;
          const oy = (hash(y, x, seedNum + k + 7) - 0.5) * 5;
          g.fillStyle = 'rgba(8,18,8,0.45)';
          g.beginPath();
          g.arc(cx + ox + 0.8, cy + oy + 0.9, t === T.DENSO ? 2.6 : 2.3, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = shade(t === T.DENSO ? '#2c4a26' : '#3f6234', 0.95 + r * 0.15);
          g.beginPath();
          g.arc(cx + ox, cy + oy, t === T.DENSO ? 2.4 : 2.1, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(190,220,150,0.18)';
          g.beginPath();
          g.arc(cx + ox - 0.7, cy + oy - 0.8, 0.9, 0, Math.PI * 2);
          g.fill();
        }
      } else if (t === T.MONTANA || t === T.CUMBRE) {
        const s = t === T.CUMBRE ? 3.4 : 3;
        g.fillStyle = t === T.CUMBRE ? '#f2eee4' : 'rgba(150,140,122,0.95)';
        g.beginPath();
        g.moveTo(cx, cy - s);
        g.lineTo(cx - s, cy + s * 0.8);
        g.lineTo(cx, cy + s * 0.8);
        g.fill();
        g.fillStyle = t === T.CUMBRE ? '#b9b3a6' : 'rgba(70,62,50,0.9)';
        g.beginPath();
        g.moveTo(cx, cy - s);
        g.lineTo(cx + s, cy + s * 0.8);
        g.lineTo(cx, cy + s * 0.8);
        g.fill();
      } else if (t === T.ROCA && r > 0.45) {
        g.fillStyle = 'rgba(58,52,44,0.6)';
        g.fillRect(cx - 2 + r * 2, cy - 1, 2.4, 1.8);
        g.fillStyle = 'rgba(200,190,170,0.35)';
        g.fillRect(cx - 2 + r * 2, cy - 1.4, 2.4, 0.6);
      } else if (t === T.PANTANO) {
        g.fillStyle = 'rgba(30,50,48,0.55)';
        g.beginPath();
        g.ellipse(cx + (r - 0.5) * 3, cy + 1, 2.4, 1.1, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(150,170,110,0.55)';
        g.lineWidth = 0.7;
        g.beginPath();
        for (let k = -1; k <= 1; k++) {
          g.moveTo(cx + k * 1.8, cy);
          g.lineTo(cx + k * 1.8 + 0.4, cy - 2.6);
        }
        g.stroke();
      } else if (t === T.ORILLA && r > 0.6) {
        g.fillStyle = 'rgba(230,214,170,0.25)';
        g.fillRect(cx + (r - 0.5) * 4, cy, 1, 1);
      } else if (t === T.AGUA && r > 0.78) {
        g.strokeStyle = 'rgba(170,210,215,0.2)';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(cx - 2.5, cy);
        g.quadraticCurveTo(cx, cy - 1.2, cx + 2.5, cy);
        g.stroke();
      } else if (t === T.RUINAS) {
        g.fillStyle = 'rgba(40,36,30,0.55)';
        g.fillRect(px + 1, py + 1, TILE - 2, 1.4);
        g.fillRect(px + 1, py + 1, 1.4, TILE - 3 - r * 2);
        g.fillStyle = 'rgba(210,200,180,0.5)';
        g.fillRect(px + TILE - 3, py + 3, 1.6, 1.6);
      } else if (t === T.POBLADO) {
        g.fillStyle = 'rgba(30,20,12,0.4)';
        g.fillRect(px + 2.2, py + 3.4, 4.6, 3.6);
        g.fillStyle = '#a8865a';
        g.fillRect(px + 1.6, py + 3, 4.6, 3.6);
        g.fillStyle = '#7a3a26';
        g.beginPath();
        g.moveTo(px + 1, py + 3.2);
        g.lineTo(px + 3.9, py + 0.8);
        g.lineTo(px + 6.8, py + 3.2);
        g.fill();
      }
    }
  }

  // Curvas de nivel: donde la altura cruza un escalón entre dos casillas vecinas.
  g.fillStyle = holo ? 'rgba(95,227,208,0.42)' : 'rgba(28,22,16,0.2)';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (wet(at(x, y))) continue;
      const band = Math.floor(hAt(x, y) / CONTOUR_STEP);
      if (x + 1 < size && !wet(at(x + 1, y)) && Math.floor(hAt(x + 1, y) / CONTOUR_STEP) !== band) g.fillRect((x + 1) * TILE - 0.5, y * TILE, 1, TILE);
      if (y + 1 < size && !wet(at(x, y + 1)) && Math.floor(hAt(x, y + 1) / CONTOUR_STEP) !== band) g.fillRect(x * TILE, (y + 1) * TILE - 0.5, TILE, 1);
    }
  }

  // Ríos y caminos como trazos continuos de centro a centro.
  const link = (match: (t: number) => boolean, width: number, color: string, also: (t: number) => boolean = match) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!match(at(x, y))) continue;
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        g.moveTo(cx, cy);
        g.lineTo(cx + 0.01, cy);
        for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || !also(at(nx, ny))) continue;
          // Las diagonales solo si no hay ya un paso recto que las cubra.
          if (dx && dy && (match(at(x + dx, y)) || match(at(x, y + dy)))) continue;
          g.moveTo(cx, cy);
          g.lineTo(nx * TILE + TILE / 2, ny * TILE + TILE / 2);
        }
      }
    }
    g.stroke();
  };
  const isRoad = (t: number) => t === T.CAMINO;
  const roadEnds = (t: number) => t === T.CAMINO || t === T.PLAZA || t === T.RUINAS || t === T.POBLADO;
  if (holo) {
    link((t) => t === T.RIO, 2.2, 'rgba(95,227,208,0.75)', wet);
    link(isRoad, 1.2, 'rgba(95,227,208,0.5)', roadEnds);
  } else {
    link((t) => t === T.RIO, 5, '#2b4d57', wet);
    link((t) => t === T.RIO, 2.4, '#4f8790', wet);
    link(isRoad, 3.4, 'rgba(70,56,36,0.55)', roadEnds);
    link(isRoad, 2.2, '#b9a170', roadEnds);
  }
  return c;
}
