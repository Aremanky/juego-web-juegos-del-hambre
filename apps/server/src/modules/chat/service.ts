import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ChatChannel, ChatMessageDTO } from '@ceniza/shared';
import type { DB } from '../../db/client';
import { chatMessages, photos, users } from '../../db/schema';
import type { SessionUser } from '../auth/service';

export class ChatService {
  constructor(private readonly db: DB) {}

  async post(channel: ChatChannel, roomId: string | null, user: SessionUser, body: string): Promise<ChatMessageDTO> {
    const [row] = await this.db.insert(chatMessages).values({ channel, roomId, userId: user.id, body }).returning();
    return {
      id: String(row!.id),
      channel,
      roomId,
      user: { id: user.id, displayName: user.displayName, photo: user.defaultPhotoId ? { id: user.defaultPhotoId, v: user.defaultPhotoV } : null },
      body,
      createdAt: row!.createdAt.toISOString(),
    };
  }

  async system(roomId: string, body: string): Promise<ChatMessageDTO> {
    const [row] = await this.db.insert(chatMessages).values({ channel: 'room', roomId, body, system: true }).returning();
    return {
      id: String(row!.id),
      channel: 'room',
      roomId,
      user: { id: 'system', displayName: 'Los Arquitectos', photo: null },
      body,
      createdAt: row!.createdAt.toISOString(),
      system: true,
    };
  }

  async history(channel: ChatChannel, roomId: string | null, limit = 60): Promise<ChatMessageDTO[]> {
    const rows = await this.db
      .select({ m: chatMessages, name: users.displayName, photoId: users.defaultPhotoId, pv: photos.version })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.userId))
      .leftJoin(photos, eq(photos.id, users.defaultPhotoId))
      .where(and(eq(chatMessages.channel, channel), roomId ? eq(chatMessages.roomId, roomId) : isNull(chatMessages.roomId)))
      .orderBy(desc(chatMessages.id))
      .limit(limit);
    return rows.reverse().map(({ m, name, photoId, pv }) => ({
      id: String(m.id),
      channel: m.channel,
      roomId: m.roomId,
      user: m.system
        ? { id: 'system', displayName: 'Los Arquitectos', photo: null }
        : { id: m.userId ?? 'deleted', displayName: name ?? 'Usuario eliminado', photo: photoId ? { id: photoId, v: pv ?? 0 } : null },
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      ...(m.system ? { system: true } : {}),
    }));
  }
}
