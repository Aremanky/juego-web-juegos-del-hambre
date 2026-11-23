import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { APP_VERSION, ChangePasswordSchema, LoginSchema, RegisterSchema, UpdateProfileSchema, type ServerInfoDTO } from '@ceniza/shared';
import type { AppContext } from '../../context';
import { parseOrThrow, unauthorized, forbidden } from '../../lib/errors';

export const SESSION_COOKIE = 'ceniza_sid';

declare module 'fastify' {
  interface FastifyRequest {
    user: import('./service').SessionUser | null;
    sessionId: string | null;
  }
}

export function setSessionCookie(ctx: AppContext, req: FastifyRequest, reply: FastifyReply, token: string) {
  const secure = ctx.config.COOKIE_SECURE === 'auto' ? req.protocol === 'https' : ctx.config.COOKIE_SECURE === 'true';
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: Math.floor(ctx.config.sessionTtlMs / 1000),
  });
}

export async function requireUser(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
}

export async function requireAdmin(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  if (req.user.role !== 'admin') throw forbidden();
}

export function registerAuth(app: FastifyInstance, ctx: AppContext) {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  // Resuelve la sesión en cada petición de API (con caché en memoria de 30 s).
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const res = await ctx.auth.resolve(token);
    if (!res) {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return;
    }
    req.user = res.user;
    req.sessionId = res.sessionId;
    if (res.refresh) setSessionCookie(ctx, req, reply, token);
  });

  const meta = (req: FastifyRequest) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

  app.get('/api/server-info', async (): Promise<ServerInfoDTO> => ({
    appName: ctx.config.APP_NAME,
    registrationRequiresCode: !!ctx.config.registrationCode,
    version: APP_VERSION,
  }));

  app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = parseOrThrow(RegisterSchema, req.body);
    const { user, token } = await ctx.auth.register(body, meta(req));
    setSessionCookie(ctx, req, reply, token);
    reply.code(201);
    return { user: ctx.auth.toDTO(user) };
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parseOrThrow(LoginSchema, req.body);
    const { user, token } = await ctx.auth.login(body.username, body.password, meta(req));
    setSessionCookie(ctx, req, reply, token);
    return { user: ctx.auth.toDTO(user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionId) {
      await ctx.auth.revokeSession(req.sessionId);
      ctx.events.emit('session:revoked', { sessionIds: [req.sessionId] });
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/logout-all', { preHandler: requireUser }, async (req, reply) => {
    await ctx.auth.revokeAllForUser(req.user!.id);
    ctx.events.emit('user:sessionsRevoked', { userId: req.user!.id });
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    if (!req.user) throw unauthorized();
    return { user: ctx.auth.toDTO(req.user) };
  });

  app.patch('/api/users/me', { preHandler: requireUser }, async (req) => {
    const body = parseOrThrow(UpdateProfileSchema, req.body);
    await ctx.auth.updateProfile(req.user!.id, body.displayName);
    return { user: ctx.auth.toDTO({ ...req.user!, displayName: body.displayName }) };
  });

  app.post('/api/users/me/password', { preHandler: requireUser, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const body = parseOrThrow(ChangePasswordSchema, req.body);
    await ctx.auth.changePassword(req.user!.id, body.currentPassword, body.newPassword, req.sessionId!);
    return { ok: true };
  });
}
