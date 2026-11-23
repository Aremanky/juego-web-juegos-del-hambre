import { and, desc, eq, ne } from 'drizzle-orm';
import type { Character, MatchPhase, RoomConfig } from '@ceniza/shared';
import type { WorldJSON } from '@ceniza/engine';
import type { DB } from '../../db/client';
import { matchEvents, matchParticipants, matches } from '../../db/schema';

export type MatchRow = typeof matches.$inferSelect;
export type MatchParticipantRow = typeof matchParticipants.$inferSelect;

export interface NewMatchParticipant {
  participantId: string;
  kind: 'human' | 'bot';
  userId: string | null;
  character: Character;
  district: number;
  gender: 'M' | 'F';
}

export interface MatchEventInsert {
  tick: number;
  t: number;
  type: string;
  payload: Record<string, unknown>;
}

/** Persistencia de partidas: instantáneas para recuperar tras un reinicio, participantes y registro de eventos. */
export class MatchRepository {
  constructor(private readonly db: DB) {}

  async create(values: { roomId: string; seed: string; config: RoomConfig; snapshot: WorldJSON; status: MatchPhase }, participants: NewMatchParticipant[]): Promise<MatchRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(matches).values(values).returning();
      if (participants.length) await tx.insert(matchParticipants).values(participants.map((p) => ({ ...p, matchId: row.id })));
      return row;
    });
  }

  async active(roomId: string): Promise<MatchRow | undefined> {
    const [row] = await this.db
      .select()
      .from(matches)
      .where(and(eq(matches.roomId, roomId), ne(matches.status, 'terminada')))
      .orderBy(desc(matches.startedAt))
      .limit(1);
    return row;
  }

  async latest(roomId: string): Promise<MatchRow | undefined> {
    const [row] = await this.db.select().from(matches).where(eq(matches.roomId, roomId)).orderBy(desc(matches.startedAt)).limit(1);
    return row;
  }

  async saveSnapshot(id: string, status: MatchPhase, snapshot: WorldJSON): Promise<void> {
    await this.db.update(matches).set({ status, snapshot, snapshotAt: new Date() }).where(eq(matches.id, id));
  }

  async finish(id: string, snapshot: WorldJSON, winnerParticipantId: string | null, results: { participantId: string; place: number | null; cause: 'abandono' | 'desconexion' | null; eliminatedAtMs: number | null }[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(matches).set({ status: 'terminada', snapshot, snapshotAt: new Date(), endedAt: new Date(), winnerParticipantId }).where(eq(matches.id, id));
      for (const r of results) {
        await tx
          .update(matchParticipants)
          .set({ place: r.place, cause: r.cause, eliminatedAtMs: r.eliminatedAtMs })
          .where(and(eq(matchParticipants.matchId, id), eq(matchParticipants.participantId, r.participantId)));
      }
    });
  }

  async addEvents(matchId: string, rows: MatchEventInsert[]): Promise<void> {
    if (!rows.length) return;
    await this.db.insert(matchEvents).values(rows.map((r) => ({ ...r, matchId })));
  }

  async events(matchId: string): Promise<(typeof matchEvents.$inferSelect)[]> {
    return this.db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)).orderBy(matchEvents.id);
  }

  async participants(matchId: string): Promise<MatchParticipantRow[]> {
    return this.db.select().from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
  }
}
