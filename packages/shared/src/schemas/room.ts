import { z } from 'zod';
import { DIFFICULTY_KEYS } from '../game/bots.js';
import { cleanText } from './character.js';

/** Configuración de sala (GDD §15). Base sin valores por defecto para poder parchear. */
export const RoomConfigBaseSchema = z.object({
  maxParticipants: z.number().int().min(2).max(24),
  pace: z.enum(['rapida', 'estandar', 'larga', 'ilimitada']),
  zone: z.enum(['desactivada', 'lenta', 'normal', 'rapida']),
  visibility: z.enum(['visible', 'niebla']),
  eventIntensity: z.enum(['baja', 'media', 'alta', 'caos']),
  mapSize: z.enum(['pequeno', 'mediano', 'grande']),
  attributePoints: z.union([z.literal(24), z.literal(28), z.literal(32)]),
  startingKit: z.enum(['ninguno', 'basico']),
  botsWhoCanAdd: z.enum(['todos', 'anfitrion']),
  botsMaxTotal: z.number().int().min(0).max(23),
  botsMaxPerUser: z.number().int().min(1).max(23),
  botsDefaultDifficulty: z.enum(DIFFICULTY_KEYS),
  humanPriority: z.boolean(),
  allianceMaxSize: z.number().int().min(2).max(6),
  matchChat: z.enum(['desactivado', 'alianza', 'todos']),
  disconnectPolicy: z.enum(['proteger', 'piloto', 'eliminar']),
  disconnectGraceMin: z.number().int().min(1).max(60),
  autoStart: z.boolean(),
  pauseVote: z.enum(['mayoria', 'unanimidad']),
  districtVictory: z.boolean(),
  seed: z.string().transform(cleanText).pipe(z.string().max(32)),
});
export type RoomConfig = z.infer<typeof RoomConfigBaseSchema>;

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  maxParticipants: 12,
  pace: 'estandar',
  zone: 'normal',
  visibility: 'visible',
  eventIntensity: 'media',
  mapSize: 'mediano',
  attributePoints: 28,
  startingKit: 'ninguno',
  botsWhoCanAdd: 'todos',
  botsMaxTotal: 11,
  botsMaxPerUser: 6,
  botsDefaultDifficulty: 'normal',
  humanPriority: true,
  allianceMaxSize: 3,
  matchChat: 'alianza',
  disconnectPolicy: 'piloto',
  disconnectGraceMin: 5,
  autoStart: true,
  pauseVote: 'mayoria',
  districtVictory: false,
  seed: '',
};

export const RoomConfigPatchSchema = RoomConfigBaseSchema.partial();
export type RoomConfigPatch = z.infer<typeof RoomConfigPatchSchema>;

/** Aplica un parche sobre una configuración y valida el resultado completo. */
export function mergeRoomConfig(base: RoomConfig, patch: RoomConfigPatch | undefined): RoomConfig {
  return RoomConfigBaseSchema.parse({ ...base, ...(patch ?? {}) });
}

export const RoomNameSchema = z.string().transform(cleanText).pipe(z.string().min(3, 'El nombre de la sala necesita al menos 3 caracteres').max(40));

export const CreateRoomSchema = z.object({
  name: RoomNameSchema,
  config: RoomConfigPatchSchema.optional(),
});

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const RoomCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`), 'Código de sala no válido'));

export type RoomStatus = 'lobby' | 'starting' | 'in_game' | 'paused' | 'finished' | 'closed';

export interface RoomPreviewDTO {
  id: string;
  code: string;
  name: string;
  status: RoomStatus;
  host: { userId: string; displayName: string };
  humans: number;
  bots: number;
  maxParticipants: number;
  createdAt: string;
  isMember: boolean;
}

export const PACE_LABEL: Record<RoomConfig['pace'], string> = { rapida: 'Rápida', estandar: 'Estándar', larga: 'Larga', ilimitada: 'Ilimitada' };
export const ZONE_LABEL: Record<RoomConfig['zone'], string> = { desactivada: 'Desactivada', lenta: 'Lenta', normal: 'Normal', rapida: 'Rápida' };
export const EVENTS_LABEL: Record<RoomConfig['eventIntensity'], string> = { baja: 'Baja', media: 'Media', alta: 'Alta', caos: 'Caos' };
export const MAPSIZE_LABEL: Record<RoomConfig['mapSize'], string> = { pequeno: 'Pequeño (64²)', mediano: 'Mediano (96²)', grande: 'Grande (128²)' };
