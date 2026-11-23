import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { APP_VERSION } from '@ceniza/shared';
import { sql } from 'drizzle-orm';
import type { AppConfig } from './config';
import { createContext, type AppContext } from './context';
import { AppError, toApiError } from './lib/errors';
import { isAllowedOrigin } from './lib/util';
import { registerAuth } from './modules/auth/routes';
import { registerPhotoRoutes } from './modules/photos/routes';
import { registerCharacterRoutes } from './modules/characters/routes';
import { registerRoomRoutes } from './modules/rooms/routes';
import { createRealtime } from './realtime/io';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
}

export async function buildApp(config: AppConfig): Promise<BuiltApp> {
  const app = Fastify({
    trustProxy: config.trustProxy as unknown as boolean, // también admite número de saltos en tiempo de ejecución
    bodyLimit: 512 * 1024,
    logger: {
      level: config.isTest ? 'silent' : config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'req.headers.authorization'],
      ...(config.isProd || config.isTest ? {} : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }),
    },
    genReqId: () => Math.random().toString(36).slice(2, 10),
  });

  const ctx = createContext(config, app.log);

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: false, // HTTPS lo gestiona el proxy (Caddy o Cloudflare)
  });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute', allowList: config.isTest ? () => true : undefined });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1, fields: 8, fieldSize: 4096, parts: 10 } });

  // Defensa CSRF adicional a SameSite=Lax: los métodos que cambian estado deben venir de nuestro origen.
  app.addHook('onRequest', async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (!isAllowedOrigin(req.headers.origin, req.headers.host, config.PUBLIC_URL, config.extraOrigins)) {
      throw new AppError('forbidden', 'Origen no permitido');
    }
  });

  app.setErrorHandler((err, req, reply) => {
    const e = err as { code?: string; statusCode?: number; message: string };
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.toJSON() });
    if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.statusCode === 413) {
      return reply.code(413).send({ error: { code: 'payload_too_large', message: `La imagen supera el máximo de ${config.MAX_UPLOAD_MB} MB` } });
    }
    if (e.statusCode === 429) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Demasiadas peticiones. Espera un poco.' } });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: { code: 'bad_request', message: e.message } });
    }
    req.log.error({ err }, 'error no controlado');
    return reply.code(500).send({ error: toApiError(err) });
  });

  registerAuth(app, ctx);
  registerPhotoRoutes(app, ctx);
  registerCharacterRoutes(app, ctx);
  registerRoomRoutes(app, ctx);

  app.get('/api/health', async (_req, reply) => {
    let db = false;
    try {
      await ctx.db.execute(sql`select 1`);
      db = true;
    } catch {
      /* noop */
    }
    reply.code(db ? 200 : 503);
    return { ok: db, db, version: APP_VERSION, uptimeS: Math.round(process.uptime()), rooms: ctx.roomManager.loadedCount, sockets: ctx.io?.engine.clientsCount ?? 0 };
  });

  // Frontend compilado (opcional: también puede servirlo Caddy).
  if (config.SERVE_STATIC && existsSync(join(config.staticDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      wildcard: false,
      setHeaders: (reply, path) => {
        // Los archivos con hash son inmutables; index.html siempre se revalida.
        reply.header('Cache-Control', path.includes(join('assets', '')) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    if (!req.url.startsWith('/api/') && !req.url.startsWith('/socket.io') && req.method === 'GET' && config.SERVE_STATIC) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ error: { code: 'not_found', message: 'Ruta no encontrada' } });
  });

  ctx.io = createRealtime(app, ctx);
  ctx.roomManager.start();
  return { app, ctx };
}
