import {
  computeDerived,
  hashString,
  Rng,
  terrainCosts,
  visionByTerrain,
  type ActorControl,
  type ActorView,
  type Character,
  type EliminationCause,
  type Gender,
  type MatchPhase,
  type MatchSnapshot,
  type PauseDTO,
  type Portrait,
  type RngState,
  type VoteDTO,
} from '@ceniza/shared';
import { generateMap, inBounds, spawnRing, tileAt, type Cell, type GameMap } from './map.js';
import { findPath } from './path.js';
import { buildRoute, nextStop, routeEnd, routeEndTime, routeGlimpse, routePosition, truncateAfterCurrent, type Route } from './route.js';
import { decodeTiles, encodeTiles, T, TERRAIN } from './terrain.js';

/**
 * Simulación autoritativa de una partida (GDD §3). Sin E/S: el servidor la hace avanzar a 10 Hz,
 * le pasa intenciones y difunde lo que devuelve. Todo el azar sale de un PRNG con estado que se
 * guarda en las instantáneas, así una partida restaurada sigue exactamente igual.
 */
export const TICK_MS = 100;
export const MAX_ROUTE_CELLS = 220;
export const VOTE_MS = 30_000;
export const RESUME_COUNTDOWN_MS = 3_000;

export interface ActorInit {
  id: string;
  kind: 'human' | 'bot';
  userId: string | null;
  character: Character;
  district: number;
  gender: Gender;
}

export interface ActorState {
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
  /** Casillas por segundo en terreno de coste 1. */
  speed: number;
  /** Radio de visión en pradera, de día. */
  vision: number;
  /** Coste de cada terreno para este personaje (ventajas de distrito), por id de terreno. */
  costs: number[];
  /** Radio de visión en cada terreno (bosque lo recorta, la altura lo amplía), por id de terreno. */
  visionBy: number[];
  /** Casilla donde empieza la ruta en curso, o donde está si no se mueve. */
  x: number;
  y: number;
  route: Route | null;
  alive: boolean;
  place: number | null;
  cause: EliminationCause | null;
  eliminatedAt: number | null;
  connected: boolean;
  control: ActorControl;
  /** Momento (ms de juego) en que se desconectó. */
  offlineSince: number | null;
  /** Cuándo vuelve a decidir el piloto automático (ms de juego). */
  nextThinkAt: number;
}

export interface WorldRules {
  visibility: 'visible' | 'niebla';
  pauseVote: 'mayoria' | 'unanimidad';
  disconnectPolicy: 'proteger' | 'piloto' | 'eliminar';
  disconnectGraceMs: number;
  presentationMs: number;
  countdownMs: number;
}

export interface PauseState {
  reason: 'votacion' | 'reinicio';
  since: number;
  ready: string[];
  resumeAt: number | null;
}

export interface VoteState {
  byUserId: string;
  byName: string;
  yes: string[];
  no: string[];
  endsAt: number;
}

export interface World {
  v: 1;
  seed: string;
  map: GameMap;
  tick: number;
  /** Reloj de partida en ms: solo avanza fuera de pausa. */
  t: number;
  phase: MatchPhase;
  phaseEndsAt: number | null;
  paused: PauseState | null;
  vote: VoteState | null;
  actors: ActorState[];
  rng: Rng;
  rules: WorldRules;
  winnerId: string | null;
}

export type WorldEvent =
  | { type: 'fase'; phase: MatchPhase }
  | { type: 'eliminado'; actorId: string; cause: EliminationCause; place: number }
  | { type: 'fin'; winnerId: string | null }
  | { type: 'pausa'; reason: 'votacion' | 'reinicio' }
  | { type: 'reanudada' }
  | { type: 'votacion'; result: 'abierta' | 'aprobada' | 'rechazada' | 'caducada'; byName: string }
  | { type: 'conexion'; actorId: string; connected: boolean };

export class IntentError extends Error {}

// ------------------------------------------------------------------ creación
export function createWorld(opts: { seed: string; mapSize: number; actors: ActorInit[]; rules: WorldRules }): World {
  const map = generateMap(opts.seed, opts.mapSize);
  const rng = new Rng('mundo:' + opts.seed);
  const spawns = spawnRing(map, opts.actors.length);
  // Orden de salida al azar: nadie elige su sitio en el anillo.
  for (let i = spawns.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [spawns[i], spawns[j]] = [spawns[j], spawns[i]];
  }
  const startAt = opts.rules.presentationMs + opts.rules.countdownMs;
  const actors = opts.actors.map((a, i): ActorState => {
    const c = a.character;
    const build = { attributes: c.attributes, abilities: c.abilities, trait: c.trait, defect: c.defect, district: a.district };
    const d = computeDerived(build);
    return {
      id: a.id,
      kind: a.kind,
      userId: a.userId,
      name: c.name,
      epithet: c.epithet || null,
      color: c.color,
      frame: c.frame,
      portrait: c.portrait,
      district: a.district,
      gender: a.gender,
      speed: d.moveSpeed,
      vision: d.visionRadius,
      costs: terrainCosts(build),
      visionBy: visionByTerrain(build, d),
      x: spawns[i].x,
      y: spawns[i].y,
      route: null,
      alive: true,
      place: null,
      cause: null,
      eliminatedAt: null,
      connected: true,
      control: a.kind === 'bot' ? 'piloto' : 'jugador',
      offlineSince: null,
      nextThinkAt: startAt + rng.int(300, 2500),
    };
  });
  return {
    v: 1,
    seed: opts.seed,
    map,
    tick: 0,
    t: 0,
    phase: 'presentacion',
    phaseEndsAt: opts.rules.presentationMs,
    paused: null,
    vote: null,
    actors,
    rng,
    rules: opts.rules,
    winnerId: null,
  };
}

export function actorById(w: World, id: string): ActorState | undefined {
  return w.actors.find((a) => a.id === id);
}

export function actorOfUser(w: World, userId: string): ActorState | undefined {
  return w.actors.find((a) => a.kind === 'human' && a.userId === userId);
}

export function positionAt(a: ActorState, t: number): { x: number; y: number } {
  return a.route ? routePosition(a.route, t) : { x: a.x, y: a.y };
}

/** Radio de visión según el terreno que pisa en ese punto. */
export function visionAt(w: World, a: ActorState, p: { x: number; y: number }): number {
  const x = Math.min(w.map.size - 1, Math.max(0, Math.round(p.x)));
  const y = Math.min(w.map.size - 1, Math.max(0, Math.round(p.y)));
  return a.visionBy?.[tileAt(w.map, x, y)] ?? a.vision;
}

export function aliveCount(w: World): number {
  return w.actors.reduce((n, a) => n + (a.alive ? 1 : 0), 0);
}

// ------------------------------------------------------------------ avance
/**
 * Avanza un tick. `now` es la hora real (pausas y votaciones se miden en tiempo real);
 * `eligible` son los usuarios humanos vivos y conectados, que son quienes votan y reanudan.
 */
export function tick(w: World, now: number, eligible: string[]): WorldEvent[] {
  const ev: WorldEvent[] = [];
  if (w.vote && now >= w.vote.endsAt) {
    ev.push({ type: 'votacion', result: 'caducada', byName: w.vote.byName });
    w.vote = null;
  }
  if (w.phase === 'terminada') return ev;
  if (w.paused) {
    evaluateResume(w, now, eligible);
    if (w.paused.resumeAt == null || now < w.paused.resumeAt) return ev;
    w.paused = null;
    ev.push({ type: 'reanudada' });
  }
  w.tick++;
  w.t += TICK_MS;
  if (w.phaseEndsAt != null && w.t >= w.phaseEndsAt) {
    if (w.phase === 'presentacion') {
      w.phase = 'cuenta_atras';
      w.phaseEndsAt = w.t + w.rules.countdownMs;
    } else if (w.phase === 'cuenta_atras') {
      w.phase = 'en_curso';
      w.phaseEndsAt = null;
    }
    ev.push({ type: 'fase', phase: w.phase });
  }
  if (w.phase !== 'en_curso') return ev;
  for (const a of w.actors) {
    if (!a.alive) continue;
    if (a.route && routeEndTime(a.route) <= w.t) {
      const end = routeEnd(a.route);
      a.x = end.x;
      a.y = end.y;
      a.route = null;
    }
    if (a.kind === 'human' && !a.connected && w.rules.disconnectPolicy === 'eliminar' && a.offlineSince != null && w.t - a.offlineSince >= w.rules.disconnectGraceMs) {
      ev.push(...eliminate(w, a.id, 'desconexion'));
      if ((w.phase as MatchPhase) === 'terminada') break;
      continue;
    }
    if (a.control === 'piloto' && !a.route && w.t >= a.nextThinkAt) wander(w, a);
  }
  return ev;
}

/**
 * Piloto provisional: elige un destino cercano y camina hasta él. Usa la misma API que un humano.
 * La IA de verdad (utility AI, memoria, percepción) sustituye esto en la fase 6.
 */
function wander(w: World, a: ActorState) {
  const from = { x: a.x, y: a.y };
  for (let tries = 0; tries < 8; tries++) {
    const r = w.rng.int(5, 14);
    const ang = w.rng.float(0, Math.PI * 2);
    const x = Math.round(a.x + Math.cos(ang) * r);
    const y = Math.round(a.y + Math.sin(ang) * r);
    if (!inBounds(w.map, x, y)) continue;
    const tt = tileAt(w.map, x, y);
    if (tt === T.AGUA || tt === T.CUMBRE) continue;
    const path = findPath(w.map, from, { x, y }, 5000, a.costs);
    if (!path || path.length === 0) continue;
    a.route = buildRoute(w.map, from, path, w.t, a.speed, a.costs);
    a.nextThinkAt = routeEndTime(a.route) + w.rng.int(1500, 6000);
    return;
  }
  a.nextThinkAt = w.t + 2000;
}

// ------------------------------------------------------------------ intenciones
function requireActive(w: World, a: ActorState | undefined): ActorState {
  if (!a) throw new IntentError('No participas en esta partida');
  if (w.phase === 'terminada') throw new IntentError('La partida ha terminado');
  if (!a.alive) throw new IntentError('Has caído: ahora solo puedes mirar');
  if (w.paused) throw new IntentError('La partida está en pausa');
  if (w.phase !== 'en_curso') throw new IntentError('Espera a que termine la cuenta atrás');
  return a;
}

function concat(head: Route | null, tail: Route): Route {
  if (!head) return tail;
  return { cells: [...head.cells, ...tail.cells.slice(2)], times: [...head.times, ...tail.times.slice(1)] };
}

/** Ir a una casilla. Si está a mitad de un paso, lo termina y sigue desde ahí. */
export function moveIntent(w: World, actorId: string, to: Cell): void {
  const a = requireActive(w, actorById(w, actorId));
  if (!inBounds(w.map, to.x, to.y)) throw new IntentError('Ese destino está fuera de la arena');
  const stop = nextStop(a.route, { x: a.x, y: a.y }, w.t);
  const head = a.route ? truncateAfterCurrent(a.route, w.t) : null;
  if (stop.cell.x === to.x && stop.cell.y === to.y) {
    a.route = head && head.times.length > 1 ? head : null;
    return;
  }
  const path = findPath(w.map, stop.cell, to, undefined, a.costs);
  if (!path) throw new IntentError('No hay camino hasta ahí');
  if (path.length > MAX_ROUTE_CELLS) throw new IntentError('Demasiado lejos para una sola orden: elige un punto más cercano');
  const tail = buildRoute(w.map, stop.cell, path, stop.time, a.speed, a.costs);
  const route = concat(head && head.times.length > 1 ? head : null, tail);
  if (!a.route) {
    a.x = route.cells[0];
    a.y = route.cells[1];
  }
  a.route = route;
}

export function stopIntent(w: World, actorId: string): void {
  const a = requireActive(w, actorById(w, actorId));
  if (a.route) {
    const r = truncateAfterCurrent(a.route, w.t);
    a.route = r.times.length > 1 ? r : null;
  }
}

/** Cae un participante (abandono o desconexión). Si queda uno o ninguno, termina la partida. */
export function eliminate(w: World, actorId: string, cause: EliminationCause): WorldEvent[] {
  const a = actorById(w, actorId);
  if (!a || !a.alive || w.phase === 'terminada') return [];
  const place = aliveCount(w);
  const pos = positionAt(a, w.t);
  a.x = Math.round(pos.x);
  a.y = Math.round(pos.y);
  a.alive = false;
  a.place = place;
  a.cause = cause;
  a.eliminatedAt = w.t;
  a.route = null;
  const ev: WorldEvent[] = [{ type: 'eliminado', actorId, cause, place }];
  const remaining = w.actors.filter((x) => x.alive);
  if (remaining.length <= 1) {
    const winner = remaining[0] ?? null;
    if (winner) {
      const p = positionAt(winner, w.t);
      winner.x = Math.round(p.x);
      winner.y = Math.round(p.y);
      winner.route = null;
      winner.place = 1;
    }
    w.winnerId = winner?.id ?? null;
    w.phase = 'terminada';
    w.phaseEndsAt = null;
    w.vote = null;
    w.paused = null;
    ev.push({ type: 'fase', phase: 'terminada' }, { type: 'fin', winnerId: w.winnerId });
  }
  return ev;
}

/** Conexión de un humano. Según la configuración de sala, lo lleva el piloto o se queda a cubierto. */
export function setConnected(w: World, actorId: string, connected: boolean): WorldEvent[] {
  const a = actorById(w, actorId);
  if (!a || a.kind !== 'human' || a.connected === connected) return [];
  a.connected = connected;
  if (connected) {
    a.offlineSince = null;
    a.control = 'jugador';
    if (a.route && a.alive) {
      // Lo que planeó el piloto se acaba en el paso actual: el jugador decide desde ahí.
      const r = truncateAfterCurrent(a.route, w.t);
      a.route = r.times.length > 1 ? r : null;
    }
  } else {
    a.offlineSince = w.t;
    if (w.rules.disconnectPolicy === 'piloto') {
      a.control = 'piloto';
      a.nextThinkAt = Math.max(w.t + 1500, a.route ? routeEndTime(a.route) : 0);
    } else {
      a.control = 'protegido';
      if (a.route) {
        const r = truncateAfterCurrent(a.route, w.t);
        a.route = r.times.length > 1 ? r : null;
      }
    }
  }
  return a.alive ? [{ type: 'conexion', actorId, connected }] : [];
}

// ------------------------------------------------------------------ pausa por votación
function votesNeeded(w: World, eligible: string[]): number {
  return w.rules.pauseVote === 'unanimidad' ? eligible.length : Math.floor(eligible.length / 2) + 1;
}

function evaluateVote(w: World, eligible: string[]): WorldEvent[] {
  const v = w.vote;
  if (!v) return [];
  const yes = v.yes.filter((u) => eligible.includes(u)).length;
  const no = v.no.filter((u) => eligible.includes(u)).length;
  const needed = votesNeeded(w, eligible);
  if (yes >= needed) {
    w.vote = null;
    w.paused = { reason: 'votacion', since: 0, ready: [], resumeAt: null };
    return [{ type: 'votacion', result: 'aprobada', byName: v.byName }, { type: 'pausa', reason: 'votacion' }];
  }
  if (no > eligible.length - needed) {
    w.vote = null;
    return [{ type: 'votacion', result: 'rechazada', byName: v.byName }];
  }
  return [];
}

export function proposePause(w: World, userId: string, name: string, eligible: string[], now: number): WorldEvent[] {
  if (w.phase !== 'en_curso') throw new IntentError('Solo se puede pausar con la partida en marcha');
  if (w.paused) throw new IntentError('La partida ya está en pausa');
  if (!eligible.includes(userId)) throw new IntentError('Solo votan los participantes vivos y conectados');
  if (w.vote) return castVote(w, userId, true, eligible);
  w.vote = { byUserId: userId, byName: name, yes: [userId], no: [], endsAt: now + VOTE_MS };
  const ev: WorldEvent[] = [{ type: 'votacion', result: 'abierta', byName: name }];
  const res = evaluateVote(w, eligible);
  const p = w.paused as PauseState | null;
  if (p) p.since = now;
  return [...ev, ...res];
}

export function castVote(w: World, userId: string, yes: boolean, eligible: string[], now = Date.now()): WorldEvent[] {
  const v = w.vote;
  if (!v) throw new IntentError('No hay ninguna votación abierta');
  if (!eligible.includes(userId)) throw new IntentError('Solo votan los participantes vivos y conectados');
  v.yes = v.yes.filter((u) => u !== userId);
  v.no = v.no.filter((u) => u !== userId);
  (yes ? v.yes : v.no).push(userId);
  const res = evaluateVote(w, eligible);
  if (w.paused && w.paused.since === 0) w.paused.since = now;
  return res;
}

function evaluateResume(w: World, now: number, eligible: string[]) {
  const p = w.paused;
  if (!p) return;
  const allReady = eligible.length > 0 && eligible.every((u) => p.ready.includes(u));
  if (allReady && p.resumeAt == null) p.resumeAt = now + RESUME_COUNTDOWN_MS;
  if (!allReady) p.resumeAt = null;
}

export function setResumeReady(w: World, userId: string, ready: boolean, eligible: string[], now: number): void {
  const p = w.paused;
  if (!p) throw new IntentError('La partida no está en pausa');
  if (!eligible.includes(userId)) throw new IntentError('Solo los participantes vivos y conectados deciden cuándo seguir');
  p.ready = p.ready.filter((u) => u !== userId);
  if (ready) p.ready.push(userId);
  evaluateResume(w, now, eligible);
}

/** Tras reiniciar el servidor la partida vuelve en pausa y sin nadie conectado (GDD §3). */
export function pauseForRestart(w: World, now: number): void {
  if (w.phase === 'terminada') return;
  w.vote = null;
  w.paused = { reason: 'reinicio', since: now, ready: [], resumeAt: null };
  for (const a of w.actors) if (a.kind === 'human') setConnected(w, a.id, false);
}

// ------------------------------------------------------------------ vista por destinatario
function toView(w: World, a: ActorState, self: boolean, seen: boolean): ActorView {
  return {
    id: a.id,
    kind: a.kind,
    userId: a.userId,
    name: a.name,
    epithet: a.epithet,
    color: a.color,
    frame: a.frame,
    portrait: a.portrait,
    district: a.district,
    gender: a.gender,
    alive: a.alive,
    place: a.place,
    cause: a.cause,
    connected: a.connected,
    control: a.control,
    seen,
    vision: self ? visionAt(w, a, positionAt(a, w.t)) : null,
    x: seen ? a.x : -1,
    y: seen ? a.y : -1,
    route: seen && a.route ? (self ? a.route : routeGlimpse(a.route, w.t)) : null,
  };
}

/**
 * Lo que ve cada uno (GDD §7.4). Con niebla, un vivo solo ve a quien está dentro de su radio de
 * visión; los caídos y quien no juega lo ven todo. Los bots usarán esta misma función (fase 6).
 */
export function computeView(w: World, viewerUserId: string | null): { me: string | null; actors: ActorView[] } {
  const me = viewerUserId ? actorOfUser(w, viewerUserId) : undefined;
  const fog = w.rules.visibility === 'niebla' && !!me && me.alive && w.phase === 'en_curso';
  const mine = me ? positionAt(me, w.t) : null;
  const radius = me && mine ? visionAt(w, me, mine) : 0;
  const actors = w.actors.map((a) => {
    const self = a.id === me?.id;
    let seen = true;
    if (fog && !self && a.alive && mine) {
      const p = positionAt(a, w.t);
      seen = Math.hypot(p.x - mine.x, p.y - mine.y) <= radius;
    }
    return toView(w, a, self, seen);
  });
  return { me: me?.id ?? null, actors };
}

export function pauseDTO(w: World, eligible: string[]): PauseDTO | null {
  return w.paused ? { reason: w.paused.reason, since: w.paused.since, ready: [...w.paused.ready], needed: [...eligible], resumeAt: w.paused.resumeAt } : null;
}

export function voteDTO(w: World, eligible: string[]): VoteDTO | null {
  return w.vote ? { byUserId: w.vote.byUserId, byName: w.vote.byName, yes: [...w.vote.yes], no: [...w.vote.no], needed: votesNeeded(w, eligible), endsAt: w.vote.endsAt } : null;
}

export function snapshotFor(w: World, matchId: string, viewerUserId: string | null, now: number, eligible: string[]): MatchSnapshot {
  const view = computeView(w, viewerUserId);
  return {
    matchId,
    seed: w.seed,
    map: { size: w.map.size, tiles: encodeTiles(w.map.tiles), center: w.map.center },
    phase: w.phase,
    phaseEndsAt: w.phaseEndsAt,
    clock: { t: w.t, now, running: !w.paused && w.phase !== 'terminada' },
    paused: pauseDTO(w, eligible),
    vote: voteDTO(w, eligible),
    actors: view.actors,
    me: view.me,
    winnerId: w.winnerId,
    visibility: w.rules.visibility,
  };
}

// ------------------------------------------------------------------ instantáneas
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export interface WorldJSON extends Omit<World, 'map' | 'rng'> {
  map: { size: number; tiles: string; center: Cell };
  rng: RngState;
}

export function serializeWorld(w: World): WorldJSON {
  return { ...clone({ ...w, map: undefined, rng: undefined }), map: { size: w.map.size, tiles: encodeTiles(w.map.tiles), center: { ...w.map.center } }, rng: w.rng.state() } as WorldJSON;
}

export function restoreWorld(j: WorldJSON): World {
  const w = { ...clone(j), map: { size: j.map.size, tiles: decodeTiles(j.map.tiles), center: { ...j.map.center } }, rng: new Rng(j.rng) } as World;
  // Partidas guardadas por la 0.4: siguen con las reglas de entonces (sin ventajas de terreno).
  for (const a of w.actors) {
    a.costs ??= TERRAIN.map((t) => t.cost);
    a.visionBy ??= TERRAIN.map(() => a.vision);
  }
  return w;
}

export function hashWorld(w: World): number {
  return hashString(JSON.stringify(serializeWorld(w)));
}
