import type { FastifyInstance } from 'fastify';
import { CreateRoomSchema, mergeRoomConfig, DEFAULT_ROOM_CONFIG, RoomCodeSchema, type RoomPreviewDTO } from '@ceniza/shared';
import { z } from 'zod';
import type { AppContext } from '../../context';
import { notFound, parseOrThrow } from '../../lib/errors';
import { requireUser } from '../auth/routes';

export function registerRoomRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/api/rooms', { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = parseOrThrow(CreateRoomSchema, req.body);
    const config = mergeRoomConfig(DEFAULT_ROOM_CONFIG, body.config);
    const room = await ctx.rooms.create(req.user!.id, body.name, config);
    reply.code(201);
    return { room: { id: room.id, code: room.code, name: room.name } };
  });

  app.get('/api/rooms/mine', { preHandler: requireUser }, async (req) => {
    const rows = await ctx.rooms.listForUser(req.user!.id);
    return {
      rooms: rows.map((r) => ({
        id: r.room.id,
        code: r.room.code,
        name: r.room.name,
        status: r.room.status,
        isHost: r.room.hostUserId === req.user!.id,
        humans: r.humans,
        bots: r.bots,
        maxParticipants: r.room.config.maxParticipants,
        updatedAt: r.room.updatedAt.toISOString(),
      })),
    };
  });

  app.get('/api/rooms/:code', { preHandler: requireUser }, async (req): Promise<{ room: RoomPreviewDTO }> => {
    const { code } = parseOrThrow(z.object({ code: RoomCodeSchema }), req.params);
    const room = await ctx.rooms.findByCode(code);
    if (!room || room.status === 'closed') throw notFound('No existe ninguna sala abierta con ese código');
    const live = ctx.roomManager.get(room.id);
    const counts = live ? live.counts : await ctx.rooms.counts(room.id);
    const hostId = live?.hostUserId ?? room.hostUserId;
    const names = await ctx.rooms.userNames([hostId]);
    const mine = await ctx.rooms.findHumanRow(room.id, req.user!.id);
    return {
      room: {
        id: room.id,
        code: room.code,
        name: live?.name ?? room.name,
        status: live?.status ?? room.status,
        host: { userId: hostId, displayName: names.get(hostId)?.displayName ?? '—' },
        humans: counts.humans,
        bots: counts.bots,
        maxParticipants: (live?.config ?? room.config).maxParticipants,
        createdAt: room.createdAt.toISOString(),
        isMember: mine?.status === 'active',
      },
    };
  });
}
