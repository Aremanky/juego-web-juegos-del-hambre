import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import fastifyCookie from '@fastify/cookie';
import { z, type ZodType } from 'zod';
import {
  AddBotPayload,
  ApplyTemplatePayload,
  ChatSendSchema,
  JoinRoomPayload,
  KickPayload,
  RemoveBotPayload,
  RerollBotPayload,
  SetCharacterPayload,
  SetReadyPayload,
  SetSlotPayload,
  TransferHostPayload,
  UpdateBotPayload,
  UpdateConfigPayload,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@ceniza/shared';
import type { AppContext } from '../context';
import { AppError, invalidState, notFound, toApiError, zodMessage } from '../lib/errors';
import { TokenBucket, isAllowedOrigin } from '../lib/util';
import { SESSION_COOKIE } from '../modules/auth/routes';
import type { SessionUser } from '../modules/auth/service';
import { roomChannel, type RoomIO, type RoomRuntime } from '../modules/rooms/runtime';

interface SocketData {
  user: SessionUser;
  sessionId: string;
  token: string;
  roomId: string | null;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Adaptador para que el runtime de salas emita sin depender de Socket.IO. */
export function makeRoomIO(getIo: () => AppServer | null): RoomIO {
  return {
    emitToSocket: (socketId, event, payload) => getIo()?.to(socketId).emit(event as 'notify', payload as never),
    emitToChannel: (channel, event, payload) => getIo()?.to(channel).emit(event as 'notify', payload as never),
    leaveChannel: (socketId, channel) => getIo()?.in(socketId).socketsLeave(channel),
  };
}

export function createRealtime(app: FastifyInstance, ctx: AppContext): AppServer {
  const io: AppServer = new Server(app.server, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 256 * 1024,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    // Protección frente a secuestro de WebSocket entre sitios
    allowRequest: (req, cb) => cb(null, isAllowedOrigin(req.headers.origin, req.headers.host, ctx.config.PUBLIC_URL, ctx.config.extraOrigins)),
  });

  io.use(async (socket, next) => {
    try {
      const token = fastifyCookie.parse(socket.handshake.headers.cookie ?? '')[SESSION_COOKIE];
      const res = await ctx.auth.resolve(token);
      if (!res || !token) return next(new Error('unauthorized'));
      socket.data = { user: res.user, sessionId: res.sessionId, token, roomId: null };
      next();
    } catch (e) {
      ctx.log.error({ err: e }, 'fallo autenticando socket');
      next(new Error('internal'));
    }
  });

  io.on('connection', (socket: AppSocket) => {
    const { user, sessionId } = socket.data;
    void socket.join(['global', `user:${user.id}`, `session:${sessionId}`]);
    const bucket = new TokenBucket(25, 10);
    const chatBucket = new TokenBucket(5, 1.2);

    /** Envoltorio común: límite de frecuencia, validación zod, ack homogéneo y registro de errores. */
    const on = <S extends ZodType, R>(event: keyof ClientToServerEvents, schema: S, fn: (payload: z.output<S>) => Promise<R>) => {
      (socket as unknown as { on(ev: string, fn: (raw: unknown, cb?: (res: Ack<R>) => void) => void): void }).on(event, async (raw, cb) => {
        const reply = typeof cb === 'function' ? cb : () => undefined;
        if (!bucket.take()) return reply({ ok: false, error: { code: 'rate_limited', message: 'Demasiadas acciones seguidas. Espera un momento.' } });
        const parsed = schema.safeParse(raw ?? {});
        if (!parsed.success) return reply({ ok: false, error: { code: 'bad_request', message: zodMessage(parsed.error) } });
        try {
          const data = await fn(parsed.data);
          reply({ ok: true, data: data as R });
        } catch (e) {
          if (!(e instanceof AppError)) ctx.log.error({ err: e, event }, 'error en evento de socket');
          reply({ ok: false, error: toApiError(e) });
        }
      });
    };

    /** Usuario fresco desde la sesión (detecta sesiones revocadas y cambios de nombre). */
    const freshUser = async (): Promise<SessionUser> => {
      const res = await ctx.auth.resolve(socket.data.token);
      if (!res) {
        socket.disconnect(true);
        throw new AppError('unauthorized', 'Tu sesión ha caducado');
      }
      socket.data.user = res.user;
      return res.user;
    };

    const room = (): RoomRuntime => {
      const rt = ctx.roomManager.get(socket.data.roomId);
      if (!rt) throw invalidState('No estás en ninguna sala');
      return rt;
    };

    on('room:join', JoinRoomPayload, async ({ code }) => {
      const u = await freshUser();
      const rt = await ctx.roomManager.getByCode(code);
      if (!rt) throw notFound('No existe ninguna sala con ese código');
      if (socket.data.roomId && socket.data.roomId !== rt.id) {
        ctx.roomManager.get(socket.data.roomId)?.detachSocket(socket.id);
        void socket.leave(roomChannel(socket.data.roomId));
      }
      const state = await rt.join(u, socket.id);
      socket.data.roomId = rt.id;
      void socket.join(roomChannel(rt.id));
      return state;
    });

    on('room:leave', z.object({}), async () => {
      const rt = room();
      await rt.leave(socket.data.user);
      void socket.leave(roomChannel(rt.id));
      socket.data.roomId = null;
      return undefined;
    });

    on('lobby:setCharacter', SetCharacterPayload, async (p) => room().setCharacter(socket.data.user, p.character, p.cid));
    on('lobby:applyTemplate', ApplyTemplatePayload, async (p) => room().applyTemplate(socket.data.user, p.templateId, p.cid));
    on('lobby:setSlot', SetSlotPayload, async (p) => room().setSlot(socket.data.user, p.district));
    on('lobby:setReady', SetReadyPayload, async (p) => room().setReady(socket.data.user, p.ready));
    on('lobby:addBot', AddBotPayload, async (p) => room().addBot(socket.data.user, p.cid));
    on('lobby:updateBot', UpdateBotPayload, async (p) => room().updateBot(socket.data.user, p.botId, p.character, p.settings, p.cid));
    on('lobby:rerollBot', RerollBotPayload, async (p) => room().rerollBot(socket.data.user, p.botId, p.what));
    on('lobby:removeBot', RemoveBotPayload, async (p) => room().removeBot(socket.data.user, p.botId));
    on('lobby:kick', KickPayload, async (p) => room().kick(socket.data.user, p.participantId));
    on('lobby:updateConfig', UpdateConfigPayload, async (p) => room().updateConfig(socket.data.user, p.patch, p.name));
    on('lobby:transferHost', TransferHostPayload, async (p) => room().transferHost(socket.data.user, p.userId));

    on('chat:send', ChatSendSchema, async ({ channel, body }) => {
      if (!chatBucket.take()) throw new AppError('rate_limited', 'Vas muy rápido. Espera un segundo.');
      const u = socket.data.user;
      if (channel === 'room') {
        const rt = room();
        const msg = await ctx.chat.post('room', rt.id, u, body);
        io.to(roomChannel(rt.id)).emit('chat:message', msg);
      } else {
        const msg = await ctx.chat.post('global', null, u, body);
        io.to('global').emit('chat:message', msg);
      }
      return undefined;
    });

    on('chat:history', z.object({ channel: z.enum(['global', 'room']) }), async ({ channel }) => {
      if (channel === 'room') return ctx.chat.history('room', room().id);
      return ctx.chat.history('global', null);
    });

    socket.on('disconnect', () => {
      ctx.roomManager.get(socket.data.roomId)?.detachSocket(socket.id);
    });
  });

  ctx.events.on('session:revoked', ({ sessionIds }) => {
    for (const id of sessionIds) io.in(`session:${id}`).disconnectSockets(true);
  });
  ctx.events.on('user:sessionsRevoked', ({ userId }) => io.in(`user:${userId}`).disconnectSockets(true));

  return io;
}
