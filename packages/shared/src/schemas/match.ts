import { z } from 'zod';
import type { Portrait } from './character.js';
import type { Gender } from '../game/districts.js';

/**
 * Protocolo de partida (GDD §3). El servidor es la autoridad: el cliente solo envía intenciones
 * y dibuja lo que recibe. El movimiento viaja como rutas con hora de llegada a cada casilla,
 * así el cliente interpola sin saltos aunque reciba los fotogramas a 5 Hz.
 */

// ---------- Cargas cliente → servidor ----------
export const MovePayload = z.object({ x: z.number().int().min(0).max(255), y: z.number().int().min(0).max(255) });
export const VotePayload = z.object({ yes: z.boolean() });
export const ResumePayload = z.object({ ready: z.boolean() });

// ---------- Estado visible ----------
export type MatchPhase = 'presentacion' | 'cuenta_atras' | 'en_curso' | 'terminada';
export type EliminationCause = 'abandono' | 'desconexion';
/** Quién mueve al personaje: su jugador, el piloto automático o nadie (a cubierto). */
export type ActorControl = 'jugador' | 'piloto' | 'protegido';

/** Ruta: casillas en pares x,y y hora de llegada a cada una, en ms de reloj de partida. */
export interface RouteDTO {
  cells: number[];
  times: number[];
}

export interface ActorView {
  id: string;
  kind: 'human' | 'bot';
  userId: string | null;
  name: string;
  epithet: string | null;
  color: string;
  frame: string;
  portrait: Portrait;
  district: number;
  gender: Gender;
  alive: boolean;
  /** Puesto final (1 = ganador). Se fija al caer o al terminar. */
  place: number | null;
  cause: EliminationCause | null;
  connected: boolean;
  control: ActorControl;
  /** false con niebla de guerra si queda fuera de tu vista: entonces no hay posición. */
  seen: boolean;
  /** Radio de visión en casillas (con terreno y noche): solo el del propio personaje. */
  vision: number | null;
  /** Regiones descubiertas (bit i = región i): solo el propio personaje. */
  explored?: number | null;
  /** Casilla donde empieza su ruta, o donde está si no se mueve (−1 si no se ve). */
  x: number;
  y: number;
  route: RouteDTO | null;
}

export interface PauseDTO {
  reason: 'votacion' | 'reinicio';
  /** Hora real (ms) en que empezó. */
  since: number;
  /** Usuarios que ya han pulsado «Listo» para seguir. */
  ready: string[];
  /** Usuarios conectados que deben pulsarlo. */
  needed: string[];
  /** Hora real en que se reanuda (cuenta atrás de 3 s), o null. */
  resumeAt: number | null;
}

export interface VoteDTO {
  byUserId: string;
  byName: string;
  yes: string[];
  no: string[];
  /** Votos a favor necesarios. */
  needed: number;
  endsAt: number;
}

export interface PoiDTO {
  id: number;
  name: string;
  kind: 'ruinas' | 'poblado' | 'cueva' | 'manantial' | 'obelisco';
  x: number;
  y: number;
}

export interface MatchMapDTO {
  size: number;
  /** Casillas en base64, una por byte (ids de terreno). */
  tiles: string;
  /** Alturas 0–255 en base64, una por casilla (relieve del mapa ilustrado). Vacío en partidas de la 0.5. */
  heights?: string;
  center: { x: number; y: number };
  /** Puntos de interés; cada uno da nombre a su región (la casilla más cercana manda). El 0 es el Obelisco. */
  pois?: PoiDTO[];
}

/** Ciclo de día y noche: empieza de día al acabar la cuenta atrás (ms de juego). */
export interface DayCycleDTO {
  dayMs: number;
  nightMs: number;
  startAt: number;
}

/** Reloj de partida: t (ms de juego) medido en el instante now (ms reales del servidor). */
export interface MatchClock {
  t: number;
  now: number;
  running: boolean;
}

export interface MatchSnapshot {
  matchId: string;
  seed: string;
  map: MatchMapDTO;
  phase: MatchPhase;
  /** Fin de la fase de presentación o de cuenta atrás, en ms de juego. */
  phaseEndsAt: number | null;
  clock: MatchClock;
  paused: PauseDTO | null;
  vote: VoteDTO | null;
  actors: ActorView[];
  /** Id del personaje propio, o null si solo se mira. */
  me: string | null;
  winnerId: string | null;
  visibility: 'visible' | 'niebla';
  day?: DayCycleDTO;
}

/** Fotograma incremental: solo los personajes que han cambiado para este destinatario. */
export interface MatchFrame {
  matchId: string;
  phase: MatchPhase;
  phaseEndsAt: number | null;
  clock: MatchClock;
  paused: PauseDTO | null;
  vote: VoteDTO | null;
  winnerId: string | null;
  actors: ActorView[];
  gone: string[];
}

export interface MatchEventDTO {
  kind: 'fase' | 'eliminado' | 'pausa' | 'reanudada' | 'votacion' | 'fin' | 'conexion' | 'descubre' | 'anochece' | 'amanece';
  text: string;
  at: number;
}
