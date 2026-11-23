import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { BotSettings, Character, Crop, RoomConfig } from '@ceniza/shared';
import type { WorldJSON } from '@ceniza/engine';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    usernameLower: text('username_lower').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').$type<'user' | 'admin'>().notNull().default('user'),
    defaultPhotoId: uuid('default_photo_id').references((): AnyPgColumn => photos.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastLoginAt: ts('last_login_at'),
    disabledAt: ts('disabled_at'),
  },
  (t) => [uniqueIndex('users_username_lower_uq').on(t.usernameLower)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // sha256(token) en hex: el token en claro nunca se guarda
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull().default(''),
    tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    crop: jsonb('crop').$type<Crop>().notNull(),
    version: integer('version').notNull().default(1),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('photos_user_idx').on(t.userId)],
);

export const characterTemplates = pgTable(
  'character_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    data: jsonb('data').$type<Character>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    lastUsedAt: ts('last_used_at'),
  },
  (t) => [index('templates_user_idx').on(t.userId)],
);

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    hostUserId: uuid('host_user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').$type<'lobby' | 'starting' | 'in_game' | 'paused' | 'finished' | 'closed'>().notNull().default('lobby'),
    config: jsonb('config').$type<RoomConfig>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    startedAt: ts('started_at'),
    finishedAt: ts('finished_at'),
  },
  (t) => [uniqueIndex('rooms_code_uq').on(t.code), index('rooms_status_idx').on(t.status)],
);

export const roomParticipants = pgTable(
  'room_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'human' | 'bot'>().notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    addedByUserId: uuid('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    character: jsonb('character').$type<Character | null>(),
    bot: jsonb('bot').$type<BotSettings | null>(),
    slotDistrict: smallint('slot_district'),
    slotGender: text('slot_gender').$type<'M' | 'F' | null>(),
    ready: boolean('ready').notNull().default(false),
    status: text('status').$type<'active' | 'left' | 'kicked'>().notNull().default('active'),
    lastEditedBy: text('last_edited_by'),
    joinedAt: ts('joined_at').notNull().defaultNow(),
    leftAt: ts('left_at'),
  },
  (t) => [
    index('rp_room_idx').on(t.roomId),
    index('rp_user_idx').on(t.userId),
    // Defensa en profundidad: además del control en memoria, la BD impide plazas duplicadas.
    uniqueIndex('rp_slot_uq').on(t.roomId, t.slotDistrict, t.slotGender).where(sql`status = 'active' and slot_district is not null`),
    uniqueIndex('rp_human_uq').on(t.roomId, t.userId).where(sql`kind = 'human' and status = 'active'`),
  ],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    channel: text('channel').$type<'global' | 'room'>().notNull(),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    system: boolean('system').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('chat_channel_room_idx').on(t.channel, t.roomId, t.id)],
);

// ─────────────────────────── partidas (fase 4) ───────────────────────────
export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    seed: text('seed').notNull(),
    status: text('status').$type<'presentacion' | 'cuenta_atras' | 'en_curso' | 'terminada'>().notNull(),
    config: jsonb('config').$type<RoomConfig>().notNull(),
    /** Instantánea completa del mundo (PRNG incluido) para recuperar la partida tras un reinicio. */
    snapshot: jsonb('snapshot').$type<WorldJSON>().notNull(),
    snapshotAt: ts('snapshot_at').notNull().defaultNow(),
    startedAt: ts('started_at').notNull().defaultNow(),
    endedAt: ts('ended_at'),
    winnerParticipantId: uuid('winner_participant_id'),
  },
  (t) => [
    index('matches_room_idx').on(t.roomId),
    // Una sola partida viva por sala.
    uniqueIndex('matches_active_uq').on(t.roomId).where(sql`status <> 'terminada'`),
  ],
);

export const matchParticipants = pgTable(
  'match_participants',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => roomParticipants.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'human' | 'bot'>().notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    character: jsonb('character').$type<Character>().notNull(),
    district: smallint('district').notNull(),
    gender: text('gender').$type<'M' | 'F'>().notNull(),
    place: smallint('place'),
    cause: text('cause').$type<'abandono' | 'desconexion' | null>(),
    eliminatedAtMs: integer('eliminated_at_ms'),
  },
  (t) => [uniqueIndex('mp_pk').on(t.matchId, t.participantId), index('mp_user_idx').on(t.userId)],
);

export const matchEvents = pgTable(
  'match_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    tick: integer('tick').notNull(),
    t: integer('t').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('me_match_idx').on(t.matchId, t.id)],
);
