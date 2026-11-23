import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Crop, PhotoDTO, PhotoVariant } from '@ceniza/shared';
import type { DB } from '../../db/client';
import { photos, users } from '../../db/schema';
import type { AppConfig } from '../../config';
import { badRequest, limitReached, notFound } from '../../lib/errors';
import { Lru, randomToken } from '../../lib/util';
import { defaultCrop, normalizeUpload, renderCrops, renderThumb } from './processing';

interface PhotoMeta {
  userId: string;
  version: number;
}

export class PhotoService {
  private meta = new Lru<string, PhotoMeta>(2000);

  constructor(
    private readonly db: DB,
    private readonly cfg: AppConfig,
  ) {}

  private dir(userId: string, photoId: string) {
    return join(this.cfg.uploadDir, 'photos', userId, photoId);
  }

  filePath(userId: string, photoId: string, variant: PhotoVariant, version: number): string {
    const name = variant === 'original' ? 'original.webp' : variant === 'thumb' ? 'thumb.webp' : `${variant}.v${version}.webp`;
    return join(this.dir(userId, photoId), name);
  }

  private async writeAtomic(path: string, data: Buffer) {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${randomToken(6)}.tmp`;
    await writeFile(tmp, data, { mode: 0o640 });
    await rename(tmp, path);
  }

  async list(userId: string): Promise<PhotoDTO[]> {
    const [rows, u] = await Promise.all([
      this.db.select().from(photos).where(eq(photos.userId, userId)).orderBy(desc(photos.createdAt)),
      this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { defaultPhotoId: true } }),
    ]);
    return rows.map((r) => this.toDTO(r, u?.defaultPhotoId ?? null));
  }

  async create(userId: string, buf: Buffer, opts: { label?: string; tags?: string[]; crop?: Crop }): Promise<PhotoDTO> {
    const [{ n }] = (await this.db.select({ n: count() }).from(photos).where(eq(photos.userId, userId))) as [{ n: number }];
    if (n >= this.cfg.MAX_PHOTOS_PER_USER) throw limitReached(`Has alcanzado el máximo de ${this.cfg.MAX_PHOTOS_PER_USER} fotos. Borra alguna para subir más.`);

    const img = await normalizeUpload(buf);
    const crop = opts.crop ?? defaultCrop(img.width, img.height);
    const [row] = await this.db
      .insert(photos)
      .values({ userId, label: opts.label ?? '', tags: opts.tags ?? [], width: img.width, height: img.height, bytes: img.data.length, crop, version: 1 })
      .returning();
    const id = row!.id;
    try {
      const [{ avatar, marker }, thumb] = await Promise.all([renderCrops(img.data, img.width, img.height, crop), renderThumb(img.data)]);
      await Promise.all([
        this.writeAtomic(this.filePath(userId, id, 'original', 1), img.data),
        this.writeAtomic(this.filePath(userId, id, 'thumb', 1), thumb),
        this.writeAtomic(this.filePath(userId, id, 'avatar', 1), avatar),
        this.writeAtomic(this.filePath(userId, id, 'marker', 1), marker),
      ]);
    } catch (e) {
      await this.db.delete(photos).where(eq(photos.id, id));
      await rm(this.dir(userId, id), { recursive: true, force: true });
      throw e;
    }
    // La primera foto pasa a ser la predeterminada.
    const u = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { defaultPhotoId: true } });
    if (!u?.defaultPhotoId) await this.db.update(users).set({ defaultPhotoId: id }).where(eq(users.id, userId));
    this.meta.set(id, { userId, version: 1 });
    return this.toDTO(row!, u?.defaultPhotoId ?? id);
  }

  async update(userId: string, photoId: string, patch: { label?: string; tags?: string[]; crop?: Crop; isDefault?: true }): Promise<PhotoDTO> {
    const row = await this.db.query.photos.findFirst({ where: and(eq(photos.id, photoId), eq(photos.userId, userId)) });
    if (!row) throw notFound('Foto no encontrada');
    const set: Partial<typeof photos.$inferInsert> = { updatedAt: new Date() };
    if (patch.label !== undefined) set.label = patch.label;
    if (patch.tags !== undefined) set.tags = patch.tags;
    if (patch.crop) {
      const version = row.version + 1;
      const { avatar, marker } = await renderCrops(this.filePath(userId, photoId, 'original', 0), row.width, row.height, patch.crop);
      await Promise.all([
        this.writeAtomic(this.filePath(userId, photoId, 'avatar', version), avatar),
        this.writeAtomic(this.filePath(userId, photoId, 'marker', version), marker),
      ]);
      set.crop = patch.crop;
      set.version = version;
    }
    const [updated] = await this.db.update(photos).set(set).where(eq(photos.id, photoId)).returning();
    if (patch.crop) {
      this.meta.set(photoId, { userId, version: updated!.version });
      void this.removeOldVersions(userId, photoId, updated!.version);
    }
    if (patch.isDefault) await this.db.update(users).set({ defaultPhotoId: photoId }).where(eq(users.id, userId));
    const u = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { defaultPhotoId: true } });
    return this.toDTO(updated!, u?.defaultPhotoId ?? null);
  }

  async remove(userId: string, photoId: string): Promise<void> {
    const res = await this.db.delete(photos).where(and(eq(photos.id, photoId), eq(photos.userId, userId))).returning({ id: photos.id });
    if (res.length === 0) throw notFound('Foto no encontrada');
    this.meta.delete(photoId);
    await rm(this.dir(userId, photoId), { recursive: true, force: true });
  }

  /** Metadatos mínimos para servir un archivo (con caché). */
  async getMeta(photoId: string): Promise<PhotoMeta | null> {
    const cached = this.meta.get(photoId);
    if (cached) return cached;
    const row = await this.db.query.photos.findFirst({ where: eq(photos.id, photoId), columns: { userId: true, version: true } });
    if (!row) return null;
    this.meta.set(photoId, row);
    return row;
  }

  /** Comprueba que todas las fotos pertenecen al usuario y devuelve su versión actual. */
  async ownedVersions(userId: string, ids: string[]): Promise<Map<string, number>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ id: photos.id, version: photos.version })
      .from(photos)
      .where(and(eq(photos.userId, userId), inArray(photos.id, unique)));
    if (rows.length !== unique.length) throw badRequest('Solo puedes usar fotos de tu propia biblioteca');
    return new Map(rows.map((r) => [r.id, r.version]));
  }

  async versions(ids: string[]): Promise<Map<string, number>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db.select({ id: photos.id, version: photos.version }).from(photos).where(inArray(photos.id, unique));
    return new Map(rows.map((r) => [r.id, r.version]));
  }

  private async removeOldVersions(userId: string, photoId: string, keep: number) {
    try {
      const files = await readdir(this.dir(userId, photoId));
      await Promise.all(
        files
          .filter((f) => /^(avatar|marker)\.v\d+\.webp$/.test(f) && !f.includes(`.v${keep}.`))
          .map((f) => rm(join(this.dir(userId, photoId), f), { force: true })),
      );
    } catch {
      /* no crítico */
    }
  }

  private toDTO(r: typeof photos.$inferSelect, defaultId: string | null): PhotoDTO {
    return {
      id: r.id,
      label: r.label,
      tags: r.tags,
      width: r.width,
      height: r.height,
      crop: r.crop,
      v: r.version,
      isDefault: r.id === defaultId,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
