import { useEffect, useRef } from 'react';
import { T, routePosition } from '@ceniza/engine';
import { appearanceOf, dayPhase, type ActorView, type Appearance, type PoiDTO } from '@ceniza/shared';
import { gameNow, presentationProgress, useMatch } from '../../stores/match';
import { TILE, paintTerrain } from './terrainArt';
import { drawFigure, type Facing } from './figure';

/**
 * Mapa de la arena en canvas 2D: terreno ilustrado horneado una vez (o en modo holograma), personajes
 * animados interpolados a 60 fps desde sus rutas, puntos de interés con nombre al descubrirlos, ciclo de
 * día y noche, niebla de guerra, arrastrar para mover la vista, rueda o pellizco para el zoom y un toque
 * para ir. En el mapa nunca va la foto: va el personaje (GDD §5.9).
 */
const SECTOR_LETTERS = 'ABCDEFGHIJKL';

function poiIcon(g: CanvasRenderingContext2D, kind: PoiDTO['kind'], x: number, y: number, s: number, holo: boolean) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineWidth = 1.2;
  g.strokeStyle = holo ? '#5fe3d0' : '#1d1810';
  g.fillStyle = holo ? 'rgba(95,227,208,0.25)' : '#e8dcc0';
  g.beginPath();
  if (kind === 'ruinas') {
    g.rect(-4, -5, 2.4, 8);
    g.rect(1.6, -2, 2.4, 5);
    g.rect(-5, 3, 10, 2);
  } else if (kind === 'poblado') {
    g.moveTo(-5, 4);
    g.lineTo(-5, -1);
    g.lineTo(0, -5);
    g.lineTo(5, -1);
    g.lineTo(5, 4);
    g.closePath();
  } else if (kind === 'cueva') {
    g.moveTo(-6, 4);
    g.quadraticCurveTo(0, -9, 6, 4);
    g.closePath();
  } else if (kind === 'manantial') {
    g.moveTo(0, -5);
    g.quadraticCurveTo(5, 1, 0, 4.5);
    g.quadraticCurveTo(-5, 1, 0, -5);
  }
  g.fill();
  g.stroke();
  g.restore();
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
  /** Cambia entre el mapa ilustrado y el holograma; devuelve el modo nuevo. */
  toggleMode(): 'carta' | 'holograma';
}

export function MapCanvas({ onCell, apiRef }: { onCell: (x: number, y: number) => void; apiRef?: React.MutableRefObject<MapApi | null> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useMatch((s) => s.size);
  const tiles = useMatch((s) => s.tiles);
  const heights = useMatch((s) => s.heights);
  const seed = useMatch((s) => s.seed);
  const onCellRef = useRef(onCell);
  onCellRef.current = onCell;

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box || !tiles || !heights || !size) return;
    const g = el.getContext('2d')!;
    const seedNum = seed.length ? seed.charCodeAt(0) * 31 + seed.length : 7;
    const carta = paintTerrain(size, tiles, heights, seedNum, 'carta');
    let holo: HTMLCanvasElement | null = null;
    let mode: 'carta' | 'holograma' = 'carta';
    const view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, fitted: false };
    let raf = 0;
    const looks = new Map<string, Appearance>();
    const facings = new Map<string, Facing>();
    const lookOf = (a: ActorView) => {
      let l = looks.get(a.id);
      if (!l) looks.set(a.id, (l = appearanceOf(a)));
      return l;
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
    // Sobrevuelo de la presentación (GDD §2): vista general, una vuelta en espiral sobre la arena y
    // descenso hasta tu sitio en el anillo. Se corta en cuanto tocas el mapa; sin animación si el
    // sistema pide menos movimiento.
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cinematic = true;
    let flying = false;
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
    const startAngle = ((seed.length ? seed.charCodeAt(seed.length - 1) : 3) % 8) * (Math.PI / 4);
    const playScale = () => clampScale(Math.min(view.w, view.h) / (30 * TILE));
    const overviewScale = () => clampScale(0);
    const fly = (u: number) => {
      const c = useMatch.getState().center;
      const R = size * 0.26;
      const over = overviewScale();
      const mid = Math.max(over, Math.min(playScale(), over * 2.4));
      const orbit = (k: number) => {
        const ang = startAngle + ease(k) * Math.PI * 1.5;
        const r = R * Math.min(1, k * 3);
        return { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r };
      };
      let p: { x: number; y: number };
      if (reduced || u < 0.12) {
        p = c;
        view.scale = over;
      } else if (u < 0.78) {
        const k = (u - 0.12) / 0.66;
        p = orbit(k);
        view.scale = over + (mid - over) * ease(Math.min(1, k * 2.5));
      } else {
        const k = ease((u - 0.78) / 0.22);
        const a = orbit(1);
        const b = myPos();
        p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
        view.scale = mid + (playScale() - mid) * k;
      }
      centerOn(p.x, p.y);
    };
    const takeControl = () => {
      cinematic = false;
      flying = false;
    };

    if (apiRef) {
      apiRef.current = {
        zoom: (f) => {
          takeControl();
          zoomAt(f, view.w / 2, view.h / 2);
        },
        centerOnMe: () => {
          takeControl();
          const p = myPos();
          centerOn(p.x, p.y);
        },
        toggleMode: () => {
          mode = mode === 'carta' ? 'holograma' : 'carta';
          if (mode === 'holograma' && !holo) holo = paintTerrain(size, tiles, heights, seedNum, 'holograma');
          return mode;
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
      takeControl();
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
      takeControl();
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
      if (st.phase === 'presentacion' && cinematic) {
        flying = true;
        fly(presentationProgress());
      } else if (flying) {
        // Al acabar la presentación, la cámara queda en tu sitio con el zoom de juego.
        flying = false;
        cinematic = false;
        view.scale = playScale();
        const p = myPos();
        centerOn(p.x, p.y);
      }
      const s = view.scale * TILE;
      g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      g.fillStyle = '#0d1112';
      g.fillRect(0, 0, view.w, view.h);
      g.imageSmoothingEnabled = view.scale < 1;
      const isHolo = mode === 'holograma' && !!holo;
      g.drawImage(isHolo ? holo! : carta, view.ox, view.oy, size * s, size * s);
      if (isHolo) {
        // Retícula de sectores de la Ciudadela: A–L por columnas y 1–12 por filas.
        const step = (size / 12) * s;
        g.strokeStyle = 'rgba(95,227,208,0.16)';
        g.lineWidth = 1;
        g.beginPath();
        for (let k = 0; k <= 12; k++) {
          g.moveTo(view.ox + k * step, view.oy);
          g.lineTo(view.ox + k * step, view.oy + size * s);
          g.moveTo(view.ox, view.oy + k * step);
          g.lineTo(view.ox + size * s, view.oy + k * step);
        }
        g.stroke();
        g.fillStyle = 'rgba(95,227,208,0.6)';
        g.font = '600 10px "Archivo Variable", Archivo, sans-serif';
        g.textAlign = 'left';
        g.textBaseline = 'top';
        for (let k = 0; k < 12; k++) {
          g.fillText(SECTOR_LETTERS[k], view.ox + k * step + 4, Math.max(48, view.oy + 4)); // bajo los rótulos de arriba
          g.fillText(String(k + 1), Math.max(4, view.ox + 4), view.oy + k * step + 4);
        }
      }
      drawObelisk(g, view.ox + (st.center.x + 0.5) * s, view.oy + (st.center.y + 0.5) * s, Math.max(0.6, Math.min(2.2, view.scale)));

      const me = st.me ? st.actors[st.me] : null;
      // Puntos de interés que ya conoces (el Obelisco siempre).
      const known = (p: PoiDTO) => p.kind === 'obelisco' || st.phase === 'terminada' || (!!me?.explored && (me.explored & (1 << p.id)) !== 0);
      const iconScale = Math.max(0.8, Math.min(1.8, view.scale * 0.55));
      for (const p of st.pois) if (p.kind !== 'obelisco' && known(p)) poiIcon(g, p.kind, view.ox + (p.x + 0.5) * s, view.oy + (p.y + 0.5) * s, iconScale, isHolo);
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

      const fig = Math.max(26, Math.min(64, s * 1.7));
      const list = st.order.map((id) => st.actors[id]).filter((a): a is ActorView => !!a && a.seen);
      // Primero los caídos (debajo); después, de arriba abajo, para que los de delante tapen a los de detrás.
      list.sort((a, b) => Number(a.alive) - Number(b.alive) || posOf(a, now).y - posOf(b, now).y);
      const plates: { a: ActorView; x: number; y: number }[] = [];
      for (const a of list) {
        const p = posOf(a, now);
        const x = view.ox + (p.x + 0.5) * s;
        const y = view.oy + (p.y + 0.75) * s;
        if (x < -60 || y < -80 || x > view.w + 60 || y > view.h + 60) continue;
        // Hacia dónde mira y cómo se mueve, a partir de su ruta.
        let moving = false;
        let running = false;
        if (a.alive && a.route) {
          const ahead = routePosition(a.route, now + 120);
          const dx = ahead.x - p.x;
          const dy = ahead.y - p.y;
          if (Math.abs(dx) + Math.abs(dy) > 0.01) {
            moving = true;
            facings.set(a.id, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N');
            running = Math.hypot(dx, dy) / 0.12 > 1.9;
          }
        }
        const cx = Math.min(size - 1, Math.max(0, Math.round(p.x)));
        const cy = Math.min(size - 1, Math.max(0, Math.round(p.y)));
        const tile = tiles[cy * size + cx];
        const swimming = a.alive && (tile === T.AGUA || tile === T.RIO);
        const crouched = a.alive && !moving && tile === T.DENSO;
        // Anillo del color del jugador a los pies (punteado si va con piloto automático).
        g.lineWidth = a.id === st.me ? 2.2 : 1.6;
        g.strokeStyle = a.id === st.me ? '#e6c97e' : a.color;
        if (!a.connected) g.setLineDash([3, 3]);
        g.beginPath();
        g.ellipse(x, y, fig * 0.24, fig * 0.09, 0, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        if (swimming) {
          g.strokeStyle = 'rgba(200,230,232,0.55)';
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(x, y - fig * 0.12, fig * 0.2 + Math.sin(now * 0.006) * 1.5, fig * 0.06, 0, 0, Math.PI * 2);
          g.stroke();
        } else if (a.alive) {
          g.fillStyle = 'rgba(0,0,0,0.32)';
          g.beginPath();
          g.ellipse(x + 1.5, y, fig * 0.2, fig * 0.07, 0, 0, Math.PI * 2);
          g.fill();
        }
        drawFigure(g, lookOf(a), x, swimming ? y + fig * 0.22 : y, fig, {
          facing: facings.get(a.id) ?? 'S',
          t: now + (a.id.charCodeAt(0) % 7) * 137,
          moving,
          running,
          swimming,
          crouched,
          dead: !a.alive,
          celebrating: st.phase === 'terminada' && st.winnerId === a.id,
        });
        if (a.id === st.me || fig >= 40) plates.push({ a, x, y });
      }

      // Noche: la arena se oscurece al anochecer y aclara al amanecer.
      if (st.day && st.phase === 'en_curso') {
        const dark = dayPhase(now, st.day).darkness;
        if (dark > 0) {
          g.fillStyle = `rgba(6,10,28,${(0.5 * dark).toFixed(3)})`;
          g.fillRect(0, 0, view.w, view.h);
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

      // Rótulos por encima de la noche y la niebla, para que siempre se lean.
      g.font = '600 11px "Archivo Variable", Archivo, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const p of st.pois) {
        if (!known(p) || (p.kind === 'obelisco' && view.scale < 1.2)) continue;
        const x = view.ox + (p.x + 0.5) * s;
        const y = view.oy + (p.y + 0.5) * s + iconScale * 9 + 8;
        if (x < -100 || y < -20 || x > view.w + 100 || y > view.h + 20) continue;
        const w = g.measureText(p.name).width + 10;
        g.fillStyle = isHolo ? 'rgba(4,16,15,0.82)' : 'rgba(24,20,14,0.78)';
        g.fillRect(x - w / 2, y - 8, w, 16);
        g.fillStyle = isHolo ? '#5fe3d0' : '#e6c97e';
        g.fillText(p.name, x, y);
      }
      for (const { a, x, y } of plates) {
        const w = g.measureText(a.name).width + 8;
        g.fillStyle = 'rgba(10,12,13,0.78)';
        g.fillRect(x - w / 2, y + 5, w, 15);
        g.fillStyle = a.id === st.me ? '#ff9152' : a.alive ? '#efe7da' : '#8f877b';
        g.fillText(a.name, x, y + 12.5);
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
  }, [tiles, heights, size, seed, apiRef]);

  return (
    <div ref={wrap} className="map-wrap">
      <canvas ref={canvas} className="map-canvas" aria-label="Mapa de la arena. Toca una casilla para ir allí." role="img" />
    </div>
  );
}
