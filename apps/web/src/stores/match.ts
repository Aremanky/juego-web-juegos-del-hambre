import { create } from 'zustand';
import type { ActorView, DayCycleDTO, MatchEventDTO, MatchFrame, MatchSnapshot, PoiDTO } from '@ceniza/shared';
import { decodeTiles, heightsFromTiles } from '@ceniza/engine';
import { getSocket } from '../lib/socket';
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
};

export const useMatch = create<MatchStore>((set, get) => ({
  ...empty,
  reset: () => set({ ...empty }),
  applySnapshot(snap) {
      skew = snap.clock.now - Date.now();
      const same = get().matchId === snap.matchId;
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
        actors: Object.fromEntries(snap.actors.map((a) => [a.id, a])),
        order: snap.actors.map((a) => a.id),
        clock: { t: snap.clock.t, at: snap.clock.now, running: snap.clock.running },
        log: same ? get().log : [],
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
      set({
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
      set({ log: [...get().log, e].slice(-40) });
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
