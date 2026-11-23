import { EventEmitter } from 'node:events';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from './config';
import { createDb, type DB } from './db/client';
import { AuthService } from './modules/auth/service';
import { PhotoService } from './modules/photos/service';
import { TemplateService } from './modules/characters/service';
import { RoomRepository } from './modules/rooms/repository';
import { RoomManager } from './modules/rooms/manager';
import { ChatService } from './modules/chat/service';
import { makeRoomIO, type AppServer } from './realtime/io';

interface AppEvents {
  'session:revoked': [{ sessionIds: string[] }];
  'user:sessionsRevoked': [{ userId: string }];
}

/** Contenedor de dependencias: cada módulo recibe solo lo que necesita. */
export interface AppContext {
  config: AppConfig;
  db: DB;
  pool: pg.Pool;
  log: FastifyBaseLogger;
  events: EventEmitter<AppEvents>;
  auth: AuthService;
  photos: PhotoService;
  templates: TemplateService;
  rooms: RoomRepository;
  chat: ChatService;
  roomManager: RoomManager;
  io: AppServer | null;
}

export function createContext(config: AppConfig, log: FastifyBaseLogger): AppContext {
  const { pool, db } = createDb(config.DATABASE_URL);
  const photos = new PhotoService(db, config);
  const templates = new TemplateService(db, config, photos);
  const rooms = new RoomRepository(db);
  const chat = new ChatService(db);
  const ctx = {
    config,
    db,
    pool,
    log,
    events: new EventEmitter<AppEvents>(),
    auth: new AuthService(db, config),
    photos,
    templates,
    rooms,
    chat,
    io: null,
  } as Omit<AppContext, 'roomManager'> as AppContext;
  ctx.roomManager = new RoomManager({ repo: rooms, templates, photos, chat, io: makeRoomIO(() => ctx.io), log });
  return ctx;
}
