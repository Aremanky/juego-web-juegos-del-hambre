import type { ActorView, MatchEventDTO, MatchSnapshot } from '@ceniza/shared';
import {
  IntentError,
  TICK_MS,
  actorById,
  actorOfUser,
  castVote,
  computeView,
  eliminate,
  moveIntent,
  pauseDTO,
  pauseForRestart,
  proposePause,
  restoreWorld,
  serializeWorld,
  setConnected,
  setResumeReady,
  snapshotFor,
  stopIntent,
  tick,
  voteDTO,
  type World,
  type WorldEvent,
} from '@ceniza/engine';
import { AppError, invalidState } from '../../lib/errors';
import { SerialQueue } from '../../lib/util';
import type { RoomIO } from '../rooms/runtime';
import type { MatchEventInsert, MatchRepository, MatchRow } from './repository';

export interface MatchTimings {
  lobbyCountdownMs: number;
  presentationMs: number;
  countdownMs: number;
  snapshotMs: number;
  /** Solo pruebas: día y noche más cortos que los del ritmo de sala. */
  dayMs?: number;
  nightMs?: number;
}

/** Lo que la partida necesita de su sala: sockets conectados, presencia y avisos. */
export interface MatchHost {
  sockets(): Iterable<[socketId: string, userId: string]>;
  isOnline(userId: string): boolean;
  onFinished(winnerParticipantId: string | null): Promise<void>;
}

export interface MatchDeps {
  repo: MatchRepository;
  io: RoomIO;
  log: { warn(obj: unknown, msg?: string): void; error(obj: unknown, msg?: string): void };
  timings: MatchTimings;
}

interface SentState {
  actors: Map<string, string>;
  header: string;
  clockAt: number;
}

const POLICY_TEXT = {
  piloto: 'le lleva el piloto automático',
  proteger: 'se pone a cubierto hasta que vuelva',
  eliminar: 'queda fuera si no vuelve a tiempo',
} as const;

/** Rendimiento del bucle: duración de los últimos ticks y lo enviado a los jugadores. */
export class MatchPerf {
  private readonly ticks = new Float64Array(1200); // dos minutos a 10 Hz
  private n = 0;
  frames = 0;
  /** Aproximado: longitud del JSON de cada fotograma (sin la envoltura de Socket.IO). */
  bytes = 0;

  tick(ms: number): void {
    this.ticks[this.n++ % this.ticks.length] = ms;
  }

  stats() {
    const k = Math.min(this.n, this.ticks.length);
    const v = Array.from(this.ticks.subarray(0, k)).sort((a, b) => a - b);
    const q = (p: number) => (k ? v[Math.min(k - 1, Math.floor(p * k))] : 0);
    return { ticks: this.n, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: k ? v[k - 1] : 0, frames: this.frames, bytes: this.bytes };
  }

  reset(): void {
    this.n = 0;
    this.frames = 0;
    this.bytes = 0;
  }
}

/**
 * Bucle de una partida: avanza el mundo a 10 Hz, difunde a cada jugador su propia vista a 5 Hz
 * (solo lo que ha cambiado), guarda instantáneas periódicas y registra cada evento.
 */
export class MatchRuntime {
  private timer: NodeJS.Timeout | null = null;
  private steps = 0;
  private sent = new Map<string, SentState>();
  private pending: MatchEventInsert[] = [];
  private lastSnapshotAt = Date.now();
  private persist = new SerialQueue();
  private finishing = false;
  lastActivity = Date.now();
  readonly perf = new MatchPerf();

  constructor(
    readonly id: string,
    readonly world: World,
    private readonly host: MatchHost,
    private readonly deps: MatchDeps,
  ) {}

  /** Recupera una partida guardada. Si estaba viva, vuelve en pausa (GDD §3). */
  static restore(row: MatchRow, host: MatchHost, deps: MatchDeps): MatchRuntime {
    const world = restoreWorld(row.snapshot);
    const rt = new MatchRuntime(row.id, world, host, deps);
    if (world.phase !== 'terminada') {
      pauseForRestart(world, Date.now());
      rt.record([{ type: 'pausa', reason: 'reinicio' }]);
    }
    return rt;
  }

  get finished(): boolean {
    return this.world.phase === 'terminada';
  }

  start(): void {
    if (this.timer || this.finished) return;
    this.timer = setInterval(() => this.step(), TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Para el bucle y guarda la instantánea (cierre del servidor o descarga de la sala). */
  async dispose(): Promise<void> {
    this.stop();
    if (!this.finished) this.queueSnapshot();
    this.flushEvents();
    await this.persist.run(async () => undefined);
  }

  /** Humanos vivos y conectados: los que votan la pausa y deciden cuándo seguir. */
  eligible(): string[] {
    return this.world.actors.filter((a) => a.kind === 'human' && a.alive && a.connected && a.userId && this.host.isOnline(a.userId)).map((a) => a.userId!);
  }

  step(now = Date.now()): void {
    const t0 = performance.now();
    this.steps++;
    const ev = tick(this.world, now, this.eligible());
    if (ev.length) this.handle(ev);
    if (this.steps % 2 === 0 || ev.length) this.broadcast(now);
    if (this.steps % 10 === 0) this.flushEvents();
    if (now - this.lastSnapshotAt >= this.deps.timings.snapshotMs && !this.finished) this.queueSnapshot();
    this.perf.tick(performance.now() - t0);
  }

  // ------------------------------------------------------------------ sockets
  attach(socketId: string, userId: string): void {
    this.sendSnapshot(socketId, userId, Date.now());
  }

  detach(socketId: string): void {
    this.sent.delete(socketId);
  }

  /** Presencia de un usuario: si deja de tener sockets, se aplica la política de desconexión. */
  userPresence(userId: string, online: boolean): void {
    const a = actorOfUser(this.world, userId);
    if (!a || this.finished) return;
    const ev = setConnected(this.world, a.id, online);
    if (ev.length) {
      this.handle(ev);
      this.broadcast(Date.now(), true);
    }
  }

  snapshot(userId: string | null): MatchSnapshot {
    return snapshotFor(this.world, this.id, userId, Date.now(), this.eligible());
  }

  private sendSnapshot(socketId: string, userId: string, now: number) {
    const snap = snapshotFor(this.world, this.id, userId, now, this.eligible());
    this.deps.io.emitToSocket(socketId, 'match:snapshot', snap);
    this.sent.set(socketId, {
      actors: new Map(snap.actors.map((a) => [a.id, JSON.stringify(a)])),
      header: JSON.stringify(this.header(this.eligible())),
      clockAt: now,
    });
  }

  private header(eligible: string[]) {
    const w = this.world;
    return { phase: w.phase, phaseEndsAt: w.phaseEndsAt, paused: pauseDTO(w, eligible), vote: voteDTO(w, eligible), winnerId: w.winnerId };
  }

  /** Fotograma por destinatario con solo lo que ha cambiado desde lo último que recibió. */
  private broadcast(now: number, force = false) {
    const w = this.world;
    const eligible = this.eligible();
    const header = this.header(eligible);
    const headerJson = JSON.stringify(header);
    const views = new Map<string, ActorView[]>();
    for (const [socketId, userId] of this.host.sockets()) {
      const st = this.sent.get(socketId);
      if (!st) {
        this.sendSnapshot(socketId, userId, now);
        continue;
      }
      let actors = views.get(userId);
      if (!actors) views.set(userId, (actors = computeView(w, userId).actors));
      const changed: ActorView[] = [];
      let bytes = 0;
      for (const a of actors) {
        const j = JSON.stringify(a);
        if (st.actors.get(a.id) !== j) {
          changed.push(a);
          st.actors.set(a.id, j);
          bytes += j.length + 1;
        }
      }
      const clockDue = now - st.clockAt >= 2000;
      if (!force && !changed.length && st.header === headerJson && !clockDue) continue;
      st.header = headerJson;
      st.clockAt = now;
      this.perf.frames++;
      this.perf.bytes += headerJson.length + bytes + 120;
      this.deps.io.emitToSocket(socketId, 'match:frame', {
        matchId: this.id,
        ...header,
        clock: { t: w.t, now, running: !w.paused && w.phase !== 'terminada' },
        actors: changed,
        gone: [],
      });
    }
  }

  // ------------------------------------------------------------------ eventos
  private name(actorId: string): string {
    return actorById(this.world, actorId)?.name ?? 'Alguien';
  }

  private text(e: WorldEvent): string | null {
    switch (e.type) {
      case 'fase':
        if (e.phase === 'cuenta_atras') return 'Cuenta atrás: todos en el anillo del Obelisco.';
        if (e.phase === 'en_curso') return '¡Que empiecen los Juegos!';
        return null;
      case 'eliminado':
        return e.cause === 'abandono' ? `${this.name(e.actorId)} abandona la arena. Puesto ${e.place}.` : `${this.name(e.actorId)} queda fuera por desconexión. Puesto ${e.place}.`;
      case 'fin':
        return e.winnerId ? `${this.name(e.winnerId)} gana los Juegos de la Ceniza.` : 'La partida termina sin ganador.';
      case 'pausa':
        return e.reason === 'reinicio' ? 'La partida se ha recuperado tras una interrupción del servidor: sigue en pausa hasta que todos pulséis «Listo».' : 'Partida en pausa por votación.';
      case 'reanudada':
        return 'Se reanuda la partida.';
      case 'votacion':
        if (e.result === 'abierta') return `${e.byName} propone una pausa.`;
        if (e.result === 'rechazada') return 'Se rechaza la pausa.';
        if (e.result === 'caducada') return 'La votación de pausa ha caducado.';
        return null;
      case 'conexion':
        return e.connected ? `${this.name(e.actorId)} ha vuelto.` : `${this.name(e.actorId)} se ha desconectado: ${POLICY_TEXT[this.world.rules.disconnectPolicy]}.`;
      case 'descubre': {
        const poi = this.world.map.pois.find((p) => p.id === e.region);
        return poi ? `Has llegado a ${poi.name}.` : null;
      }
      case 'anochece':
        return 'Cae la noche: se ve menos y es más fácil esconderse.';
      case 'amanece':
        return 'Amanece en la arena.';
    }
  }

  private record(ev: WorldEvent[]) {
    for (const e of ev) this.pending.push({ tick: this.world.tick, t: this.world.t, type: e.type, payload: { ...e } as Record<string, unknown> });
  }

  private handle(ev: WorldEvent[]) {
    this.record(ev);
    const now = Date.now();
    for (const e of ev) {
      const text = this.text(e);
      if (text) {
        const dto: MatchEventDTO = { kind: e.type, text, at: now };
        // Descubrir una región es privado: contárselo a todos revelaría dónde está con niebla.
        const only = e.type === 'descubre' ? actorById(this.world, e.actorId)?.userId : undefined;
        for (const [socketId, userId] of this.host.sockets()) {
          if (e.type === 'descubre' && userId !== only) continue;
          this.deps.io.emitToSocket(socketId, 'match:event', dto);
        }
      }
      if (e.type === 'fase' && e.phase !== 'terminada') this.queueSnapshot();
      if (e.type === 'fin') void this.finish();
    }
  }

  private flushEvents() {
    if (!this.pending.length) return;
    const rows = this.pending.splice(0);
    void this.persist.run(() => this.deps.repo.addEvents(this.id, rows)).catch((e) => this.deps.log.error({ err: e }, 'no se pudieron guardar los eventos de la partida'));
  }

  private queueSnapshot() {
    this.lastSnapshotAt = Date.now();
    const json = serializeWorld(this.world);
    const phase = this.world.phase;
    void this.persist.run(() => this.deps.repo.saveSnapshot(this.id, phase, json)).catch((e) => this.deps.log.error({ err: e }, 'no se pudo guardar la instantánea de la partida'));
  }

  private async finish() {
    if (this.finishing) return;
    this.finishing = true;
    this.broadcast(Date.now(), true);
    this.stop();
    this.flushEvents();
    const w = this.world;
    const results = w.actors.map((a) => ({ participantId: a.id, place: a.place, cause: a.cause, eliminatedAtMs: a.eliminatedAt }));
    try {
      await this.persist.run(() => this.deps.repo.finish(this.id, serializeWorld(w), w.winnerId, results));
      await this.host.onFinished(w.winnerId);
    } catch (e) {
      this.deps.log.error({ err: e }, 'no se pudo cerrar la partida');
    }
  }

  // ------------------------------------------------------------------ intenciones
  private guard<T>(fn: () => T): T {
    try {
      this.lastActivity = Date.now();
      return fn();
    } catch (e) {
      if (e instanceof IntentError) throw invalidState(e.message);
      if (e instanceof AppError) throw e;
      throw e;
    }
  }

  private actorFor(userId: string) {
    const a = actorOfUser(this.world, userId);
    if (!a) throw invalidState('No participas en esta partida');
    return a;
  }

  private after(ev: WorldEvent[] = []) {
    if (ev.length) this.handle(ev);
    // Respuesta inmediata solo a quien le cambia algo (el que da la orden y quien lo ve). Forzar un
    // fotograma a todos multiplicaba el tráfico por el número de jugadores (prueba de carga).
    this.broadcast(Date.now());
  }

  move(userId: string, x: number, y: number): void {
    this.guard(() => moveIntent(this.world, this.actorFor(userId).id, { x, y }));
    this.after();
  }

  stopMoving(userId: string): void {
    this.guard(() => stopIntent(this.world, this.actorFor(userId).id));
    this.after();
  }

  pause(userId: string): void {
    const a = this.actorFor(userId);
    const ev = this.guard(() => proposePause(this.world, userId, a.name, this.eligible(), Date.now()));
    this.after(ev);
  }

  vote(userId: string, yes: boolean): void {
    const ev = this.guard(() => castVote(this.world, userId, yes, this.eligible(), Date.now()));
    this.after(ev);
  }

  resume(userId: string, ready: boolean): void {
    this.guard(() => setResumeReady(this.world, userId, ready, this.eligible(), Date.now()));
    this.after();
  }

  forfeit(userId: string): void {
    const a = this.actorFor(userId);
    if (!a.alive) throw invalidState('Ya estás fuera de la partida');
    if (this.finished) throw invalidState('La partida ha terminado');
    this.after(eliminate(this.world, a.id, 'abandono'));
  }
}
