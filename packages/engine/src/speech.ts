/**
 * Habla de los bots (GDD §13, «Diálogo»). Sin E/S: un disparador propone una frase (`want`), el bot la
 * dice cuando le toca pensar si nada lo impide (`trySpeak`) y el motor la devuelve como evento `dice`.
 *
 * Reglas:
 * - Solo hablan los bots. El piloto automático de un humano nunca habla por su jugador.
 * - Con `rules.speech === false` (chat de partida desactivado) no habla nadie.
 * - Un bot solo habla de lo que ha percibido; quién lo oye lo decide `hearsLine`, con la regla de
 *   `computeView`: hay que ver al bot y, si la frase va dirigida a alguien, también a ese alguien.
 * - Todo el azar sale de tiradas por hash (semilla, bot, tick): no toca el PRNG del mundo, así que hablar
 *   no cambia la partida.
 * - Hay una separación entre dos frases cualesquiera de la partida y un enfriamiento por bot según su
 *   sociabilidad, para que no saturen el registro ni tapen el mapa.
 */
import { PERSONALITIES, fillPhrase, hashString, pickPhrase, type PersonalityWeights, type SpeechSituation } from '@ceniza/shared';
import { actorById, computeView, type ActorState, type World, type WorldEvent } from './world.js';

/** Mínimo entre dos frases de la partida (ms de juego). */
export const SPEECH_GAP_MS = 6_000;

export interface TalkState {
  /** Lo que quiere decir, hasta cuándo vale y su prioridad frente a otra frase pendiente. */
  pending: { s: SpeechSituation; to: string | null; until: number; prio: number } | null;
  /** Última vez que habló (ms de juego). */
  saidAt: number;
  /** Frases dichas hace poco, para no repetirse. */
  recent: string[];
}

/** Enfriamiento de un bot entre dos frases: de 20 s (muy sociable) a 50 s (nada). */
export function cooldownMs(sociability: number): number {
  return 50_000 - 30_000 * sociability;
}

const TTL: Record<SpeechSituation, number> = {
  estallido: 12_000,
  acecho: 5_000,
  huida: 5_000,
  anochecer: 15_000,
  amanecer: 15_000,
  caida: 10_000,
  region: 8_000,
  victoria: 0,
  propuesta: 5_000,
  acepta: 5_000,
  rechaza: 5_000,
  traicion: 5_000,
  suplica: 5_000,
};

const PRIO: Record<SpeechSituation, number> = {
  estallido: 4,
  acecho: 6,
  huida: 7,
  anochecer: 2,
  amanecer: 2,
  caida: 5,
  region: 3,
  victoria: 9,
  propuesta: 6,
  acepta: 6,
  rechaza: 6,
  traicion: 8,
  suplica: 8,
};

/** Probabilidad de que el bot quiera decir algo en esa situación, según su personalidad. */
function chanceOf(s: SpeechSituation, p: PersonalityWeights, sawTarget: boolean): number {
  switch (s) {
    case 'estallido':
      return 0.45 * (0.3 + 0.7 * Math.max(p.aggression, p.sociability));
    case 'acecho':
      return 0.4 * p.aggression * (1 - 0.7 * p.caution);
    case 'huida':
      // Huir pasa a menudo (cada amenaza nueva): con más, las huidas taparían todo lo demás.
      return 0.15 * (0.3 + 0.7 * p.sociability);
    case 'anochecer':
    case 'amanecer':
      return 0.12 * (0.3 + 0.7 * p.sociability);
    case 'caida':
      return (sawTarget ? 0.35 : 0.08) * (0.3 + 0.7 * p.sociability);
    case 'region':
      return 0.25 * (0.2 + 0.8 * p.curiosity);
    case 'victoria':
      return 1;
    default:
      return 0.5 * (0.3 + 0.7 * p.sociability);
  }
}

/** Tirada en [0, 1) por hash: misma partida, misma tirada, sin tocar el azar del mundo. */
function roll(w: World, a: ActorState, salt: string): number {
  return (hashString(`${w.seed}:${a.id}:${w.tick}:${salt}`) >>> 0) / 4_294_967_296;
}

function talkOf(a: ActorState): TalkState | null {
  if (a.kind !== 'bot' || !a.bot) return null;
  // -1e9 y no -Infinity: la instantánea es JSON y -Infinity se guardaría como null.
  return (a.talk ??= { pending: null, saidAt: -1e9, recent: [] });
}

const speechOn = (w: World) => w.rules.speech !== false;

/**
 * Un disparador propone una frase. Sale o no según una tirada (con `p` se fuerza la probabilidad) y, si
 * sale, queda pendiente hasta su caducidad, salvo que ya haya otra pendiente más importante.
 */
export function want(w: World, a: ActorState, s: SpeechSituation, to: string | null = null, p?: number): void {
  const talk = talkOf(a);
  if (!talk || !speechOn(w) || !a.alive) return;
  const chance = p ?? chanceOf(s, PERSONALITIES[a.bot!.personality].weights, !!(to && a.mind?.seen[to]));
  if (roll(w, a, `quiere:${s}`) >= chance) return;
  const cur = talk.pending;
  if (cur && cur.until >= w.t && cur.prio > PRIO[s]) return;
  talk.pending = { s, to, until: w.t + TTL[s], prio: PRIO[s] };
}

/** Dice la frase (sin comprobar esperas): la usan `trySpeak` y la victoria. */
function say(w: World, a: ActorState, talk: TalkState, s: SpeechSituation, target: ActorState | null): WorldEvent {
  const { id, template } = pickPhrase(s, a.bot!.personality, roll(w, a, `frase:${s}`), talk.recent);
  talk.pending = null;
  talk.saidAt = w.t;
  talk.recent = [id, ...talk.recent].slice(0, 4);
  w.speechAt = w.t;
  return { type: 'dice', actorId: a.id, situation: s, line: id, text: fillPhrase(template, { objetivo: target?.name }), to: target?.id ?? null };
}

/** Si tiene algo pendiente y nada lo impide, el bot lo dice. Se llama cuando el bot piensa. */
export function trySpeak(w: World, a: ActorState): WorldEvent | null {
  const talk = talkOf(a);
  const p = talk?.pending;
  if (!talk || !p) return null;
  if (!speechOn(w) || !a.alive || w.phase !== 'en_curso' || w.t > p.until) {
    talk.pending = null;
    return null;
  }
  const target = p.to ? (actorById(w, p.to) ?? null) : null;
  // Si el objetivo ya no está (salvo para despedirlo), la frase ya no tiene sentido.
  if (p.to && (!target || (!target.alive && p.s !== 'caida'))) {
    talk.pending = null;
    return null;
  }
  if (w.t - talk.saidAt < cooldownMs(PERSONALITIES[a.bot!.personality].weights.sociability)) return null;
  if (w.speechAt != null && w.t - w.speechAt < SPEECH_GAP_MS) return null;
  return say(w, a, talk, p.s, target);
}

/** Disparadores de los eventos de un tick: el estallido, la noche, el día y las regiones nuevas. */
export function speechTriggers(w: World, ev: WorldEvent[]): void {
  if (!speechOn(w)) return;
  for (const e of ev) {
    if (e.type === 'fase' && e.phase === 'en_curso') for (const a of w.actors) want(w, a, 'estallido');
    else if (e.type === 'anochece' || e.type === 'amanece') for (const a of w.actors) want(w, a, e.type === 'anochece' ? 'anochecer' : 'amanecer');
    else if (e.type === 'descubre') {
      const a = actorById(w, e.actorId);
      if (a) want(w, a, 'region');
    }
  }
}

/** Alguien ha caído: los bots que siguen pueden despedirlo (más si lo habían visto). */
export function onElimination(w: World, actorId: string): void {
  if (!speechOn(w) || w.phase === 'terminada') return;
  for (const a of w.actors) if (a.id !== actorId) want(w, a, 'caida', actorId);
}

/** El ganador, si es un bot, lo celebra al momento: sin esperas, porque la partida ya ha terminado. */
export function victoryLine(w: World, winner: ActorState): WorldEvent | null {
  const talk = talkOf(winner);
  if (!talk || !speechOn(w)) return null;
  return say(w, winner, talk, 'victoria', null);
}

/** Si quien mira oye a ese bot: la misma regla que para verlo (`computeView`). */
export function canHear(w: World, viewerUserId: string | null, speakerId: string): boolean {
  return !!computeView(w, viewerUserId).actors.find((x) => x.id === speakerId)?.seen;
}

/**
 * Si quien mira oye esta frase. Tiene que ver al bot y, si la frase va dirigida a alguien, también a ese
 * alguien: «Corre si quieres, Tal» delante de quien no ve a Tal le diría dónde está. Despedir a un caído
 * sí lo oye cualquiera que vea al bot, porque toda la arena sabe ya quién ha caído.
 */
export function hearsLine(w: World, viewerUserId: string | null, e: Extract<WorldEvent, { type: 'dice' }>): boolean {
  const view = computeView(w, viewerUserId).actors;
  const sees = (id: string) => !!view.find((x) => x.id === id)?.seen;
  return sees(e.actorId) && (!e.to || e.situation === 'caida' || sees(e.to));
}
