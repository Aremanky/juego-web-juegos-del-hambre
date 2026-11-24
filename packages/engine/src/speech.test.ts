import { describe, expect, it } from 'vitest';
import { ARCHETYPES, PERSONALITIES, PHRASES, VOICE_OF, defaultCharacter, fillPhrase, type BotSettings, type Character, type SpeechSituation, type VoiceKey } from '@ceniza/shared';
import {
  SPEECH_GAP_MS,
  actorById,
  canHear,
  cooldownMs,
  hearsLine,
  createWorld,
  eliminate,
  restoreWorld,
  serializeWorld,
  setConnected,
  tick,
  trySpeak,
  want,
  type ActorInit,
  type World,
  type WorldEvent,
  type WorldRules,
} from './index.js';

type Dice = Extract<WorldEvent, { type: 'dice' }>;
const RULES: WorldRules = { visibility: 'visible', pauseVote: 'mayoria', disconnectPolicy: 'piloto', disconnectGraceMs: 60_000, presentationMs: 100, countdownMs: 100, dayMs: 40_000, nightMs: 20_000 };
const CHATTY = ['cooperativo', 'manipulador', 'agresivo', 'impredecible', 'pacifico', 'explorador', 'traicionero', 'estratega'] as const;

function char(name: string, archetype = 'equilibrado'): Character {
  const a = ARCHETYPES.find((x) => x.key === archetype)!;
  return { ...defaultCharacter({ name, seed: name }), attributes: { ...a.attributes }, abilities: [...a.abilities], trait: a.trait };
}
const bot = (id: string, s: Partial<BotSettings> = {}, archetype = 'equilibrado', district = 1): ActorInit => ({
  id,
  kind: 'bot',
  userId: null,
  character: char(id, archetype),
  district,
  gender: 'M',
  bot: { difficulty: 'normal', personality: 'cooperativo', playstyle: 'equilibrado', ...s },
});
const human = (id: string, archetype = 'equilibrado', district = 2): ActorInit => ({ id, kind: 'human', userId: `u-${id}`, character: char(id, archetype), district, gender: 'F' });
const chatty = (n: number) => Array.from({ length: n }, (_, i) => bot(`b${i}`, { personality: CHATTY[i % CHATTY.length] }, ARCHETYPES[i % 8].key, (i % 12) + 1));

function start(actors: ActorInit[], rules: Partial<WorldRules> = {}, seed = 'voces', size = 96): World {
  const w = createWorld({ seed, mapSize: size, actors, rules: { ...RULES, ...rules } });
  const users = actors.filter((a) => a.userId).map((a) => a.userId!);
  for (let now = 100; w.phase !== 'en_curso'; now += 100) tick(w, now, users);
  return w;
}

/** Avanza `ms` de juego y devuelve las frases con la hora a la que se dijeron. */
function listen(w: World, ms: number): (Dice & { t: number })[] {
  const users = w.actors.filter((a) => a.userId).map((a) => a.userId!);
  const out: (Dice & { t: number })[] = [];
  for (let i = 0; i < ms / 100; i++) for (const e of tick(w, 0, users)) if (e.type === 'dice') out.push({ ...e, t: w.t });
  return out;
}

describe('frases de los bots (fase 6)', () => {
  it('los bots hablan con frases de su voz y la partida es determinista', () => {
    const actors = [human('h'), ...chatty(8)];
    const a = listen(start(actors), 180_000);
    const b = listen(start(actors), 180_000);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    const w = start(actors);
    for (const e of a) {
      const speaker = actorById(w, e.actorId)!;
      expect(speaker.kind).toBe('bot');
      const [s, v, i] = e.line.split('.') as [SpeechSituation, VoiceKey, string];
      expect(v).toBe(VOICE_OF[speaker.bot!.personality]);
      expect(e.situation).toBe(s);
      const target = e.to ? actorById(w, e.to)!.name : undefined;
      expect(e.text).toBe(fillPhrase(PHRASES[s][v][Number(i)], { objetivo: target }));
    }
  });

  it('las frases no cambian la partida', () => {
    const actors = [human('h'), ...chatty(8)];
    let spoken = 0;
    const where = (speech: boolean) => {
      const w = start(actors, { speech });
      spoken += listen(w, 120_000).length;
      return w.actors.map((a) => ({ id: a.id, x: a.x, y: a.y, route: a.route, action: a.mind?.action ?? null }));
    };
    expect(where(true)).toEqual(where(false));
    expect(spoken).toBeGreaterThan(0);
  });

  it('solo hablan los bots: un humano con piloto automático nunca', () => {
    const w = start([human('h'), human('ausente', 'titan', 3), ...chatty(6)]);
    setConnected(w, 'ausente', false);
    const ausente = actorById(w, 'ausente')!;
    expect(ausente.control).toBe('piloto');
    want(w, ausente, 'acecho', 'h', 1);
    expect(trySpeak(w, ausente)).toBeNull();
    expect(listen(w, 180_000).some((e) => e.actorId === 'ausente')).toBe(false);
  });

  it('silencio con speech: false', () => {
    const w = start([human('h'), ...chatty(8)], { speech: false });
    const b = actorById(w, 'b0')!;
    want(w, b, 'acecho', 'h', 1);
    expect(trySpeak(w, b)).toBeNull();
    expect(listen(w, 180_000)).toEqual([]);
  });

  it('separación global y enfriamiento por bot', () => {
    const w = start([human('h'), ...chatty(23)], {}, 'coro', 128);
    const said = listen(w, 180_000);
    expect(said.length).toBeGreaterThan(3);
    expect(said.length).toBeLessThanOrEqual(31);
    for (let i = 1; i < said.length; i++) expect(said[i].t - said[i - 1].t).toBeGreaterThanOrEqual(SPEECH_GAP_MS);
    const last = new Map<string, number>();
    for (const e of said) {
      const prev = last.get(e.actorId);
      const soc = PERSONALITIES[actorById(w, e.actorId)!.bot!.personality].weights.sociability;
      if (prev != null) expect(e.t - prev).toBeGreaterThanOrEqual(cooldownMs(soc));
      last.set(e.actorId, e.t);
    }
  });

  it('acecho con el nombre del objetivo', () => {
    const w = start([human('presa'), bot('b', { personality: 'agresivo' })]);
    const b = actorById(w, 'b')!;
    want(w, b, 'acecho', 'presa', 1);
    const e = trySpeak(w, b);
    expect(e).toMatchObject({ type: 'dice', actorId: 'b', situation: 'acecho', to: 'presa' });
    expect((e as Dice).text).toContain(actorById(w, 'presa')!.name);
    expect((e as Dice).text).not.toContain('{');
  });

  it('descarta la frase si el objetivo ya no está', () => {
    const w = start([human('presa'), human('otra', 'titan', 3), bot('b', { personality: 'agresivo' })]);
    const b = actorById(w, 'b')!;
    want(w, b, 'acecho', 'presa', 1);
    eliminate(w, 'presa', 'abandono');
    expect(w.phase).toBe('en_curso');
    expect(trySpeak(w, b)).toBeNull();
  });

  it('el bot que gana lo celebra en voz alta', () => {
    const w = start([human('h1'), human('h2', 'titan', 3), bot('b', { personality: 'impredecible' })]);
    eliminate(w, 'h1', 'abandono');
    const ev = eliminate(w, 'h2', 'abandono');
    expect(w.winnerId).toBe('b');
    const v = ev.find((e): e is Dice => e.type === 'dice');
    expect(v).toMatchObject({ type: 'dice', actorId: 'b', situation: 'victoria', to: null });
    // Si gana un humano, nadie habla por él.
    const w2 = start([human('h1'), bot('b', { personality: 'impredecible' }), bot('c', { personality: 'agresivo' })]);
    eliminate(w2, 'b', 'abandono');
    expect(eliminate(w2, 'c', 'abandono').some((e) => e.type === 'dice' && e.situation === 'victoria')).toBe(false);
  });

  it('canHear: con niebla oye quien ve al bot; los caídos y los espectadores, todo', () => {
    const w = start([human('cerca'), human('lejos', 'equilibrado', 3), human('caido', 'equilibrado', 4), bot('b', { personality: 'agresivo' }), bot('c')], { visibility: 'niebla' });
    const c = w.map.center;
    Object.assign(actorById(w, 'b')!, { x: c.x, y: c.y, route: null });
    Object.assign(actorById(w, 'cerca')!, { x: c.x + 3, y: c.y, route: null });
    Object.assign(actorById(w, 'lejos')!, { x: c.x + 40, y: c.y, route: null });
    eliminate(w, 'caido', 'abandono');
    expect(canHear(w, 'u-cerca', 'b')).toBe(true);
    expect(canHear(w, 'u-lejos', 'b')).toBe(false);
    expect(canHear(w, 'u-caido', 'b')).toBe(true);
    expect(canHear(w, null, 'b')).toBe(true);
    // Sin niebla, todos ven a todos.
    w.rules.visibility = 'visible';
    expect(canHear(w, 'u-lejos', 'b')).toBe(true);
  });

  it('una frase dirigida a alguien solo la oye quien ve también a ese alguien', () => {
    // Con niebla, decir «Corre si quieres, Tal» delante de quien no ve a Tal le diría dónde está.
    const w = start([human('cerca'), human('ambos', 'equilibrado', 3), human('lejos', 'equilibrado', 4), bot('b', { personality: 'agresivo' }), bot('t')], { visibility: 'niebla' });
    const c = w.map.center;
    Object.assign(actorById(w, 'b')!, { x: c.x, y: c.y, route: null });
    Object.assign(actorById(w, 't')!, { x: c.x + 12, y: c.y, route: null });
    Object.assign(actorById(w, 'cerca')!, { x: c.x - 3, y: c.y, route: null });
    Object.assign(actorById(w, 'ambos')!, { x: c.x + 6, y: c.y, route: null });
    Object.assign(actorById(w, 'lejos')!, { x: c.x - 40, y: c.y, route: null });
    expect(canHear(w, 'u-cerca', 'b') && !canHear(w, 'u-cerca', 't')).toBe(true);
    expect(canHear(w, 'u-ambos', 'b') && canHear(w, 'u-ambos', 't')).toBe(true);
    const line = (situation: SpeechSituation, to: string | null): Dice => ({ type: 'dice', actorId: 'b', situation, line: `${situation}.fiero.0`, text: 'frase', to });
    expect(hearsLine(w, 'u-cerca', line('acecho', 't'))).toBe(false);
    expect(hearsLine(w, 'u-ambos', line('acecho', 't'))).toBe(true);
    expect(hearsLine(w, 'u-cerca', line('region', null))).toBe(true);
    expect(hearsLine(w, 'u-lejos', line('region', null))).toBe(false);
    // Que alguien ha caído lo sabe toda la arena: despedirlo no delata nada.
    eliminate(w, 't', 'abandono');
    expect(hearsLine(w, 'u-cerca', line('caida', 't'))).toBe(true);
  });

  it('una partida guardada sin estado de habla se recupera y los bots siguen hablando', () => {
    const w = start([human('h'), ...chatty(8)], { dayMs: 20_000, nightMs: 10_000 });
    listen(w, 30_000);
    const old = serializeWorld(w) as unknown as { speechAt?: number; actors: Record<string, unknown>[] };
    delete old.speechAt;
    for (const a of old.actors) delete a.talk;
    const back = restoreWorld(old as never);
    expect(listen(back, 90_000).length).toBeGreaterThan(0);
  });
});
