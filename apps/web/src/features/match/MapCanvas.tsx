import { useEffect, useRef } from 'react';
import { T, routePosition, type GameMap } from '@ceniza/engine';
import { appearanceOf, dayPhase, type ActorView, type Appearance, type PoiDTO } from '@ceniza/shared';
import { gameNow, presentationProgress, useMatch } from '../../stores/match';
import { FogLayer } from './art/fog';
import { drawObelisk, drawObeliskGlow } from './art/obelisk';
import { drawLastSeen, drawPreviewLabel, drawRoutePreview } from './art/overlays';
import { BUBBLE_MS, SpeechLayer, type SpeechItem } from './art/speech';
import { TILE, TerrainArt, type MapMode } from './art/terrain';
import { TerrainView, loadAtlas } from './art/view';
import { snapScale } from './camera';
import { facingOf } from './facing';
import type { Facing, Pose } from './figure';
import { pickActor, type HitBox } from './pick';
import { formatEta, previewFor, tapPreview, type Preview, type TapState } from './plan';
import { Resolution } from './resolution';
import { FigureSprites } from './sprites';

/**
 * Mapa de la arena en canvas 2D: terreno pintado por bloques a la resolución del zoom (o en modo holograma), personajes
 * animados interpolados a 60 fps desde sus rutas, puntos de interés con nombre al descubrirlos, ciclo de
 * día y noche, niebla de guerra, arrastrar para mover la vista y rueda o pellizco para el zoom. Moverse
 * (GDD §7.5): con ratón, al pasar por una casilla se ven la ruta y el tiempo, y un clic va; con el dedo, el
 * primer toque los enseña y el segundo (o el botón «Ir» de la página) va. Tocar a un personaje o la marca
 * donde lo viste por última vez abre su tarjeta. En el mapa nunca va la foto: va el personaje (GDD §5.9).
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


export interface MapApi {
  zoom(f: number): void;
  centerOnMe(): void;
  /** Cambia entre el mapa ilustrado y el holograma; devuelve el modo nuevo. */
  toggleMode(): 'carta' | 'holograma';
  /** Quita la vista previa táctil (al pulsar «Ir» o cerrarla). */
  clearPreview(): void;
  /** Dónde está ahora en pantalla (px del mapa) un personaje o su marca, si se ve. */
  anchorOf(id: string): { x: number; y: number } | null;
}

export function MapCanvas({
  onCell,
  onActor,
  onPreview,
  modal = false,
  apiRef,
}: {
  /** Ir a una casilla. */
  onCell: (x: number, y: number) => void;
  /** Tocar a un personaje o su marca abre su tarjeta; `null` la cierra. */
  onActor?: (id: string | null) => void;
  /** Vista previa táctil, la del botón «Ir» (`null` cuando no hay). */
  onPreview?: (p: Preview | null) => void;
  /** Hay una tarjeta abierta: el siguiente toque fuera de un personaje solo la cierra. */
  modal?: boolean;
  apiRef?: React.MutableRefObject<MapApi | null>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const onActorRef = useRef(onActor);
  onActorRef.current = onActor;
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const modalRef = useRef(modal);
  modalRef.current = modal;
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
    const init = useMatch.getState();
    const art = new TerrainArt({ seed, size, tiles, heights, pois: init.pois, center: init.center, rivers: init.rivers, roads: init.roads });
    const terrain = new TerrainView(art);
    let alive = true;
    void loadAtlas().then((atlas) => {
      if (!alive || !atlas) return;
      art.atlas = atlas;
      terrain.invalidate();
    });
    let mode: MapMode = 'carta';
    const view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, fitted: false };
    const speech = new SpeechLayer();
    const fog = new FogLayer();
    const sprites = new FigureSprites();
    const res = new Resolution(window.devicePixelRatio || 1);
    let zoomedAt = 0;
    let raf = 0;
    const looks = new Map<string, Appearance>();
    const facings = new Map<string, Facing>();
    const lookOf = (a: ActorView) => {
      let l = looks.get(a.id);
      if (!l) looks.set(a.id, (l = appearanceOf(a)));
      return l;
    };

    const posOf = (a: ActorView, t: number) => (a.route ? routePosition(a.route, t) : { x: a.x, y: a.y });
    // Para prever rutas con la misma cuenta que el servidor; solo hace falta el terreno.
    const grid: GameMap = { size, tiles, heights, center: init.center, pois: [], rivers: [], roads: [] };
    /** Cajas de toque del último fotograma (personajes y marcas), en orden de dibujo. */
    let hits: HitBox[] = [];
    /** Casilla bajo el ratón y vista previa táctil; `preview` es la que se dibuja. */
    let hover: { x: number; y: number } | null = null;
    let tap: TapState = null;
    let preview: Preview | null = null;
    let previewKey = '';
    let previewAt = 0;
    let sentKey = '';
    let cursor = '';

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
    /** La escala más cercana con un número entero de píxeles reales por casilla (dentro de los límites). */
    const snap = (s: number) => snapScale(s, view.dpr, clampScale(0), clampScale(Infinity));

    const resize = () => {
      const r = box.getBoundingClientRect();
      view.dpr = Math.min(res.dpr, window.devicePixelRatio || 1);
      view.w = r.width;
      view.h = r.height;
      el.width = Math.round(r.width * view.dpr);
      el.height = Math.round(r.height * view.dpr);
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
      if (!view.fitted && r.width > 0) {
        view.scale = snap(clampScale(Math.min(r.width, r.height) / (30 * TILE)));
        const p = myPos();
        centerOn(p.x, p.y);
        view.fitted = true;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    resize();

    const zoomAt = (f: number, sx: number, sy: number) => {
      zoomedAt = performance.now();
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
    const playScale = () => snap(clampScale(Math.min(view.w, view.h) / (30 * TILE)));
    // En reposo, el zoom queda en un número entero de píxeles reales por casilla (alrededor del centro de la
    // vista): así el terreno se copia sin escalar, que sin GPU era lo que más costaba de cada fotograma.
    const settle = () => {
      const next = snap(view.scale);
      if (next === view.scale) return;
      const k = next / view.scale;
      view.ox = view.w / 2 - (view.w / 2 - view.ox) * k;
      view.oy = view.h / 2 - (view.h / 2 - view.oy) * k;
      view.scale = next;
    };
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
          return mode;
        },
        clearPreview: () => {
          tap = null;
        },
        anchorOf: (id) => {
          const b = hits.find((h) => h.id === id);
          return b ? { x: b.x, y: b.top } : null;
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
    const cellAt = (px: number, py: number) => {
      const x = Math.floor((px - view.ox) / (TILE * view.scale));
      const y = Math.floor((py - view.oy) / (TILE * view.scale));
      return x >= 0 && y >= 0 && x < size && y < size ? { x, y } : null;
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        // Ratón sin pulsar: vista previa de la casilla y mano sobre los personajes y sus marcas.
        if (e.pointerType === 'mouse') {
          const p = local(e);
          hover = cellAt(p.x, p.y);
          const want = pickActor(hits, p.x, p.y, 4) ? 'pointer' : '';
          if (want !== cursor) el.style.cursor = cursor = want;
        }
        return;
      }
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
      // Arrastrar o pellizcar no es un toque.
      if (!p || moved > 6 || pointers.size > 0) return;
      const mouse = e.pointerType === 'mouse';
      const who = pickActor(hits, p.x, p.y, mouse ? 4 : 12);
      if (who) {
        tap = null;
        onActorRef.current?.(who);
        return;
      }
      // Con una tarjeta abierta, tocar fuera solo la cierra.
      if (modalRef.current) {
        onActorRef.current?.(null);
        return;
      }
      const c = cellAt(p.x, p.y);
      if (!c) return;
      if (mouse) {
        onCellRef.current(c.x, c.y);
        return;
      }
      const r = tapPreview(tap, { type: 'tap', cell: c, at: Date.now() });
      tap = r.state;
      if (r.go) onCellRef.current(r.go.x, r.go.y);
    };
    const cancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') hover = null;
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
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, { passive: false });

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const st = useMatch.getState();
      const now = gameNow();
      const realNow = Date.now();
      const frameHits: HitBox[] = [];
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
      // Si los fotogramas van lentos de forma sostenida, menos densidad (fuera del sobrevuelo, que carga bloques).
      const tick = performance.now();
      if (!flying && res.frame(tick)) resize();
      const steady = !flying && tick - zoomedAt > 250;
      if (steady) settle();
      const s = view.scale * TILE;
      g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      g.fillStyle = '#0d1112';
      g.fillRect(0, 0, view.w, view.h);
      const isHolo = mode === 'holograma';
      terrain.draw(g, view, mode, { budgetMs: flying ? 4 : 8 });
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
      const obX = view.ox + (st.center.x + 0.5) * s;
      const obY = view.oy + (st.center.y + 0.5) * s;
      let obeliskDone = false;
      const obelisk = () => {
        if (obeliskDone) return;
        obeliskDone = true;
        drawObelisk(g, obX, obY, s, art.atlas, mode === 'holograma');
      };

      const me = st.me ? st.actors[st.me] : null;
      // Vista previa de la orden de ir: la casilla del primer toque o la que está bajo el ratón. Se recalcula
      // al cambiar de casilla o de ruta propia, y cada cuarto de segundo para que el tiempo siga al día.
      if (tap) tap = tapPreview(tap, { type: 'tick', at: realNow }).state;
      const canAct = !!me?.alive && st.phase === 'en_curso' && !st.paused;
      const target = canAct ? (tap?.cell ?? hover) : null;
      if (target && me) {
        const r = me.route;
        const key = `${target.x},${target.y}|${me.x},${me.y}|${r ? `${r.times[0]}:${r.times.length}:${r.times[r.times.length - 1]}` : '-'}`;
        if (key !== previewKey || Math.abs(now - previewAt) > 250) {
          preview = previewFor(grid, me, target, now);
          previewKey = key;
          previewAt = now;
        }
      } else {
        preview = null;
        previewKey = '';
      }
      // La página solo necesita la vista previa táctil (para su botón «Ir»); se le avisa cuando cambia lo que enseña.
      const shown = tap && preview ? preview : null;
      const shownKey = shown ? `${shown.x},${shown.y}|${shown.error ?? formatEta(shown.eta!)}` : '';
      if (shownKey !== sentKey) {
        sentKey = shownKey;
        onPreviewRef.current?.(shown);
      }
      // Puntos de interés que ya conoces (el Obelisco siempre).
      const known = (p: PoiDTO) => p.kind === 'obelisco' || st.phase === 'terminada' || (!!me?.explored && (me.explored & (1 << p.id)) !== 0);
      const iconScale = Math.max(0.8, Math.min(1.8, view.scale * 0.55));
      // En el holograma, iconos; en la carta ya se ven las casas, ruinas y cuevas dibujadas.
      if (isHolo) for (const p of st.pois) if (p.kind !== 'obelisco' && known(p)) poiIcon(g, p.kind, view.ox + (p.x + 0.5) * s, view.oy + (p.y + 0.5) * s, iconScale, true);
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
      // Ruta prevista: más fina y tenue que la real, con un anillo en el destino.
      const frame = { ox: view.ox, oy: view.oy, s, w: view.w, h: view.h };
      if (preview && me) drawRoutePreview(g, preview, posOf(me, now), now, frame, isHolo);

      const fig = Math.max(28, Math.min(72, s * 1.85));
      const list = st.order.map((id) => st.actors[id]).filter((a): a is ActorView => !!a && a.seen);
      // Primero los caídos (debajo); después, de arriba abajo, para que los de delante tapen a los de detrás.
      list.sort((a, b) => Number(a.alive) - Number(b.alive) || posOf(a, now).y - posOf(b, now).y);
      const plates: { a: ActorView; x: number; y: number }[] = [];
      /** Coronilla y medio ancho de la cabeza de cada vivo a la vista: ahí apunta su bocadillo y eso no se tapa. */
      const heads = new Map<string, { x: number; y: number; r: number }>();
      for (const a of list) {
        const p = posOf(a, now);
        const x = view.ox + (p.x + 0.5) * s;
        const y = view.oy + (p.y + 0.75) * s;
        if (y > obY + 0.55 * s) obelisk();
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
            facings.set(a.id, facingOf(dx, dy, facings.get(a.id) ?? 'S'));
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
        // Si ha caído delante de ti, la caída dura 700 ms (nada con «reducir movimiento»).
        const fall = !a.alive && !reduced && st.fellAt[a.id] ? Math.min(1, (realNow - st.fellAt[a.id]) / 700) : undefined;
        const pose: Pose = {
          facing: facings.get(a.id) ?? 'S',
          t: now + (a.id.charCodeAt(0) % 7) * 137,
          moving,
          running,
          swimming,
          crouched,
          dead: !a.alive,
          celebrating: st.phase === 'terminada' && st.winnerId === a.id,
          climbing: a.alive && moving && !swimming && (tile === T.MONTANA || tile === T.CUMBRE),
          fall,
        };
        // Cada fotograma de su animación se dibuja una vez y después se copia (sin GPU, dibujar las figuras era lo
        // que más costaba de cada fotograma).
        sprites.draw(g, a.id, lookOf(a), x, swimming ? y + fig * 0.22 : y, fig, pose, view.dpr, steady);
        frameHits.push({ id: a.id, x, top: y - fig * 1.05, bottom: y + 4, half: fig * 0.26 });
        if (a.id === st.me || fig >= 40) plates.push({ a, x, y });
        if (a.alive) heads.set(a.id, { x, y: y - fig * (swimming ? 0.8 : 1.02), r: fig * 0.2 });
      }

      obelisk();

      // Noche: la arena se oscurece al anochecer y aclara al amanecer; se encienden ventanas y braseros.
      const dark = st.day && st.phase === 'en_curso' ? dayPhase(now, st.day).darkness : 0;
      if (dark > 0) {
        g.fillStyle = `rgba(6,10,28,${(0.55 * dark).toFixed(3)})`;
        g.fillRect(0, 0, view.w, view.h);
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (const l of art.lights) {
          const lx = view.ox + l.x * s;
          const ly = view.oy + l.y * s;
          if (lx < -80 || ly < -80 || lx > view.w + 80 || ly > view.h + 80) continue;
          const fire = l.kind === 'fuego';
          const flick = fire ? 0.85 + Math.sin(now / 130 + l.x * 7) * 0.08 + Math.sin(now / 57 + l.y) * 0.07 : 1;
          const r = s * (fire ? 1.4 : 0.7) * flick;
          const grad = g.createRadialGradient(lx, ly, 0, lx, ly, r);
          grad.addColorStop(0, `rgba(255,${fire ? 150 : 190},${fire ? 70 : 110},${(0.55 * dark * flick).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(255,140,60,0)');
          g.fillStyle = grad;
          g.fillRect(lx - r, ly - r, r * 2, r * 2);
          if (!fire) {
            g.fillStyle = `rgba(255,205,130,${(0.9 * dark).toFixed(3)})`;
            g.fillRect(lx - s * 0.06, ly - s * 0.05, s * 0.12, s * 0.1);
          }
        }
        g.restore();
      }
      drawObeliskGlow(g, obX, obY, s, now, dark);

      // Niebla de guerra: lo que queda fuera de tu radio de visión se oscurece.
      if (st.visibility === 'niebla' && me?.alive && me.vision && st.phase === 'en_curso') {
        const p = posOf(me, now);
        const x = view.ox + (p.x + 0.5) * s;
        const y = view.oy + (p.y + 0.5) * s;
        fog.draw(g, x, y, me.vision * s, view.w, view.h, view.dpr);
      }

      // Rótulos de mapa (texto con halo, sin cajas) por encima de la noche y la niebla.
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      const halo = (text: string, x: number, y: number, fill: string, stroke: string) => {
        g.strokeStyle = stroke;
        g.lineWidth = 3.5;
        g.strokeText(text, x, y);
        g.fillStyle = fill;
        g.fillText(text, x, y);
      };
      g.font = '600 11px Cinzel, "Times New Roman", serif';
      g.letterSpacing = '1px';
      for (const p of st.pois) {
        if (!known(p) || (p.kind === 'obelisco' && view.scale < 1.2)) continue;
        const x = view.ox + (p.x + 0.5) * s;
        const y = view.oy + (p.y + (p.kind === 'obelisco' ? 1.35 : 1.25)) * s + (isHolo ? iconScale * 6 : 0);
        if (x < -100 || y < -20 || x > view.w + 100 || y > view.h + 20) continue;
        halo(p.name, x, y, isHolo ? '#5fe3d0' : '#f1e3bf', isHolo ? 'rgba(2,12,11,0.9)' : 'rgba(22,18,12,0.85)');
      }
      g.letterSpacing = '0px';
      g.font = '600 11px "Archivo Variable", Archivo, sans-serif';
      for (const { a, x, y } of plates) halo(a.name, x, y + 12, a.id === st.me ? '#ffb07a' : a.alive ? '#f3ece0' : '#8f877b', 'rgba(10,12,13,0.88)');

      // «Visto por última vez» (GDD §7.4) y el tiempo hasta el destino previsto, como rótulos.
      for (const [id, seen] of Object.entries(st.lastSeen)) {
        const a = st.actors[id];
        if (!a || !a.alive || a.seen) continue;
        const box = drawLastSeen(g, a, seen, now, frame, fig, isHolo);
        if (box) frameHits.push(box);
      }
      if (preview) drawPreviewLabel(g, preview, frame, isHolo);

      // Lo que dicen los bots, por encima de todo (también de la noche y la niebla). Lo más reciente, delante.
      const real = Date.now();
      const said: SpeechItem[] = [];
      for (const [id, line] of Object.entries(st.speech)) {
        const head = heads.get(id);
        if (head && real - line.at <= BUBBLE_MS) said.push({ id, text: line.text, at: line.at, hx: head.x, hy: head.y, hr: head.r });
      }
      const faces = said.length ? [...heads].map(([id, h]) => ({ id, ...h })) : [];
      speech.draw(g, said, { holo: isHolo, reduced, bounds: view, heads: faces, now: real });
      hits = frameHits;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('wheel', wheel);
      if (apiRef) apiRef.current = null;
    };
  }, [tiles, heights, size, seed, apiRef]);

  return (
    <div ref={wrap} className="map-wrap">
      <canvas ref={canvas} className="map-canvas" aria-label="Mapa de la arena. Toca una casilla para ver la ruta y el tiempo, y vuelve a tocarla para ir. Toca a un participante para ver su tarjeta." role="img" />
    </div>
  );
}
