import { hash, verify } from '@node-rs/argon2';
import { and, count, eq, gt, isNull, lt, ne } from 'drizzle-orm';
import type { UserDTO, UserRole } from '@ceniza/shared';
import type { DB } from '../../db/client';
import { photos, sessions, users } from '../../db/schema';
import type { AppConfig } from '../../config';
import { badRequest, conflict, forbidden, unauthorized } from '../../lib/errors';
import { randomToken, sha256 } from '../../lib/util';

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  defaultPhotoId: string | null;
  defaultPhotoV: number;
  createdAt: Date;
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

// Parámetros recomendados por OWASP para Argon2id
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const CACHE_TTL_MS = 30_000;
const SLIDE_AFTER_MS = 12 * 3600 * 1000;

export class AuthService {
  private cache = new Map<string, { user: SessionUser; cachedAt: number; lastSeen: number }>();
  private dummyHash: Promise<string>;

  constructor(
    private readonly db: DB,
    private readonly cfg: AppConfig,
  ) {
    this.dummyHash = hash('contraseña-ficticia-para-igualar-tiempos', ARGON);
  }

  async register(input: { username: string; displayName: string; password: string; registrationCode?: string }, meta: SessionMeta) {
    if (this.cfg.registrationCode && input.registrationCode?.trim() !== this.cfg.registrationCode) {
      throw forbidden('Código de registro incorrecto');
    }
    const usernameLower = input.username.toLowerCase();
    const [{ n }] = (await this.db.select({ n: count() }).from(users)) as [{ n: number }];
    const role: UserRole = n === 0 || this.cfg.adminUsernames.has(usernameLower) ? 'admin' : 'user';
    const passwordHash = await hash(input.password, ARGON);
    try {
      const [row] = await this.db
        .insert(users)
        .values({ username: input.username, usernameLower, displayName: input.displayName, passwordHash, role, lastLoginAt: new Date() })
        .returning();
      const token = await this.createSession(row!.id, meta);
      return { user: this.rowToSessionUser(row!, 0), token };
    } catch (e) {
      if ((e as { code?: string }).code === '23505' || (e as { cause?: { code?: string } }).cause?.code === '23505') {
        throw conflict('Ese nombre de usuario ya existe');
      }
      throw e;
    }
  }

  async login(username: string, password: string, meta: SessionMeta) {
    const row = await this.db.query.users.findFirst({ where: eq(users.usernameLower, username.trim().toLowerCase()) });
    if (!row) {
      await verify(await this.dummyHash, password).catch(() => false);
      throw unauthorized('Usuario o contraseña incorrectos');
    }
    const ok = await verify(row.passwordHash, password).catch(() => false);
    if (!ok) throw unauthorized('Usuario o contraseña incorrectos');
    if (row.disabledAt) throw forbidden('Esta cuenta está desactivada');
    const role: UserRole = this.cfg.adminUsernames.has(row.usernameLower) ? 'admin' : row.role;
    await this.db.update(users).set({ lastLoginAt: new Date(), role }).where(eq(users.id, row.id));
    const token = await this.createSession(row.id, meta);
    const v = row.defaultPhotoId ? await this.photoVersion(row.defaultPhotoId) : 0;
    return { user: this.rowToSessionUser({ ...row, role }, v), token };
  }

  async createSession(userId: string, meta: SessionMeta): Promise<string> {
    const token = randomToken(32);
    await this.db.insert(sessions).values({
      id: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + this.cfg.sessionTtlMs),
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip ?? null,
    });
    return token;
  }

  /** Resuelve un token de cookie. `refresh` indica que hay que renovar la cookie (expiración deslizante). */
  async resolve(token: string | undefined): Promise<{ user: SessionUser; sessionId: string; refresh: boolean } | null> {
    if (!token || token.length < 20 || token.length > 100) return null;
    const sessionId = sha256(token);
    const now = Date.now();
    const cached = this.cache.get(sessionId);
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) return { user: cached.user, sessionId, refresh: false };

    const rows = await this.db
      .select({ s: sessions, u: users, pv: photos.version })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(photos, eq(photos.id, users.defaultPhotoId))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date()), isNull(users.disabledAt)))
      .limit(1);
    const r = rows[0];
    if (!r) {
      this.cache.delete(sessionId);
      return null;
    }
    const user = this.rowToSessionUser(r.u, r.pv ?? 0);
    let refresh = false;
    if (now - r.s.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
      await this.db
        .update(sessions)
        .set({ lastSeenAt: new Date(), expiresAt: new Date(now + this.cfg.sessionTtlMs) })
        .where(eq(sessions.id, sessionId));
      refresh = true;
    }
    this.cache.set(sessionId, { user, cachedAt: now, lastSeen: now });
    return { user, sessionId, refresh };
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.cache.delete(sessionId);
    await this.db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    this.invalidateUser(userId);
    await this.db
      .delete(sessions)
      .where(exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId));
  }

  async changePassword(userId: string, current: string, next: string, keepSessionId: string): Promise<void> {
    const row = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!row) throw unauthorized();
    if (!(await verify(row.passwordHash, current).catch(() => false))) throw badRequest('La contraseña actual no es correcta');
    await this.db.update(users).set({ passwordHash: await hash(next, ARGON) }).where(eq(users.id, userId));
    await this.revokeAllForUser(userId, keepSessionId);
  }

  async updateProfile(userId: string, displayName: string): Promise<void> {
    await this.db.update(users).set({ displayName }).where(eq(users.id, userId));
    this.invalidateUser(userId);
  }

  invalidateUser(userId: string): void {
    for (const [k, v] of this.cache) if (v.user.id === userId) this.cache.delete(k);
  }

  async cleanupExpired(): Promise<void> {
    await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  }

  toDTO(u: SessionUser): UserDTO {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      defaultPhoto: u.defaultPhotoId ? { id: u.defaultPhotoId, v: u.defaultPhotoV } : null,
      createdAt: u.createdAt.toISOString(),
    };
  }

  private async photoVersion(photoId: string): Promise<number> {
    const p = await this.db.query.photos.findFirst({ where: eq(photos.id, photoId), columns: { version: true } });
    return p?.version ?? 0;
  }

  private rowToSessionUser(row: typeof users.$inferSelect, photoV: number): SessionUser {
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      defaultPhotoId: row.defaultPhotoId ?? null,
      defaultPhotoV: photoV,
      createdAt: row.createdAt,
    };
  }
}
