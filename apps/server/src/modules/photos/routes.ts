import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CropSchema, PHOTO_VARIANTS, PhotoTagsSchema, PhotoUpdateSchema, cleanText } from '@ceniza/shared';
import type { AppContext } from '../../context';
import { badRequest, notFound, parseOrThrow } from '../../lib/errors';
import { requireUser } from '../auth/routes';

const IdParam = z.object({ id: z.uuid() });
const FileParam = z.object({ id: z.uuid(), variant: z.enum(PHOTO_VARIANTS) });

function parseJsonField<T>(raw: string | undefined, schema: z.ZodType<T>, name: string): T | undefined {
  if (raw === undefined || raw === '') return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw badRequest(`Campo ${name} no es JSON válido`);
  }
  return parseOrThrow(schema, value);
}

export function registerPhotoRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/photos', { preHandler: requireUser }, async (req) => ({ photos: await ctx.photos.list(req.user!.id) }));

  app.post('/api/photos', { preHandler: requireUser, config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req, reply) => {
    if (!req.isMultipart()) throw badRequest('Se esperaba multipart/form-data');
    let file: Buffer | null = null;
    const fields: Record<string, string> = {};
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (file) throw badRequest('Solo se admite una imagen por subida');
        file = await part.toBuffer();
      } else {
        fields[part.fieldname] = String(part.value ?? '');
      }
    }
    if (!file || file.length === 0) throw badRequest('Falta la imagen');
    const label = fields.label !== undefined ? cleanText(fields.label).slice(0, 40) : '';
    const tags = parseJsonField(fields.tags, PhotoTagsSchema, 'tags');
    const crop = parseJsonField(fields.crop, CropSchema, 'crop');
    const photo = await ctx.photos.create(req.user!.id, file, { label, tags, crop });
    if (!req.user!.defaultPhotoId) ctx.auth.invalidateUser(req.user!.id);
    reply.code(201);
    return { photo };
  });

  app.patch('/api/photos/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    const body = parseOrThrow(PhotoUpdateSchema, req.body);
    const photo = await ctx.photos.update(req.user!.id, id, body);
    if (body.isDefault || body.crop) ctx.auth.invalidateUser(req.user!.id);
    return { photo };
  });

  app.delete('/api/photos/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parseOrThrow(IdParam, req.params);
    await ctx.photos.remove(req.user!.id, id);
    ctx.auth.invalidateUser(req.user!.id);
    return { ok: true };
  });

  // Archivos: solo usuarios autenticados (los ids son UUID aleatorios no enumerables).
  app.get('/api/photos/:id/:variant', { preHandler: requireUser, config: { rateLimit: { max: 1200, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id, variant } = parseOrThrow(FileParam, req.params);
    const meta = await ctx.photos.getMeta(id);
    if (!meta) throw notFound('Foto no encontrada');
    const path = ctx.photos.filePath(meta.userId, id, variant, meta.version);
    const etag = `"${id}-${meta.version}-${variant}"`;
    const requestedV = Number((req.query as { v?: string }).v);
    reply.header('ETag', etag);
    reply.header('Cache-Control', requestedV === meta.version ? 'private, max-age=604800, immutable' : 'private, no-cache');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    const st = await stat(path).catch(() => null);
    if (!st) throw notFound('Archivo no disponible');
    reply.type('image/webp');
    reply.header('Content-Length', st.size);
    return reply.send(createReadStream(path));
  });
}
