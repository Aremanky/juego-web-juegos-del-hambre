/** Lo que dice la tarjeta de un participante (GDD §7.5), sin nada que no hayas visto. */
import { DIFFICULTIES, PERSONALITIES, type ActorView, type BotSettings } from '@ceniza/shared';
import type { LastSeen } from '../../stores/sight';
import { formatDuration, formatEta } from './plan';

/** Estado de un participante, igual en la lista y en su tarjeta. */
export function statusText(a: ActorView, me: string | null): string {
  if (!a.alive) return a.cause === 'desconexion' ? `Fuera por desconexión · puesto ${a.place}` : `Ha abandonado · puesto ${a.place}`;
  if (a.place === 1) return 'Ha ganado';
  if (!a.connected) return a.control === 'piloto' ? 'Sin conexión · piloto automático' : 'Sin conexión · a cubierto';
  if (a.id === me) return 'Tú';
  return a.kind === 'bot' ? 'Bot' : 'En la arena';
}

export interface CardInfo {
  kind: 'Humano' | 'Bot';
  /** Personalidad y dificultad de un bot (públicas en el lobby). */
  bot: string | null;
  /** Solo si dice algo que la tarjeta no diga ya: sin conexión, caído, ha ganado o «Tú». */
  status: string | null;
  /** Dónde está para ti: a cuánto, o desde cuándo no lo ves. Nada para uno mismo ni para los caídos. */
  where: string | null;
}

export function participantCard(
  a: ActorView,
  ctx: { me: string | null; lastSeen?: LastSeen; now: number; bot: BotSettings | null; trip: { cells: number; eta: number } | null },
): CardInfo {
  const bot = a.kind === 'bot' && ctx.bot ? `${PERSONALITIES[ctx.bot.personality].name} · ${DIFFICULTIES[ctx.bot.difficulty].name}` : null;
  let where: string | null = null;
  if (a.alive && a.id !== ctx.me) {
    if (a.seen) where = ctx.trip ? `A ${ctx.trip.cells} casillas · ${formatEta(ctx.trip.eta)}` : null;
    else where = ctx.lastSeen ? `Fuera de tu vista desde hace ${formatDuration(ctx.now - ctx.lastSeen.at)}` : 'Aún no ha entrado en tu vista';
  }
  const plain = a.alive && a.connected && a.place !== 1 && a.id !== ctx.me;
  return { kind: a.kind === 'bot' ? 'Bot' : 'Humano', bot, status: plain ? null : statusText(a, ctx.me), where };
}
