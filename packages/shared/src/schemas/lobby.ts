import { z } from 'zod';
import { CharacterSchema, type Character, type PublicCharacter } from './character.js';
import { RoomCodeSchema, RoomConfigPatchSchema, RoomNameSchema, type RoomConfig, type RoomStatus } from './room.js';
import { DIFFICULTY_KEYS, PERSONALITY_KEYS, PLAYSTYLE_KEYS } from '../game/bots.js';
import { DISTRICT_COUNT } from '../game/districts.js';
import type { Ack, ChatMessageDTO } from './api.js';
import type { Gender } from '../game/districts.js';

export const BotSettingsSchema = z.object({
  difficulty: z.enum(DIFFICULTY_KEYS),
  personality: z.enum(PERSONALITY_KEYS),
  playstyle: z.enum(PLAYSTYLE_KEYS),
});
export type BotSettings = z.infer<typeof BotSettingsSchema>;

const cid = z.string().min(8).max(64).optional();

// ---------- Cargas de eventos cliente → servidor ----------
export const JoinRoomPayload = z.object({ code: RoomCodeSchema });
export const SetCharacterPayload = z.object({ character: CharacterSchema, cid });
export const ApplyTemplatePayload = z.object({ templateId: z.uuid(), cid });
export const SetSlotPayload = z.object({ district: z.number().int().min(1).max(DISTRICT_COUNT).nullable() });
export const SetReadyPayload = z.object({ ready: z.boolean() });
export const AddBotPayload = z.object({ cid: z.string().min(8).max(64) });
export const UpdateBotPayload = z.object({
  botId: z.uuid(),
  character: CharacterSchema.optional(),
  settings: BotSettingsSchema.optional(),
  cid,
});
export const RerollBotPayload = z.object({ botId: z.uuid(), what: z.enum(['attributes', 'identity', 'avatar', 'all']) });
export const RemoveBotPayload = z.object({ botId: z.uuid() });
export const KickPayload = z.object({ participantId: z.uuid() });
export const UpdateConfigPayload = z.object({ patch: RoomConfigPatchSchema.optional(), name: RoomNameSchema.optional() });
export const TransferHostPayload = z.object({ userId: z.uuid() });

// ---------- Estado del lobby (servidor → cliente, filtrado por destinatario) ----------
export interface LobbyParticipant {
  id: string;
  kind: 'human' | 'bot';
  userId: string | null;
  username: string | null;
  displayName: string | null;
  online: boolean;
  ready: boolean;
  isHost: boolean;
  addedBy: { userId: string; displayName: string } | null;
  slot: { district: number | null; gender: Gender | null };
  /** Personaje completo: solo para uno mismo y para los bots. */
  character: Character | null;
  /** Lo que ven los demás de un humano. */
  publicCharacter: PublicCharacter | null;
  bot: BotSettings | null;
  /** El personaje cumple las reglas de la sala (presupuesto, requisitos). */
  buildValid: boolean;
  buildIssues: string[];
  lastEditedBy: string | null;
  joinedAt: number;
}

export interface LobbyState {
  version: number;
  room: {
    id: string;
    code: string;
    name: string;
    status: RoomStatus;
    hostUserId: string;
    config: RoomConfig;
    createdAt: string;
  };
  participants: LobbyParticipant[];
  me: { userId: string; participantId: string | null; isHost: boolean };
  start: { canStart: boolean; reasons: string[]; countdownEndsAt: number | null };
  bots: { total: number; mine: number; canAdd: boolean; reason: string | null };
}

// ---------- Tipos de eventos para Socket.IO ----------
type Cb<T = undefined> = (res: Ack<T>) => void;

export interface ClientToServerEvents {
  'room:join': (p: z.input<typeof JoinRoomPayload>, cb: Cb<LobbyState>) => void;
  'room:leave': (p: Record<string, never>, cb: Cb) => void;
  'lobby:setCharacter': (p: z.input<typeof SetCharacterPayload>, cb: Cb) => void;
  'lobby:applyTemplate': (p: z.input<typeof ApplyTemplatePayload>, cb: Cb) => void;
  'lobby:setSlot': (p: z.input<typeof SetSlotPayload>, cb: Cb) => void;
  'lobby:setReady': (p: z.input<typeof SetReadyPayload>, cb: Cb) => void;
  'lobby:addBot': (p: z.input<typeof AddBotPayload>, cb: Cb<{ botId: string }>) => void;
  'lobby:updateBot': (p: z.input<typeof UpdateBotPayload>, cb: Cb) => void;
  'lobby:rerollBot': (p: z.input<typeof RerollBotPayload>, cb: Cb) => void;
  'lobby:removeBot': (p: z.input<typeof RemoveBotPayload>, cb: Cb) => void;
  'lobby:kick': (p: z.input<typeof KickPayload>, cb: Cb) => void;
  'lobby:updateConfig': (p: z.input<typeof UpdateConfigPayload>, cb: Cb) => void;
  'lobby:transferHost': (p: z.input<typeof TransferHostPayload>, cb: Cb) => void;
  'chat:send': (p: { channel: 'global' | 'room'; body: string }, cb: Cb) => void;
  'chat:history': (p: { channel: 'global' | 'room' }, cb: Cb<ChatMessageDTO[]>) => void;
}

export interface ServerToClientEvents {
  'lobby:state': (s: LobbyState) => void;
  'room:kicked': (p: { roomId: string; code: string; reason: string }) => void;
  'room:closed': (p: { roomId: string }) => void;
  'chat:message': (m: ChatMessageDTO) => void;
  notify: (p: { kind: 'info' | 'success' | 'warning' | 'error'; text: string }) => void;
}
