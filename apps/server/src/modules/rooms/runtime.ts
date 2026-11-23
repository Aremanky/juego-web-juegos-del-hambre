import {
  CharacterSchema,
  DISTRICT_COUNT,
  GENDER_LABEL,
  MAX_PER_GENDER,
  Rng,
  createBot,
  mergeRoomConfig,
  randomSeed,
  rebalanceBot,
  summarizeBuild,
  toPublicCharacter,
  type BotSettings,
  type Character,
  type ChatMessageDTO,
  type Gender,
  type LobbyParticipant,
  type LobbyState,
  type RoomConfig,
  type RoomConfigPatch,
  type RoomStatus,
  EPITHETS,
  PLAYER_COLORS,
  pickBotName,
} from '@ceniza/shared';
import { AppError, badRequest, conflict, forbidden, invalidState, limitReached, notFound, parseOrThrow } from '../../lib/errors';
import { SerialQueue } from '../../lib/util';
import type { SessionUser } from '../auth/service';
import type { TemplateService } from '../characters/service';
import { portraitPhotoIds, withPhotoVersions } from '../characters/service';
import type { PhotoService } from '../photos/service';
import type { ChatService } from '../chat/service';
import type { ParticipantRow, RoomRepository, RoomRow } from './repository';
import { MAP_SIZES, createWorld, serializeWorld, setConnected } from '@ceniza/engine';
import type { MatchRepository } from '../matches/repository';
import { MatchRuntime, type MatchDeps, type MatchHost, type MatchTimings } from '../matches/runtime';

/** Lo mínimo que el lobby necesita del transporte en tiempo real (desacoplado de Socket.IO para poder probarlo). */
export interface RoomIO {
  emitToSocket(socketId: string, event: string, payload: unknown): void;
  emitToChannel(channel: string, event: string, payload: unknown): void;
  leaveChannel(socketId: string, channel: string): void;
}

export interface RuntimeDeps {
  repo: RoomRepository;
  templates: TemplateService;
  photos: PhotoService;
  chat: ChatService;
  io: RoomIO;
  log: { warn(obj: unknown, msg?: string): void; error(obj: unknown, msg?: string): void };
  matches: MatchRepository;
  timings: MatchTimings;
  hostOfflineTransferMs?: number;
}

interface PState {
  id: string;
  kind: 'human' | 'bot';
  userId: string | null;
  username: string | null;
  displayName: string | null;
  addedByUserId: string | null;
  addedByName: string | null;
  character: Character | null;
  bot: BotSettings | null;
  slotDistrict: number | null;
  slotGender: Gender | null;
  ready: boolean;
  lastEditedBy: string | null;
  joinedAt: number;
}

export const roomChannel = (roomId: string) => `room:${roomId}`;

export class RoomRuntime {
  readonly id: string;
  readonly code: string;
  readonly createdAt: Date;
  name: string;
  hostUserId: string;
  status: RoomStatus;
  config: RoomConfig;
  version = 0;
  lastActivity = Date.now();

  private participants = new Map<string, PState>();
  private presence = new Map<string, Set<string>>(); // userId -> socketIds
  private socketUsers = new Map<string, string>(); // socketId -> userId
  private hostOfflineSince: number | null = null;
  private queue = new SerialQueue();
  private cids = new Map<string, Promise<unknown>>();
  private lastAddBotAt = new Map<string, number>();
  private broadcastPending = false;
  /** Partida en curso o terminada (para enseñar el resultado). */
  match: MatchRuntime | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private countdownEndsAt: number | null = null;

  private constructor(
    private readonly deps: RuntimeDeps,
    room: RoomRow,
  ) {
    this.id = room.id;
    this.code = room.code;
    this.name = room.name;
    this.hostUserId = room.hostUserId;
    this.status = room.status;
    this.config = mergeRoomConfig(room.config, undefined);
    this.createdAt = room.createdAt;
  }

  static async load(deps: RuntimeDeps, room: RoomRow): Promise<RoomRuntime> {
    const rt = new RoomRuntime(deps, room);
    const { rows, names } = await deps.repo.activeParticipants(room.id);
    for (const r of rows) rt.participants.set(r.id, rt.toPState(r, names));
    if (room.status === 'lobby' || room.status === 'starting') rt.hostOfflineSince = Date.now();
    if (room.status === 'in_game' || room.status === 'finished') {
      const row = room.status === 'in_game' ? await deps.matches.active(room.id) : await deps.matches.latest(room.id);
      if (row) {
        rt.match = MatchRuntime.restore(row, rt.matchHost(), rt.matchDeps());
        rt.match.start();
      } else if (room.status === 'in_game') {
        // Estado incoherente (sala en juego sin partida guardada): vuelve al lobby.
        rt.status = 'lobby';
        await deps.repo.updateRoom(room.id, { status: 'lobby' });
      }
    }
    return rt;
  }

  // ------------------------------------------------------------------ presencia
  get socketCount(): number {
    return this.socketUsers.size;
  }

  isOnline(userId: string): boolean {
    return (this.presence.get(userId)?.size ?? 0) > 0;
  }

  private attach(userId: string, socketId: string) {
    let set = this.presence.get(userId);
    if (!set) this.presence.set(userId, (set = new Set()));
    set.add(socketId);
    this.socketUsers.set(socketId, userId);
    if (userId === this.hostUserId) this.hostOfflineSince = null;
  }

  detachSocket(socketId: string): void {
    const userId = this.socketUsers.get(socketId);
    if (!userId) return;
    this.socketUsers.delete(socketId);
    const set = this.presence.get(userId);
    set?.delete(socketId);
    this.match?.detach(socketId);
    if (set && set.size === 0) {
      this.presence.delete(userId);
      if (userId === this.hostUserId) this.hostOfflineSince = Date.now();
      this.match?.userPresence(userId, false);
    }
    this.lastActivity = Date.now();
    this.scheduleBroadcast();
  }

  private detachUser(userId: string, notice?: { event: string; payload: unknown }) {
    for (const socketId of this.presence.get(userId) ?? []) {
      if (notice) this.deps.io.emitToSocket(socketId, notice.event, notice.payload);
      this.deps.io.leaveChannel(socketId, roomChannel(this.id));
      this.socketUsers.delete(socketId);
      this.match?.detach(socketId);
    }
    this.presence.delete(userId);
  }

  // ------------------------------------------------------------------ difusión
  private scheduleBroadcast() {
    if (this.broadcastPending) return;
    this.broadcastPending = true;
    setImmediate(() => {
      this.broadcastPending = false;
      this.version++;
      const cache = new Map<string, LobbyState>();
      for (const [socketId, userId] of this.socketUsers) {
        let st = cache.get(userId);
        if (!st) cache.set(userId, (st = this.stateFor(userId)));
        this.deps.io.emitToSocket(socketId, 'lobby:state', st);
      }
      this.evaluateAutoStart();
    });
  }

  private async system(text: string) {
    try {
      const msg: ChatMessageDTO = await this.deps.chat.system(this.id, text);
      this.deps.io.emitToChannel(roomChannel(this.id), 'chat:message', msg);
    } catch (e) {
      this.deps.log.warn({ err: e }, 'no se pudo guardar el mensaje de sistema');
    }
  }

  private notify(userId: string, kind: 'info' | 'success' | 'warning' | 'error', text: string) {
    for (const s of this.presence.get(userId) ?? []) this.deps.io.emitToSocket(s, 'notify', { kind, text });
  }

  // ------------------------------------------------------------------ utilidades
  private toPState(r: ParticipantRow, names: Map<string, { username: string; displayName: string }>): PState {
    const u = r.userId ? names.get(r.userId) : undefined;
    const a = r.addedByUserId ? names.get(r.addedByUserId) : undefined;
    return {
      id: r.id,
      kind: r.kind,
      userId: r.userId,
      username: u?.username ?? null,
      displayName: u?.displayName ?? null,
      addedByUserId: r.addedByUserId,
      addedByName: a?.displayName ?? null,
      character: r.character ?? null,
      bot: r.bot ?? null,
      slotDistrict: r.slotDistrict ?? null,
      slotGender: r.slotGender ?? null,
      ready: r.ready,
      lastEditedBy: r.lastEditedBy,
      joinedAt: r.joinedAt.getTime(),
    };
  }

  private humanOf(userId: string): PState | undefined {
    for (const p of this.participants.values()) if (p.kind === 'human' && p.userId === userId) return p;
    return undefined;
  }

  private requireHuman(userId: string): PState {
    const p = this.humanOf(userId);
    if (!p) throw forbidden('No participas en esta sala');
    return p;
  }

  private bot(botId: string): PState {
    const p = this.participants.get(botId);
    if (!p || p.kind !== 'bot') throw notFound('Bot no encontrado');
    return p;
  }

  private assertLobby() {
    if (this.status !== 'lobby') throw invalidState('La preparación ya ha terminado');
  }

  private assertHost(userId: string) {
    if (userId !== this.hostUserId) throw forbidden('Solo el anfitrión puede hacer esto');
  }

  private genderCount(g: Gender, exceptId: string | null): number {
    let n = 0;
    for (const p of this.participants.values()) if (p.id !== exceptId && p.slotGender === g) n++;
    return n;
  }

  private genderHasRoom(g: Gender, exceptId: string | null): boolean {
    return this.genderCount(g, exceptId) < MAX_PER_GENDER;
  }

  private slotFree(district: number, g: Gender, exceptId: string | null): boolean {
    for (const p of this.participants.values()) {
      if (p.id !== exceptId && p.slotDistrict === district && p.slotGender === g) return false;
    }
    return true;
  }

  private randomFreeDistrict(g: Gender, exceptId: string | null, rng: Rng): number | null {
    const free: number[] = [];
    for (let d = 1; d <= DISTRICT_COUNT; d++) if (this.slotFree(d, g, exceptId)) free.push(d);
    return free.length ? rng.pick(free) : null;
  }

  private nameTaken(name: string, exceptId: string | null): boolean {
    const n = name.trim().toLowerCase();
    for (const p of this.participants.values()) if (p.id !== exceptId && p.character?.name.trim().toLowerCase() === n) return true;
    return false;
  }

  private takenNames(): Set<string> {
    const s = new Set<string>();
    for (const p of this.participants.values()) if (p.character) s.add(p.character.name.toLowerCase());
    return s;
  }

  private bots(): PState[] {
    return [...this.participants.values()].filter((p) => p.kind === 'bot');
  }

  private humans(): PState[] {
    return [...this.participants.values()].filter((p) => p.kind === 'human');
  }

  private idempotent<T>(userId: string, cid: string | undefined, fn: () => Promise<T>): Promise<T> {
    if (!cid) return fn();
    const key = `${userId}:${cid}`;
    const existing = this.cids.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn();
    this.cids.set(key, p);
    if (this.cids.size > 500) this.cids.delete(this.cids.keys().next().value as string);
    p.catch(() => this.cids.delete(key));
    return p;
  }

  /** Coloca un personaje en una plaza respetando cupos de género y unicidad de plaza. */
  private placeCharacter(c: Character, p: PState | null, rng: Rng, keepCurrent = true): { district: number | null; gender: Gender } {
    const exceptId = p?.id ?? null;
    if (!this.genderHasRoom(c.gender, exceptId)) {
      throw conflict(`No quedan plazas de género ${GENDER_LABEL[c.gender].toLowerCase()} en esta sala`);
    }
    const sameGender = p?.slotGender === c.gender;
    if (c.district != null && this.slotFree(c.district, c.gender, exceptId)) return { district: c.district, gender: c.gender };
    if (keepCurrent && sameGender && p?.slotDistrict != null) return { district: p.slotDistrict, gender: c.gender };
    if (p?.kind === 'bot') return { district: this.randomFreeDistrict(c.gender, exceptId, rng), gender: c.gender };
    return { district: null, gender: c.gender };
  }

  // ------------------------------------------------------------------ estado filtrado por destinatario
  /** Lo que impide empezar aunque lo fuerce el anfitrión. */
  private forceReasons(): string[] {
    const reasons: string[] = [];
    if (this.status !== 'lobby') reasons.push('La partida ya ha empezado.');
    if (this.participants.size < 2) reasons.push('Hacen falta al menos 2 participantes (puedes añadir bots).');
    const noChar = this.humans().filter((h) => !h.character || !summarizeBuild(h.character, this.config.attributePoints).valid);
    if (noChar.length) reasons.push(`Sin personaje válido: ${noChar.map((p) => p.displayName ?? 'alguien').join(', ')}.`);
    return reasons;
  }

  /** Lo que impide el inicio automático: además, todos preparados y conectados. */
  private startReasons(): string[] {
    const reasons = this.forceReasons().filter((r) => r !== 'La partida ya ha empezado.');
    const label = (p: PState) => p.displayName ?? 'alguien';
    const humans = this.humans();
    const notReady = humans.filter((h) => !h.ready);
    if (notReady.length) reasons.push(`Falta que se preparen: ${notReady.map(label).join(', ')}.`);
    const offline = humans.filter((h) => h.userId && !this.isOnline(h.userId));
    if (offline.length) reasons.push(`Desconectados: ${offline.map(label).join(', ')}.`);
    return reasons;
  }

  stateFor(userId: string): LobbyState {
    const me = this.humanOf(userId) ?? null;
    const isHost = userId === this.hostUserId;
    const participants = [...this.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => this.participantDTO(p, userId));
    const reasons = this.startReasons();
    const forceReasons = this.forceReasons();

    const bots = this.bots();
    const mine = bots.filter((b) => b.addedByUserId === userId).length;
    const botReason = this.addBotBlockReason(userId);
    return {
      version: this.version,
      room: { id: this.id, code: this.code, name: this.name, status: this.status, hostUserId: this.hostUserId, config: this.config, createdAt: this.createdAt.toISOString() },
      participants,
      me: { userId, participantId: me?.id ?? null, isHost },
      start: { canStart: reasons.length === 0, reasons, countdownEndsAt: this.countdownEndsAt, canForce: isHost && forceReasons.length === 0, forceReasons },
      bots: { total: bots.length, mine, canAdd: botReason === null, reason: botReason },
    };
  }

  private participantDTO(p: PState, viewerId: string): LobbyParticipant {
    const isSelf = p.kind === 'human' && p.userId === viewerId;
    const full = isSelf || p.kind === 'bot';
    const summary = p.character ? summarizeBuild(p.character, this.config.attributePoints) : null;
    return {
      id: p.id,
      kind: p.kind,
      userId: p.userId,
      username: p.username,
      displayName: p.displayName,
      online: p.kind === 'bot' ? true : !!p.userId && this.isOnline(p.userId),
      ready: p.kind === 'bot' ? true : p.ready,
      isHost: p.kind === 'human' && p.userId === this.hostUserId,
      addedBy: p.kind === 'bot' && p.addedByUserId ? { userId: p.addedByUserId, displayName: p.addedByName ?? '—' } : null,
      slot: { district: p.slotDistrict, gender: p.slotGender },
      character: full ? p.character : null,
      publicCharacter: p.character ? toPublicCharacter({ ...p.character, district: p.slotDistrict }) : null,
      bot: p.bot,
      buildValid: !!summary?.valid,
      buildIssues: full && summary ? summary.issues.map((i) => i.message) : [],
      lastEditedBy: p.lastEditedBy,
      joinedAt: p.joinedAt,
    };
  }

  addBotBlockReason(userId: string): string | null {
    if (this.status !== 'lobby') return 'La preparación ha terminado.';
    const me = this.humanOf(userId);
    if (!me) return 'No participas en esta sala.';
    if (this.config.botsWhoCanAdd === 'anfitrion' && userId !== this.hostUserId) return 'El anfitrión ha restringido los bots.';
    const bots = this.bots();
    if (bots.length >= this.config.botsMaxTotal) return `Límite de bots de la sala alcanzado (${this.config.botsMaxTotal}).`;
    if (bots.filter((b) => b.addedByUserId === userId).length >= this.config.botsMaxPerUser) return `Ya has añadido el máximo de ${this.config.botsMaxPerUser} bots.`;
    if (this.participants.size >= this.config.maxParticipants) return 'La sala está llena.';
    if (!this.genderHasRoom('M', null) && !this.genderHasRoom('F', null)) return 'No quedan plazas libres.';
    return null;
  }

  // ------------------------------------------------------------------ comandos
  join(user: SessionUser, socketId: string): Promise<LobbyState> {
    return this.queue.run(async () => {
      if (this.status === 'closed') throw notFound('Esta sala ya no está disponible');
      let p = this.humanOf(user.id);
      if (!p) {
        if (this.status === 'finished') throw notFound('Esta sala ya no está disponible');
        const prev = await this.deps.repo.findHumanRow(this.id, user.id);
        if (prev?.status === 'kicked') throw forbidden('Te han expulsado de esta sala');
        if (this.status !== 'lobby') throw invalidState('La partida ya ha empezado');
        if (this.participants.size >= this.config.maxParticipants) await this.makeRoomForHuman(user);
        p = await this.admitHuman(user, prev);
        void this.system(`${user.displayName} ha entrado en la sala.`);
      } else {
        p.displayName = user.displayName;
      }
      this.attach(user.id, socketId);
      if (this.match) {
        this.match.attach(socketId, user.id);
        this.match.userPresence(user.id, true);
      }
      this.lastActivity = Date.now();
      this.scheduleBroadcast();
      return this.stateFor(user.id);
    });
  }

  private async makeRoomForHuman(user: SessionUser) {
    const victim = this.config.humanPriority ? this.bots().sort((a, b) => b.joinedAt - a.joinedAt)[0] : undefined;
    if (!victim) throw limitReached('La sala está llena');
    await this.deps.repo.updateParticipant(victim.id, { status: 'left', leftAt: new Date(), slotDistrict: null });
    this.participants.delete(victim.id);
    void this.system(`${user.displayName} ocupa la plaza del bot ${victim.character?.name ?? ''}.`);
  }

  private async admitHuman(user: SessionUser, prev: ParticipantRow | undefined): Promise<PState> {
    const rng = new Rng(randomSeed());
    let character: Character | null = null;
    // 1) si vuelve a esta sala, recupera su personaje; 2) si no, su última plantilla
    let candidate: Character | null = prev?.character ?? null;
    let templateId: string | null = null;
    if (!candidate) {
      const t = await this.deps.templates.latest(user.id).catch(() => null);
      if (t) {
        candidate = t.data;
        templateId = t.id;
      }
    }
    let slot: { district: number | null; gender: Gender | null } = { district: null, gender: null };
    if (candidate && this.genderHasRoom(candidate.gender, null)) {
      const placed = this.placeCharacter(candidate, null, rng);
      character = { ...candidate, district: placed.district };
      if (this.nameTaken(character.name, null)) character = { ...character, name: `${character.name.slice(0, 21)} II` };
      slot = placed;
      if (templateId) await this.deps.templates.touch(user.id, templateId);
    }
    const values = { status: 'active' as const, leftAt: null, ready: false, character, slotDistrict: slot.district, slotGender: slot.gender, joinedAt: new Date() };
    const row = prev ? await this.deps.repo.updateParticipant(prev.id, values) : await this.deps.repo.insertParticipant({ roomId: this.id, kind: 'human', userId: user.id, ...values });
    const st = this.toPState(row, new Map([[user.id, { username: user.username, displayName: user.displayName }]]));
    this.participants.set(st.id, st);
    return st;
  }

  leave(user: SessionUser): Promise<void> {
    return this.queue.run(async () => {
      const p = this.requireHuman(user.id);
      if (this.status === 'in_game' || this.status === 'finished') {
        if (this.match && !this.match.finished && this.match.world.actors.some((a) => a.id === p.id && a.alive)) this.match.forfeit(user.id);
        this.detachUser(user.id);
        this.match?.userPresence(user.id, false);
        this.scheduleBroadcast();
        return;
      }
      await this.deps.repo.updateParticipant(p.id, { status: 'left', leftAt: new Date(), ready: false, slotDistrict: null });
      this.participants.delete(p.id);
      this.detachUser(user.id);
      void this.system(`${user.displayName} ha abandonado la sala.`);
      await this.afterHumanRemoved(user.id);
      this.scheduleBroadcast();
    });
  }

  private async afterHumanRemoved(userId: string) {
    const humans = this.humans();
    if (humans.length === 0) {
      this.status = 'closed';
      await this.deps.repo.updateRoom(this.id, { status: 'closed' });
      this.deps.io.emitToChannel(roomChannel(this.id), 'room:closed', { roomId: this.id });
      return;
    }
    if (userId === this.hostUserId) {
      const next = humans.filter((h) => h.userId && this.isOnline(h.userId)).sort((a, b) => a.joinedAt - b.joinedAt)[0] ?? humans.sort((a, b) => a.joinedAt - b.joinedAt)[0]!;
      await this.setHost(next.userId!, `${next.displayName} es ahora el anfitrión.`);
    }
  }

  private async setHost(userId: string, message: string) {
    this.hostUserId = userId;
    this.hostOfflineSince = this.isOnline(userId) ? null : Date.now();
    await this.deps.repo.updateRoom(this.id, { hostUserId: userId });
    void this.system(message);
  }

  setCharacter(user: SessionUser, raw: unknown, cid?: string): Promise<void> {
    return this.idempotent(user.id, cid, () =>
      this.queue.run(async () => {
        this.assertLobby();
        const p = this.requireHuman(user.id);
        const c = await this.deps.templates.prepareOwnCharacter(user.id, raw, { requireValid: false });
        await this.storeHumanCharacter(p, c);
      }),
    );
  }

  applyTemplate(user: SessionUser, templateId: string, cid?: string): Promise<void> {
    return this.idempotent(user.id, cid, () =>
      this.queue.run(async () => {
        this.assertLobby();
        const p = this.requireHuman(user.id);
        const t = await this.deps.templates.get(user.id, templateId);
        await this.storeHumanCharacter(p, t.data);
        await this.deps.templates.touch(user.id, templateId);
      }),
    );
  }

  private async storeHumanCharacter(p: PState, c: Character) {
    if (this.nameTaken(c.name, p.id)) throw conflict(`Ya hay un participante llamado «${c.name}»`);
    const placed = this.placeCharacter(c, p, new Rng(randomSeed()));
    const character = { ...c, district: placed.district };
    await this.deps.repo.updateParticipant(p.id, { character, slotDistrict: placed.district, slotGender: placed.gender, ready: false });
    Object.assign(p, { character, slotDistrict: placed.district, slotGender: placed.gender, ready: false });
    this.scheduleBroadcast();
  }

  setSlot(user: SessionUser, district: number | null): Promise<void> {
    return this.queue.run(async () => {
      this.assertLobby();
      const p = this.requireHuman(user.id);
      if (!p.character || !p.slotGender) throw invalidState('Primero elige tu personaje');
      if (district != null && !this.slotFree(district, p.slotGender, p.id)) throw conflict('Esa plaza ya está ocupada');
      const character = { ...p.character, district };
      await this.deps.repo.updateParticipant(p.id, { slotDistrict: district, character });
      p.slotDistrict = district;
      p.character = character;
      this.scheduleBroadcast();
    });
  }

  setReady(user: SessionUser, ready: boolean): Promise<void> {
    return this.queue.run(async () => {
      this.assertLobby();
      const p = this.requireHuman(user.id);
      if (ready) {
        if (!p.character) throw invalidState('Elige un personaje antes de prepararte');
        const s = summarizeBuild(p.character, this.config.attributePoints);
        if (!s.valid) throw invalidState(`Tu personaje no cumple las reglas de la sala: ${s.issues.map((i) => i.message).join(' ')}`);
      }
      if (p.ready === ready) return;
      await this.deps.repo.updateParticipant(p.id, { ready });
      p.ready = ready;
      this.scheduleBroadcast();
    });
  }

  addBot(user: SessionUser, cid: string): Promise<{ botId: string }> {
    return this.idempotent(user.id, cid, () =>
      this.queue.run(async () => {
        const reason = this.addBotBlockReason(user.id);
        if (reason) throw limitReached(reason);
        const last = this.lastAddBotAt.get(user.id) ?? 0;
        if (Date.now() - last < 200) throw new AppError('rate_limited', 'Espera un instante antes de añadir otro bot');
        this.lastAddBotAt.set(user.id, Date.now());

        const rng = new Rng(randomSeed());
        const m = this.genderCount('M', null);
        const f = this.genderCount('F', null);
        const gender: Gender = !this.genderHasRoom('M', null) ? 'F' : !this.genderHasRoom('F', null) ? 'M' : m === f ? rng.pick(['M', 'F'] as const) : m < f ? 'M' : 'F';
        const district = this.randomFreeDistrict(gender, null, rng);
        const spec = createBot({ rng, budget: this.config.attributePoints, difficulty: this.config.botsDefaultDifficulty, gender, district, takenNames: this.takenNames() });
        const row = await this.deps.repo.insertParticipant({
          roomId: this.id,
          kind: 'bot',
          addedByUserId: user.id,
          character: spec.character,
          bot: spec.settings,
          slotDistrict: district,
          slotGender: gender,
          ready: true,
          lastEditedBy: user.displayName,
        });
        this.participants.set(row.id, this.toPState(row, new Map([[user.id, { username: user.username, displayName: user.displayName }]])));
        this.lastActivity = Date.now();
        this.scheduleBroadcast();
        void this.system(`${user.displayName} ha añadido al bot ${spec.character.name}.`);
        return { botId: row.id };
      }),
    );
  }

  private assertCanEditBots(userId: string) {
    this.requireHuman(userId);
    if (this.config.botsWhoCanAdd === 'anfitrion' && userId !== this.hostUserId) throw forbidden('El anfitrión ha restringido la gestión de bots');
  }

  updateBot(user: SessionUser, botId: string, rawCharacter: unknown | undefined, settings: BotSettings | undefined, cid?: string): Promise<void> {
    return this.idempotent(user.id, cid, () =>
      this.queue.run(async () => {
        this.assertLobby();
        this.assertCanEditBots(user.id);
        const b = this.bot(botId);
        let character = b.character!;
        if (rawCharacter !== undefined) {
          let c = parseOrThrow(CharacterSchema, rawCharacter);
          // Fotos nuevas: deben ser del editor. Las que ya tenía el bot se conservan.
          const current = new Set(portraitPhotoIds(b.character!));
          const ids = portraitPhotoIds(c);
          const fresh = ids.filter((id) => !current.has(id));
          const versions = new Map([...(await this.deps.photos.versions(ids.filter((id) => current.has(id)))), ...(await this.deps.photos.ownedVersions(user.id, fresh))]);
          c = withPhotoVersions(c, versions);
          const s = summarizeBuild(c, this.config.attributePoints);
          if (!s.valid) throw badRequest(s.issues.map((i) => i.message).join(' '));
          if (this.nameTaken(c.name, b.id)) throw conflict(`Ya hay un participante llamado «${c.name}»`);
          const placed = this.placeCharacter(c, b, new Rng(randomSeed()));
          character = { ...c, district: placed.district };
          b.slotDistrict = placed.district;
          b.slotGender = placed.gender;
        }
        const bot = settings ?? b.bot!;
        await this.deps.repo.updateParticipant(b.id, { character, bot, slotDistrict: b.slotDistrict, slotGender: b.slotGender, lastEditedBy: user.displayName });
        b.character = character;
        b.bot = bot;
        b.lastEditedBy = user.displayName;
        this.scheduleBroadcast();
      }),
    );
  }

  rerollBot(user: SessionUser, botId: string, what: 'attributes' | 'identity' | 'avatar' | 'all'): Promise<void> {
    return this.queue.run(async () => {
      this.assertLobby();
      this.assertCanEditBots(user.id);
      const b = this.bot(botId);
      const rng = new Rng(randomSeed());
      let c = b.character!;
      let settings = b.bot!;
      const taken = this.takenNames();
      taken.delete(c.name.toLowerCase());
      if (what === 'attributes') c = rebalanceBot(rng, c, settings, this.config.attributePoints);
      if (what === 'avatar') c = { ...c, portrait: { kind: 'generated', seed: randomSeed() } };
      if (what === 'identity') {
        c = { ...c, name: pickBotName(rng, c.gender, taken), epithet: rng.chance(0.6) ? rng.pick(EPITHETS)[c.gender] : '', color: rng.pick(PLAYER_COLORS), portrait: { kind: 'generated', seed: randomSeed() } };
      }
      if (what === 'all') {
        const spec = createBot({ rng, budget: this.config.attributePoints, difficulty: settings.difficulty, gender: c.gender, district: b.slotDistrict, takenNames: taken });
        c = spec.character;
        settings = spec.settings;
      }
      await this.deps.repo.updateParticipant(b.id, { character: c, bot: settings, lastEditedBy: user.displayName });
      b.character = c;
      b.bot = settings;
      b.lastEditedBy = user.displayName;
      this.scheduleBroadcast();
    });
  }

  removeBot(user: SessionUser, botId: string): Promise<void> {
    return this.queue.run(async () => {
      this.assertLobby();
      const b = this.bot(botId);
      if (b.addedByUserId !== user.id && user.id !== this.hostUserId) throw forbidden('Solo quien lo añadió o el anfitrión pueden retirarlo');
      await this.deps.repo.updateParticipant(b.id, { status: 'left', leftAt: new Date(), slotDistrict: null });
      this.participants.delete(b.id);
      this.scheduleBroadcast();
      void this.system(`${user.displayName} ha retirado al bot ${b.character?.name ?? ''}.`);
    });
  }

  kick(user: SessionUser, participantId: string): Promise<void> {
    return this.queue.run(async () => {
      this.assertHost(user.id);
      const p = this.participants.get(participantId);
      if (!p) throw notFound('Participante no encontrado');
      if (p.kind === 'human' && p.userId === user.id) throw badRequest('No puedes expulsarte a ti mismo');
      await this.deps.repo.updateParticipant(p.id, { status: p.kind === 'human' ? 'kicked' : 'left', leftAt: new Date(), slotDistrict: null, ready: false });
      this.participants.delete(p.id);
      if (p.kind === 'human' && p.userId) {
        this.detachUser(p.userId, { event: 'room:kicked', payload: { roomId: this.id, code: this.code, reason: 'El anfitrión te ha expulsado de la sala' } });
        void this.system(`${p.displayName} ha sido expulsado.`);
      } else {
        void this.system(`El bot ${p.character?.name ?? ''} ha sido retirado por el anfitrión.`);
      }
      this.scheduleBroadcast();
    });
  }

  transferHost(user: SessionUser, targetUserId: string): Promise<void> {
    return this.queue.run(async () => {
      this.assertHost(user.id);
      const t = this.humanOf(targetUserId);
      if (!t) throw notFound('Ese jugador no está en la sala');
      await this.setHost(targetUserId, `${user.displayName} cede el puesto de anfitrión a ${t.displayName}.`);
      this.scheduleBroadcast();
    });
  }

  updateConfig(user: SessionUser, patch: RoomConfigPatch | undefined, name: string | undefined): Promise<void> {
    return this.queue.run(async () => {
      this.assertLobby();
      this.assertHost(user.id);
      const next = mergeRoomConfig(this.config, patch);
      if (next.maxParticipants < this.participants.size) throw badRequest(`Ya hay ${this.participants.size} participantes: no puedes bajar el máximo a ${next.maxParticipants}`);
      const budgetChanged = next.attributePoints !== this.config.attributePoints;
      await this.deps.repo.updateRoom(this.id, { config: next, ...(name ? { name } : {}) });
      this.config = next;
      if (name) this.name = name;
      // Bots que dejan de cumplir el presupuesto: se reequilibran solos.
      if (budgetChanged) {
        const rng = new Rng(randomSeed());
        for (const b of this.bots()) {
          if (summarizeBuild(b.character!, next.attributePoints).valid) continue;
          b.character = rebalanceBot(rng, b.character!, b.bot!, next.attributePoints);
          await this.deps.repo.updateParticipant(b.id, { character: b.character });
        }
      }
      await this.deps.repo.unreadyAll(this.id);
      for (const h of this.humans()) h.ready = false;
      void this.system(`${user.displayName} ha cambiado la configuración. Todos deben volver a prepararse.`);
      this.scheduleBroadcast();
    });
  }

  /** Mantenimiento periódico: traspaso de anfitrión si lleva demasiado tiempo desconectado. */
  tick(now = Date.now()): void {
    if (this.status !== 'lobby' || this.hostOfflineSince == null) return;
    if (now - this.hostOfflineSince < (this.deps.hostOfflineTransferMs ?? 90_000)) return;
    const candidate = this.humans()
      .filter((h) => h.userId && h.userId !== this.hostUserId && this.isOnline(h.userId))
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (!candidate) return;
    void this.queue
      .run(async () => {
        if (this.hostOfflineSince == null) return;
        await this.setHost(candidate.userId!, `El anfitrión no está conectado: ${candidate.displayName} pasa a ser el anfitrión.`);
        this.scheduleBroadcast();
        this.notify(candidate.userId!, 'info', 'Ahora eres el anfitrión de la sala.');
      })
      .catch((e) => this.deps.log.error({ err: e }, 'fallo en el traspaso de anfitrión'));
  }

  get counts() {
    const bots = this.bots().length;
    return { humans: this.participants.size - bots, bots };
  }

  // ------------------------------------------------------------------ inicio de partida
  private evaluateAutoStart() {
    if (this.status !== 'lobby') return;
    const ok = this.config.autoStart && this.startReasons().length === 0;
    if (ok && this.countdownEndsAt == null) {
      const ms = this.deps.timings.lobbyCountdownMs;
      this.countdownEndsAt = Date.now() + ms;
      this.countdownTimer = setTimeout(() => {
        void this.queue.run(() => this.countdownFired()).catch((e) => this.deps.log.error({ err: e }, 'no se pudo empezar la partida'));
      }, ms);
      this.countdownTimer.unref();
      void this.system(`Todos preparados: la partida empieza en ${Math.max(1, Math.round(ms / 1000))} s.`);
      this.scheduleBroadcast();
    } else if (!ok && this.countdownEndsAt != null) {
      this.cancelCountdown('Se cancela la cuenta atrás.');
    }
  }

  private cancelCountdown(message?: string) {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
    this.countdownEndsAt = null;
    if (message) void this.system(message);
    this.scheduleBroadcast();
  }

  private async countdownFired() {
    this.countdownTimer = null;
    if (this.status !== 'lobby' || this.countdownEndsAt == null) return;
    if (this.startReasons().length) return this.cancelCountdown('Se cancela la cuenta atrás.');
    this.countdownEndsAt = null;
    await this.createMatch();
  }

  /** El anfitrión empieza sin esperar a que todos se preparen (GDD §15). */
  forceStart(user: SessionUser): Promise<void> {
    return this.queue.run(async () => {
      this.assertLobby();
      this.assertHost(user.id);
      const reasons = this.forceReasons();
      if (reasons.length) throw invalidState(reasons.join(' '));
      if (this.countdownTimer) clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
      this.countdownEndsAt = null;
      await this.createMatch();
    });
  }

  private matchHost(): MatchHost {
    return {
      sockets: () => this.socketUsers.entries(),
      isOnline: (userId) => this.isOnline(userId),
      onFinished: async (winnerId) => {
        this.status = 'finished';
        await this.deps.repo.updateRoom(this.id, { status: 'finished', finishedAt: new Date() });
        const w = winnerId ? this.participants.get(winnerId) : undefined;
        void this.system(w?.character ? `${w.character.name} gana la partida.` : 'La partida ha terminado.');
        this.scheduleBroadcast();
      },
    };
  }

  private matchDeps(): MatchDeps {
    return { repo: this.deps.matches, io: this.deps.io, log: this.deps.log, timings: this.deps.timings };
  }

  /** Crea el mundo: plazas libres asignadas, anillo de salida y presentación. */
  private async createMatch(): Promise<void> {
    const rng = new Rng(randomSeed());
    const list = [...this.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    for (const p of list) {
      if (!p.character || !p.slotGender || p.slotDistrict != null) continue;
      const d = this.randomFreeDistrict(p.slotGender, p.id, rng);
      if (d == null) throw conflict('No quedan plazas libres en los distritos');
      p.slotDistrict = d;
      p.character = { ...p.character, district: d };
      await this.deps.repo.updateParticipant(p.id, { slotDistrict: d, character: p.character });
    }
    const players = list.filter((p) => p.character && p.slotGender && p.slotDistrict != null);
    const seed = this.config.seed || randomSeed();
    const t = this.deps.timings;
    const world = createWorld({
      seed,
      mapSize: MAP_SIZES[this.config.mapSize],
      actors: players.map((p) => ({ id: p.id, kind: p.kind, userId: p.userId, character: p.character!, district: p.slotDistrict!, gender: p.slotGender! })),
      rules: {
        visibility: this.config.visibility,
        pauseVote: this.config.pauseVote,
        disconnectPolicy: this.config.disconnectPolicy,
        disconnectGraceMs: this.config.disconnectGraceMin * 60_000,
        presentationMs: t.presentationMs,
        countdownMs: t.countdownMs,
      },
    });
    for (const a of world.actors) if (a.kind === 'human' && a.userId && !this.isOnline(a.userId)) setConnected(world, a.id, false);
    const row = await this.deps.matches.create(
      { roomId: this.id, seed, config: this.config, snapshot: serializeWorld(world), status: world.phase },
      players.map((p) => ({ participantId: p.id, kind: p.kind, userId: p.userId, character: p.character!, district: p.slotDistrict!, gender: p.slotGender! })),
    );
    this.status = 'in_game';
    await this.deps.repo.updateRoom(this.id, { status: 'in_game', startedAt: new Date() });
    this.match = new MatchRuntime(row.id, world, this.matchHost(), this.matchDeps());
    this.match.start();
    for (const [socketId, userId] of this.socketUsers) this.match.attach(socketId, userId);
    void this.system('¡Empieza la partida! Presentación de los participantes.');
    this.scheduleBroadcast();
  }

  // ------------------------------------------------------------------ intenciones de partida
  requireMatch(): MatchRuntime {
    if (!this.match) throw invalidState('Esta sala no tiene ninguna partida en marcha');
    this.lastActivity = Date.now();
    return this.match;
  }

  /** Para el bucle de la partida guardando su instantánea (cierre o descarga de memoria). */
  async dispose(): Promise<void> {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
    await this.match?.dispose();
  }
}
