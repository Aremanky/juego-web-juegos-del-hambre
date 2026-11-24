import { create } from 'zustand';
import type { ActorView, DayCycleDTO, MatchEventDTO, MatchFrame, MatchSnapshot, PoiDTO } from '@ceniza/shared';
import { decodeTiles, heightsFromTiles, routePosition } from '@ceniza/engine';
import { getSocket } from '../lib/socket';
import { trackFalls, trackSight, type LastSeen } from './sight';
import { toast } from './toast';

/**
 * Réplica local de la partida: la instantánea al entrar y los fotogramas incrementales a 5 Hz.
 * El reloj se sincroniza con el del servidor para interpolar las rutas sin saltos.
 */
interface MatchStore {
  matchId: string | null;
  seed: string;
  size: number;
  tiles: Uint8Array | null;
  heights: Uint8Array | null;
  pois: PoiDTO[];
  /** Ríos y caminos como listas de casillas [x0, y0, x1, y1, …] (vacías en partidas anteriores a la 0.7). */
  rivers: number[][];
  roads: number[][];
  day: DayCycleDTO | null;
  center: { x: number; y: number };
  visibility: 'visible' | 'niebla';
  phase: MatchSnapshot['phase'] | null;
  phaseEndsAt: number | null;
  paused: MatchSnapshot['paused'];
  vote: MatchSnapshot['vote'];
  winnerId: string | null;
  me: string | null;
  actors: Record<string, ActorView>;
  order: string[];
  clock: { t: number; at: number; running: boolean };
  log: MatchEventDTO[];
  /** Lo último que ha dicho cada bot y cuándo llegó (hora local), para su bocadillo en el mapa. */
  speech: Record<string, { text: string; at: number }>;
  /** Dónde y cuándo viste por última vez a quien ya no ves (solo lo que viste; se pierde al recargar). */
  lastSeen: Record<string, LastSeen>;
  /** Hora local a la que cayó cada uno delante de ti, para animar la caída. */
  fellAt: Record<string, number>;
  applySnapshot(snap: MatchSnapshot): void;
  reset(): void;
  wire(): void;
}

let wired = false;
/** Diferencia entre el reloj del servidor y el local (ms). */
let skew = 0;

const empty = {
  matchId: null,
  seed: '',
  size: 0,
  tiles: null,
  heights: null,
  pois: [],
  rivers: [],
  roads: [],
  day: null,
  center: { x: 0, y: 0 },
  visibility: 'visible' as const,
  phase: null,
  phaseEndsAt: null,
  paused: null,
  vote: null,
  winnerId: null,
  me: null,
  actors: {},
  order: [],
  clock: { t: 0, at: 0, running: false },
  log: [],
  speech: {},
  lastSeen: {},
  fellAt: {},
};

/** Posición (con decimales) de un participante en el instante t de la partida. */
const posAt = (a: ActorView, t: number) => (a.route ? routePosition(a.route, t) : { x: a.x, y: a.y });

/** Marcas de «visto por última vez» y caídas tras un cambio de vista; `t` es la hora de partida del cambio. */
function sightAfter(prev: Pick<MatchStore, 'lastSeen' | 'fellAt' | 'actors'>, actors: Record<string, ActorView>, t: number) {
  return {
    lastSeen: trackSight(prev.lastSeen, prev.actors, actors, t, (a) => posAt(a, t)),
    fellAt: trackFalls(prev.fellAt, prev.actors, actors, Date.now()),
  };
}

export const useMatch = create<MatchStore>((set, get) => ({
  ...empty,
  reset: () => set({ ...empty }),
  applySnapshot(snap) {
      skew = snap.clock.now - Date.now();
      const same = get().matchId === snap.matchId;
      const actors = Object.fromEntries(snap.actors.map((a) => [a.id, a]));
      const sight = same ? sightAfter(get(), actors, snap.clock.t) : { lastSeen: {}, fellAt: {} };
      set({
        matchId: snap.matchId,
        seed: snap.seed,
        size: snap.map.size,
        tiles: same && get().tiles ? get().tiles : decodeTiles(snap.map.tiles),
        // Partidas anteriores a la fase 7 no traen relieve: se aproxima por el terreno.
        heights: same && get().heights ? get().heights : snap.map.heights ? decodeTiles(snap.map.heights) : heightsFromTiles(decodeTiles(snap.map.tiles)),
        pois: snap.map.pois ?? [],
        rivers: same ? get().rivers : snap.map.rivers ?? [],
        roads: same ? get().roads : snap.map.roads ?? [],
        day: snap.day ?? null,
        center: snap.map.center,
        visibility: snap.visibility,
        phase: snap.phase,
        phaseEndsAt: snap.phaseEndsAt,
        paused: snap.paused,
        vote: snap.vote,
        winnerId: snap.winnerId,
        me: snap.me,
        actors,
        order: snap.actors.map((a) => a.id),
        clock: { t: snap.clock.t, at: snap.clock.now, running: snap.clock.running },
        log: same ? get().log : [],
        speech: same ? get().speech : {},
        ...sight,
      });
  },
  wire() {
    if (wired) return;
    wired = true;
    const s = getSocket();
    s.on('match:snapshot', (snap: MatchSnapshot) => get().applySnapshot(snap));
    s.on('match:frame', (f: MatchFrame) => {
      if (f.matchId !== get().matchId) return;
      // Suavizado: el desfase solo se corrige poco a poco para no dar tirones.
      skew = skew * 0.8 + (f.clock.now - Date.now()) * 0.2;
      const actors = f.actors.length ? { ...get().actors, ...Object.fromEntries(f.actors.map((a) => [a.id, a])) } : get().actors;
      const sight = f.actors.length ? sightAfter(get(), actors, f.clock.t) : {};
      set({
        ...sight,
        phase: f.phase,
        phaseEndsAt: f.phaseEndsAt,
        paused: f.paused,
        vote: f.vote,
        winnerId: f.winnerId,
        actors,
        clock: { t: f.clock.t, at: f.clock.now, running: f.clock.running },
      });
    });
    s.on('match:event', (e: MatchEventDTO) => {
      if (e.kind === 'dice' && e.actorId && e.say) {
        // Solo llega si ves al bot. Sin aviso emergente: va en su bocadillo y en el registro.
        const now = Date.now();
        const recent = Object.entries(get().speech).filter(([, v]) => now - v.at < 10_000);
        set({ log: [...get().log, e].slice(-40), speech: { ...Object.fromEntries(recent), [e.actorId]: { text: e.say, at: now } } });
        return;
      }
      set({ log: [...get().log, e].slice(-40) });
      const found = e.kind === 'descubre' ? e.poi : undefined;
      if (found) set({ pois: get().pois.map((p) => (p.id === found.id ? { ...p, name: found.name } : p)) });
      if (e.kind === 'fin' && e.pois) set({ pois: e.pois });
      if (e.kind === 'fin') toast.success(e.text);
      else if (e.kind === 'eliminado' || e.kind === 'pausa' || e.kind === 'votacion' || e.kind === 'descubre') toast.info(e.text);
    });
  },
}));

/** Tiempo de partida ahora mismo (ms), extrapolado desde el último reloj recibido. */
/** Avance de la presentación, de 0 a 1. La partida empieza en t = 0, así que es t / fin de la fase. */
export function presentationProgress(): number {
  const st = useMatch.getState();
  if (st.phase !== 'presentacion' || !st.phaseEndsAt) return 1;
  return Math.min(1, Math.max(0, gameNow() / st.phaseEndsAt));
}

export function gameNow(): number {
  const { clock } = useMatch.getState();
  if (!clock.running) return clock.t;
  return clock.t + Math.max(0, Date.now() + skew - clock.at);
}

/** Hora del servidor ahora mismo (ms), para las cuentas atrás en tiempo real (pausa, votación). */
export function serverNow(): number {
  return Date.now() + skew;
}
