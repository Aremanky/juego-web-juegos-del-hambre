import { useEffect, useRef } from 'react';
import { T, TERRAIN, routePosition } from '@ceniza/engine';
import type { ActorView } from '@ceniza/shared';
import { gameNow, useMatch } from '../../stores/match';
import { portraitSrc } from '../../lib/media';

/**
 * Mapa básico de la arena en canvas 2D: terreno pintado una vez, personajes interpolados a 60 fps
 * desde sus rutas, arrastrar para mover la vista, rueda o botones para el zoom y un toque para ir.
 * El mapa ilustrado con PixiJS (relieve, ríos, rótulos, modo holograma) llega en la fase 7.
 */
const TILE = 8;

function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function paintTerrain(size: number, tiles: Uint8Array, seedNum: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size * TILE;
  const g = c.getContext('2d')!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = tiles[y * size + x];
      const r = hash(x, y, seedNum);
      g.fillStyle = shade(TERRAIN[t]?.color ?? '#555555', 0.94 + r * 0.12);
      g.fillRect(x * TILE, y * TILE, TILE, TILE);
      const cx = x * TILE + TILE / 2;
      const cy = y * TILE + TILE / 2;
      if (t === T.BOSQUE || t === T.DENSO) {
        g.fillStyle = t === T.DENSO ? 'rgba(10,22,10,0.55)' : 'rgba(16,30,14,0.4)';
        g.beginPath();
        g.arc(cx - 1 + r * 2, cy - 1, t === T.DENSO ? 3 : 2.4, 0, Math.PI * 2);
        g.fill();
      } else if (t === T.MONTANA || t === T.CUMBRE) {
        g.fillStyle = t === T.CUMBRE ? 'rgba(255,255,255,0.35)' : 'rgba(40,34,26,0.35)';
        g.beginPath();
        g.moveTo(cx, cy - 3);
        g.lineTo(cx + 3, cy + 2.5);
        g.lineTo(cx - 3, cy + 2.5);
        g.fill();
      } else if (t === T.AGUA && r > 0.7) {
        g.strokeStyle = 'rgba(160,200,205,0.18)';
        g.beginPath();
        g.moveTo(cx - 2.5, cy);
        g.lineTo(cx + 2.5, cy);
        g.stroke();
      }
    }
  }
  // Bordes entre biomas: una línea fina que dibuja la forma del terreno.
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = tiles[y * size + x];
      if (x + 1 < size && tiles[y * size + x + 1] !== t) g.fillRect((x + 1) * TILE - 0.5, y * TILE, 1, TILE);
      if (y + 1 < size && tiles[(y + 1) * size + x] !== t) g.fillRect(x * TILE, (y + 1) * TILE - 0.5, TILE, 1);
    }
  }
  return c;
}

function drawObelisk(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(2, 5, 9, 3, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d8c48a';
  g.strokeStyle = '#3a2f1c';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(0, -16);
  g.lineTo(2.6, -11);
  g.lineTo(3.6, 5);
  g.lineTo(-3.6, 5);
  g.lineTo(-2.6, -11);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#f26a2e';
  g.beginPath();
  g.arc(0, -18, 1.8, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export interface MapApi {
  zoom(f: number): void;
  centerOnMe(): void;
}

export function MapCanvas({ onCell, apiRef }: { onCell: (x: number, y: number) => void; apiRef?: React.MutableRefObject<MapApi | null> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useMatch((s) => s.size);
  const tiles = useMatch((s) => s.tiles);
  const seed = useMatch((s) => s.seed);
  const onCellRef = useRef(onCell);
  onCellRef.current = onCell;

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box || !tiles || !size) return;
    const g = el.getContext('2d')!;
    const terrain = paintTerrain(size, tiles, seed.length ? seed.charCodeAt(0) * 31 + seed.length : 7);
    const images = new Map<string, HTMLImageElement>();
    const view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, fitted: false };
    let raf = 0;

    const imageFor = (a: ActorView) => {
      const src = portraitSrc(a.portrait, a.color, 96);
      let img = images.get(src);
      if (!img) {
        img = new Image();
        img.decoding = 'async';
        img.src = src;
        images.set(src, img);
      }
      return img.complete && img.naturalWidth > 0 ? img : null;
    };

    const posOf = (a: ActorView, t: number) => (a.route ? routePosition(a.route, t) : { x: a.x, y: a.y });

    const centerOn = (cx: number, cy: number) => {
      view.ox = view.w / 2 - (cx + 0.5) * TILE * view.scale;
      view.oy = view.h / 2 - (cy + 0.5) * TILE * view.scale;
    };

    const myPos = () => {
      const st = useMatch.getState();
      const me = st.me ? st.actors[st.me] : null;
      return me && me.seen ? posOf(me, gameNow()) : st.center;
    };

    const clampScale = (s: number) => Math.max(Math.min(view.w, view.h) / (size * TILE) * 0.9, Math.min(6, s));

    const resize = () => {
      const r = box.getBoundingClientRect();
      view.dpr = Math.min(2, window.devicePixelRatio || 1);
      view.w = r.width;
      view.h = r.height;
      el.width = Math.round(r.width * view.dpr);
      el.height = Math.round(r.height * view.dpr);
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
      if (!view.fitted && r.width > 0) {
        view.scale = clampScale(Math.min(r.width, r.height) / (30 * TILE));
        const p = myPos();
        centerOn(p.x, p.y);
        view.fitted = true;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    const zoomAt = (f: number, sx: number, sy: number) => {
      const next = clampScale(view.scale * f);
      const k = next / view.scale;
      view.ox = sx - (sx - view.ox) * k;
      view.oy = sy - (sy - view.oy) * k;
      view.scale = next;
    };
    if (apiRef) {
      apiRef.current = {
        zoom: (f) => zoomAt(f, view.w / 2, view.h / 2),
        centerOnMe: () => {
          const p = myPos();
          centerOn(p.x, p.y);
        },
      };
    }

    // Arrastre para mover la vista; un toque sin arrastre es una orden de ir.
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
        moved += 10;
        return;
      }
      view.ox += p.x - prev.x;
      view.oy += p.y - prev.y;
      moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
    };
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (!p || moved > 6 || pointers.size > 0) return;
      const x = Math.floor((p.x - view.ox) / (TILE * view.scale));
      const y = Math.floor((p.y - view.oy) / (TILE * view.scale));
      if (x >= 0 && y >= 0 && x < size && y < size) onCellRef.current(x, y);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = { x: e.offsetX, y: e.offsetY };
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const st = useMatch.getState();
      const now = gameNow();
      const s = view.scale * TILE;
      g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      g.fillStyle = '#0d1112';
      g.fillRect(0, 0, view.w, view.h);
      g.imageSmoothingEnabled = view.scale < 1;
      g.drawImage(terrain, view.ox, view.oy, size * s, size * s);
      drawObelisk(g, view.ox + (st.center.x + 0.5) * s, view.oy + (st.center.y + 0.5) * s, Math.max(0.6, Math.min(2.2, view.scale)));

      const me = st.me ? st.actors[st.me] : null;
      // Ruta propia: línea discontinua hasta el destino.
      if (me?.route && me.alive) {
        const r = me.route;
        const p0 = posOf(me, now);
        g.strokeStyle = 'rgba(239,231,218,0.75)';
        g.lineWidth = 2;
        g.setLineDash([5, 5]);
        g.beginPath();
        g.moveTo(view.ox + (p0.x + 0.5) * s, view.oy + (p0.y + 0.5) * s);
        for (let i = 1; i < r.times.length; i++) if (r.times[i] > now) g.lineTo(view.ox + (r.cells[i * 2] + 0.5) * s, view.oy + (r.cells[i * 2 + 1] + 0.5) * s);
        g.stroke();
        g.setLineDash([]);
        const ex = view.ox + (r.cells[r.cells.length - 2] + 0.5) * s;
        const ey = view.oy + (r.cells[r.cells.length - 1] + 0.5) * s;
        g.strokeStyle = '#efe7da';
        g.beginPath();
        g.moveTo(ex - 5, ey - 5);
        g.lineTo(ex + 5, ey + 5);
        g.moveTo(ex + 5, ey - 5);
        g.lineTo(ex - 5, ey + 5);
        g.stroke();
      }

      const radius = Math.max(9, Math.min(22, s * 0.95));
      const list = st.order.map((id) => st.actors[id]).filter((a): a is ActorView => !!a && a.seen);
      // Primero los caídos (debajo), después los vivos y el propio encima de todo.
      list.sort((a, b) => Number(a.alive) - Number(b.alive) || Number(a.id === st.me) - Number(b.id === st.me));
      for (const a of list) {
        const p = posOf(a, now);
        const x = view.ox + (p.x + 0.5) * s;
        const y = view.oy + (p.y + 0.5) * s;
        if (x < -40 || y < -40 || x > view.w + 40 || y > view.h + 40) continue;
        if (!a.alive) {
          g.strokeStyle = 'rgba(179,170,156,0.55)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x - 5, y - 5);
          g.lineTo(x + 5, y + 5);
          g.moveTo(x + 5, y - 5);
          g.lineTo(x - 5, y + 5);
          g.stroke();
          continue;
        }
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.beginPath();
        g.ellipse(x + 1.5, y + radius * 0.85, radius * 0.8, radius * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        const img = imageFor(a);
        g.save();
        g.beginPath();
        g.arc(x, y, radius, 0, Math.PI * 2);
        g.clip();
        if (img) g.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
        else {
          g.fillStyle = a.color;
          g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        g.restore();
        g.lineWidth = 2.5;
        g.strokeStyle = a.color;
        if (!a.connected) g.setLineDash([3, 3]);
        g.beginPath();
        g.arc(x, y, radius, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        if (a.id === st.me) {
          g.lineWidth = 1.5;
          g.strokeStyle = '#efe7da';
          g.beginPath();
          g.arc(x, y, radius + 3.5, 0, Math.PI * 2);
          g.stroke();
        }
        if (a.id === st.me || radius >= 15) {
          g.font = '600 11px "Archivo Variable", Archivo, sans-serif';
          const w = g.measureText(a.name).width + 8;
          g.fillStyle = 'rgba(10,12,13,0.78)';
          g.fillRect(x - w / 2, y + radius + 4, w, 15);
          g.fillStyle = a.id === st.me ? '#ff9152' : '#efe7da';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(a.name, x, y + radius + 11.5);
        }
      }

      // Niebla de guerra: lo que queda fuera de tu radio de visión se oscurece.
      if (st.visibility === 'niebla' && me?.alive && me.vision && st.phase === 'en_curso') {
        const p = posOf(me, now);
        const x = view.ox + (p.x + 0.5) * s;
        const y = view.oy + (p.y + 0.5) * s;
        const rr = me.vision * s;
        const grad = g.createRadialGradient(x, y, rr * 0.85, x, y, rr * 1.05);
        grad.addColorStop(0, 'rgba(8,10,11,0)');
        grad.addColorStop(1, 'rgba(8,10,11,0.62)');
        g.fillStyle = grad;
        g.fillRect(0, 0, view.w, view.h);
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      if (apiRef) apiRef.current = null;
    };
  }, [tiles, size, seed, apiRef]);

  return (
    <div ref={wrap} className="map-wrap">
      <canvas ref={canvas} className="map-canvas" aria-label="Mapa de la arena. Toca una casilla para ir allí." role="img" />
    </div>
  );
}
