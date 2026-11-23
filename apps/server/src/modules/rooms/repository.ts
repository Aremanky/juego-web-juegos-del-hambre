import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { RoomConfig } from '@ceniza/shared';
import type { DB } from '../../db/client';
import { roomParticipants, rooms, users } from '../../db/schema';
import { randomRoomCode } from '../../lib/util';

export type RoomRow = typeof rooms.$inferSelect;
export type ParticipantRow = typeof roomParticipants.$inferSelect;
export type ParticipantInsert = typeof roomParticipants.$inferInsert;

export class RoomRepository {
  constructor(private readonly db: DB) {}

  async create(hostUserId: string, name: string, config: RoomConfig): Promise<RoomRow> {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const [row] = await this.db.insert(rooms).values({ code: randomRoomCode(), name, hostUserId, config }).returning();
        return row!;
      } catch (e) {
        const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
        if (code !== '23505') throw e; // colisión de código: reintentar
      }
    }
    throw new Error('No se pudo generar un código de sala único');
  }

  findByCode(code: string) {
    return this.db.query.rooms.findFirst({ where: eq(rooms.code, code) });
  }

  findById(id: string) {
    return this.db.query.rooms.findFirst({ where: eq(rooms.id, id) });
  }

  async updateRoom(id: string, set: Partial<typeof rooms.$inferInsert>) {
    await this.db.update(rooms).set({ ...set, updatedAt: new Date() }).where(eq(rooms.id, id));
  }

  /** Participantes activos con los nombres de usuario necesarios para el estado del lobby. */
  async activeParticipants(roomId: string) {
    const rows = await this.db
      .select()
      .from(roomParticipants)
      .where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.status, 'active')))
      .orderBy(roomParticipants.joinedAt);
    const ids = [...new Set(rows.flatMap((r) => [r.userId, r.addedByUserId]).filter((x): x is string => !!x))];
    const names = await this.userNames(ids);
    return { rows, names };
  }

  async userNames(ids: string[]) {
    if (ids.length === 0) return new Map<string, { username: string; displayName: string }>();
    const rows = await this.db.select({ id: users.id, username: users.username, displayName: users.displayName }).from(users).where(inArray(users.id, ids));
    return new Map(rows.map((r) => [r.id, { username: r.username, displayName: r.displayName }]));
  }

  /** Última fila (cualquier estado) de un humano en una sala: para reconexión, regreso o expulsión. */
  findHumanRow(roomId: string, userId: string) {
    return this.db.query.roomParticipants.findFirst({
      where: and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, userId), eq(roomParticipants.kind, 'human')),
      orderBy: [desc(roomParticipants.joinedAt)],
    });
  }

  async insertParticipant(values: ParticipantInsert): Promise<ParticipantRow> {
    const [row] = await this.db.insert(roomParticipants).values(values).returning();
    return row!;
  }

  async updateParticipant(id: string, set: Partial<ParticipantInsert>): Promise<ParticipantRow> {
    const [row] = await this.db.update(roomParticipants).set(set).where(eq(roomParticipants.id, id)).returning();
    return row!;
  }

  async unreadyAll(roomId: string) {
    await this.db
      .update(roomParticipants)
      .set({ ready: false })
      .where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.kind, 'human'), eq(roomParticipants.status, 'active')));
  }

  /** Salas abiertas en las que participa el usuario (para "volver a la sala"). */
  async listForUser(userId: string) {
    return this.db
      .select({
        room: rooms,
        humans: sql<number>`(select count(*)::int from room_participants p where p.room_id = ${rooms.id} and p.status = 'active' and p.kind = 'human')`,
        bots: sql<number>`(select count(*)::int from room_participants p where p.room_id = ${rooms.id} and p.status = 'active' and p.kind = 'bot')`,
      })
      .from(rooms)
      .innerJoin(roomParticipants, and(eq(roomParticipants.roomId, rooms.id), eq(roomParticipants.userId, userId), eq(roomParticipants.status, 'active')))
      .where(and(ne(rooms.status, 'closed'), ne(rooms.status, 'finished')))
      .orderBy(desc(rooms.updatedAt))
      .limit(20);
  }

  async counts(roomId: string) {
    const [r] = await this.db
      .select({
        humans: sql<number>`count(*) filter (where kind = 'human')::int`,
        bots: sql<number>`count(*) filter (where kind = 'bot')::int`,
      })
      .from(roomParticipants)
      .where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.status, 'active')));
    return r ?? { humans: 0, bots: 0 };
  }
}
