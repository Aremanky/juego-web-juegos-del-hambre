import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context';
import { badRequest, parseOrThrow } from '../../lib/errors';
import { requireUser } from '../auth/routes';

const IdParam = z.object({ id: z.uuid() });
const dataOf = (body: unknown) => {
  if (!body || typeof body !== 'object' || !('data' in body)) throw badRequest('Falta el personaje');
  return (body as { data: unknown }).data;
};

export function registerCharacterRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/characters', { preHandler: requireUser }, async (req) => ({ templates: await ctx.templates.list(req.user!.id) }));

  app.post('/api/characters', { preHandler: requireUser }, async (req, reply) => {
    const template = await ctx.templates.create(req.user!.id, dataOf(req.body));
    reply.code(201);
    return { template };
  });

  app.put('/api/characters/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    return { template: await ctx.templates.update(req.user!.id, id, dataOf(req.body)) };
  });

  app.post('/api/characters/:id/duplicate', { preHandler: requireUser }, async (req, reply) => {
    const { id } = parseOrThrow(IdParam, req.params);
    reply.code(201);
    return { template: await ctx.templates.duplicate(req.user!.id, id) };
  });

  app.delete('/api/characters/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    await ctx.templates.remove(req.user!.id, id);
    return { ok: true };
  });
}
