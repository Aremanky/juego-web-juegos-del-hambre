import { and, count, desc, eq, sql } from 'drizzle-orm';
import { CharacterSchema, MAX_TEMPLATE_BUDGET, summarizeBuild, type Character, type Portrait, type TemplateDTO } from '@ceniza/shared';
import type { DB } from '../../db/client';
import { characterTemplates } from '../../db/schema';
import type { AppConfig } from '../../config';
import type { PhotoService } from '../photos/service';
import { badRequest, limitReached, notFound, parseOrThrow } from '../../lib/errors';

export function portraitPhotoIds(c: Pick<Character, 'portrait' | 'victoryPhoto'>): string[] {
  const ids: string[] = [];
  if (c.portrait.kind === 'photo') ids.push(c.portrait.photoId);
  if (c.victoryPhoto?.kind === 'photo') ids.push(c.victoryPhoto.photoId);
  return ids;
}

export function withPhotoVersions(c: Character, versions: Map<string, number>): Character {
  const fix = (p: Portrait): Portrait => (p.kind === 'photo' ? { ...p, v: versions.get(p.photoId) ?? p.v } : p);
  return { ...c, portrait: fix(c.portrait), victoryPhoto: c.victoryPhoto ? fix(c.victoryPhoto) : null };
}

export class TemplateService {
  constructor(
    private readonly db: DB,
    private readonly cfg: AppConfig,
    private readonly photos: PhotoService,
  ) {}

  /** Valida esquema, reglas de construcción y propiedad de las fotos; fija las versiones de foto. */
  async prepareOwnCharacter(userId: string, raw: unknown, opts: { budget?: number; requireValid?: boolean } = {}): Promise<Character> {
    const c = parseOrThrow(CharacterSchema, raw);
    const versions = await this.photos.ownedVersions(userId, portraitPhotoIds(c));
    if (opts.requireValid !== false) {
      const s = summarizeBuild(c, opts.budget ?? MAX_TEMPLATE_BUDGET);
      if (!s.valid) throw badRequest(s.issues.map((i) => i.message).join(' '));
    }
    return withPhotoVersions(c, versions);
  }

  async list(userId: string): Promise<TemplateDTO[]> {
    const rows = await this.db
      .select()
      .from(characterTemplates)
      .where(eq(characterTemplates.userId, userId))
      .orderBy(sql`${characterTemplates.lastUsedAt} desc nulls last`, desc(characterTemplates.updatedAt));
    const versions = await this.photos.versions(rows.flatMap((r) => portraitPhotoIds(r.data)));
    return rows.map((r) => this.toDTO(r, versions));
  }

  async get(userId: string, id: string): Promise<TemplateDTO> {
    const row = await this.db.query.characterTemplates.findFirst({ where: and(eq(characterTemplates.id, id), eq(characterTemplates.userId, userId)) });
    if (!row) throw notFound('Plantilla no encontrada');
    const versions = await this.photos.versions(portraitPhotoIds(row.data));
    return this.toDTO(row, versions);
  }

  async create(userId: string, raw: unknown): Promise<TemplateDTO> {
    const [{ n }] = (await this.db.select({ n: count() }).from(characterTemplates).where(eq(characterTemplates.userId, userId))) as [{ n: number }];
    if (n >= this.cfg.MAX_TEMPLATES_PER_USER) throw limitReached(`Máximo ${this.cfg.MAX_TEMPLATES_PER_USER} personajes guardados`);
    const data = await this.prepareOwnCharacter(userId, raw);
    const [row] = await this.db.insert(characterTemplates).values({ userId, name: data.name, data }).returning();
    return this.toDTO(row!, new Map());
  }

  async update(userId: string, id: string, raw: unknown): Promise<TemplateDTO> {
    const data = await this.prepareOwnCharacter(userId, raw);
    const [row] = await this.db
      .update(characterTemplates)
      .set({ name: data.name, data, updatedAt: new Date() })
      .where(and(eq(characterTemplates.id, id), eq(characterTemplates.userId, userId)))
      .returning();
    if (!row) throw notFound('Plantilla no encontrada');
    return this.toDTO(row, new Map());
  }

  async remove(userId: string, id: string): Promise<void> {
    const res = await this.db
      .delete(characterTemplates)
      .where(and(eq(characterTemplates.id, id), eq(characterTemplates.userId, userId)))
      .returning({ id: characterTemplates.id });
    if (res.length === 0) throw notFound('Plantilla no encontrada');
  }

  async duplicate(userId: string, id: string): Promise<TemplateDTO> {
    const t = await this.get(userId, id);
    const name = `${t.data.name.slice(0, 18)} (copia)`;
    return this.create(userId, { ...t.data, name });
  }

  async touch(userId: string, id: string): Promise<void> {
    await this.db
      .update(characterTemplates)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(characterTemplates.id, id), eq(characterTemplates.userId, userId)));
  }

  /** Última plantilla usada (o editada), para aplicarla automáticamente al entrar en una sala. */
  async latest(userId: string): Promise<TemplateDTO | null> {
    const list = await this.list(userId);
    return list[0] ?? null;
  }

  private toDTO(r: typeof characterTemplates.$inferSelect, versions: Map<string, number>): TemplateDTO {
    return {
      id: r.id,
      name: r.name,
      data: withPhotoVersions(r.data, versions),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    };
  }
}
