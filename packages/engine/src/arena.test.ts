import { describe, expect, it } from 'vitest';
import { ARCHETYPES, DIFFICULTIES, dayPhase, defaultCharacter, type BotSettings, type Character } from '@ceniza/shared';
import {
  SIM_BUDGET_PER_TICK,
  T,
  actorById,
  aiStats,
  computeView,
  createWorld,
  estimateOdds,
  generateMap,
  hashWorld,
  perceive,
  positionAt,
  regionAt,
  restoreWorld,
  serializeWorld,
  snapshotFor,
  spawnRing,
  think,
  tick,
  tileAt,
  visionAt,
  type ActorInit,
  type World,
  type WorldRules,
} from './index.js';

const RULES: WorldRules = { visibility: 'visible', pauseVote: 'mayoria', disconnectPolicy: 'piloto', disconnectGraceMs: 60_000, presentationMs: 100, countdownMs: 100 };

function char(name: string, archetype?: string, over: Partial<Character> = {}): Character {
  const base = defaultCharacter({ name, seed: name });
  const a = ARCHETYPES.find((x) => x.key === archetype);
  return { ...base, ...(a ? { attributes: { ...a.attributes }, abilities: [...a.abilities], trait: a.trait } : {}), ...over };
}

function bot(id: string, archetype: string, settings: Partial<BotSettings>, district = 1): ActorInit {
  return { id, kind: 'bot', userId: null, character: char(id, archetype), district, gender: 'M', bot: { difficulty: 'normal', personality: 'estratega', playstyle: 'equilibrado', ...settings } };
}

function human(id: string, archetype?: string, district = 2): ActorInit {
  return { id, kind: 'human', userId: `u-${id}`, character: char(id, archetype), district, gender: 'F' };
}

function start(actors: ActorInit[], rules: Partial<WorldRules> = {}, seed = 'arena', size = 96): World {
  const w = createWorld({ seed, mapSize: size, actors, rules: { ...RULES, ...rules } });
  const users = actors.filter((a) => a.userId).map((a) => a.userId!);
  for (let now = 100; w.phase !== 'en_curso'; now += 100) tick(w, now, users);
  return w;
}

function run(w: World, ms: number) {
  const users = w.actors.filter((a) => a.userId).map((a) => a.userId!);
  for (let i = 0; i < ms / 100; i++) tick(w, 0, users);
}

describe('generador de arena (fase 7)', () => {
  it('es determinista y cambia con la semilla', () => {
    const a = generateMap('semilla', 96);
    const b = generateMap('semilla', 96);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
    expect(a.pois).toEqual(b.pois);
    expect(Array.from(generateMap('otra', 96).tiles)).not.toEqual(Array.from(a.tiles));
  });

  it('tiene ríos, caminos, pantanos o asentamientos y puntos de interés con nombre propio', () => {
    let withRivers = 0;
    for (const seed of ['uno', 'dos', 'tres', 'cuatro', 'cinco']) {
      const m = generateMap(seed, 128);
      const count = (t: number) => m.tiles.reduce((n, v) => n + (v === t ? 1 : 0), 0);
      if (count(T.RIO) > 10) withRivers++;
      expect(count(T.CAMINO)).toBeGreaterThan(20);
      expect(m.pois[0]).toMatchObject({ id: 0, kind: 'obelisco', x: m.center.x, y: m.center.y });
      expect(m.pois.length).toBeGreaterThanOrEqual(8);
      expect(new Set(m.pois.map((p) => p.name)).size).toBe(m.pois.length);
      for (const p of m.pois.slice(1)) {
        expect([T.AGUA, T.CUMBRE, T.PLAZA]).not.toContain(tileAt(m, p.x, p.y));
        expect(regionAt(m, p.x, p.y)).toBe(p.id);
      }
      // Cada poblado y ruina tiene un camino que llega a menos de 3 casillas.
      for (const p of m.pois.filter((q) => q.kind === 'poblado' || q.kind === 'ruinas')) {
        let near = false;
        for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3 && !near; dx++) near = tileAt(m, p.x + dx, p.y + dy) === T.CAMINO;
        expect(near, p.name).toBe(true);
      }
      for (const s of spawnRing(m, 24)) expect([T.AGUA, T.CUMBRE, T.MONTANA, T.RIO]).not.toContain(tileAt(m, s.x, s.y));
    }
    expect(withRivers).toBeGreaterThanOrEqual(3);
  });

  it('guarda relieve y puntos de interés en la instantánea; las partidas de la 0.5 se recuperan sin ellos', () => {
    const w = start([human('a'), human('b')]);
    const back = restoreWorld(serializeWorld(w));
    expect(Array.from(back.map.heights)).toEqual(Array.from(w.map.heights));
    expect(back.map.pois).toEqual(w.map.pois);
    // Recorridos de ríos y caminos para dibujarlos como curvas.
    expect(back.map.rivers).toEqual(w.map.rivers);
    expect(back.map.roads).toEqual(w.map.roads);
    expect(w.map.roads.length).toBeGreaterThan(0);
    const old = serializeWorld(w) as unknown as { map: Record<string, unknown>; actors: Record<string, unknown>[] };
    delete old.map.heights;
    delete old.map.pois;
    delete old.map.rivers;
    delete old.map.roads;
    for (const a of old.actors) delete a.explored;
    const legacy = restoreWorld(old as never);
    expect(legacy.map.heights.length).toBe(w.map.size ** 2);
    expect(legacy.map.pois).toEqual([]);
    expect(legacy.map.roads).toEqual([]);
    run(legacy, 1000); // no descubre nada ni falla sin regiones
    expect(legacy.actors[0].explored).toBe(1);
  });
});

describe('día, noche y exploración', () => {
  it('ciclo de día y noche con transición', () => {
    const c = { dayMs: 10_000, nightMs: 5_000, startAt: 1_000 };
    expect(dayPhase(500, c)).toMatchObject({ night: false, index: 1, darkness: 0 });
    expect(dayPhase(11_500, c)).toMatchObject({ night: true, index: 1 });
    expect(dayPhase(16_500, c)).toMatchObject({ night: false, index: 2 });
    const dusk = dayPhase(10_500, c);
    expect(dusk.night).toBe(false);
    expect(dusk.darkness).toBeGreaterThan(0);
    expect(dusk.darkness).toBeLessThan(1);
  });

  it('de noche se ve menos y la niebla lo respeta; avisa al anochecer y al amanecer', () => {
    const w = start([human('a'), human('b')], { visibility: 'niebla', dayMs: 2_000, nightMs: 1_000 });
    const [a] = w.actors;
    const day = visionAt(w, a, positionAt(a, w.t));
    const events: string[] = [];
    const users = ['u-a', 'u-b'];
    for (let i = 0; i < 25; i++) events.push(...tick(w, 0, users).map((e) => e.type));
    expect(events).toContain('anochece');
    expect(w.night).toBe(true);
    expect(visionAt(w, a, positionAt(a, w.t))).toBeLessThan(day * 0.75);
    expect(computeView(w, 'u-a').actors.find((x) => x.id === 'a')!.vision).toBeLessThan(day * 0.75);
    for (let i = 0; i < 12; i++) events.push(...tick(w, 0, users).map((e) => e.type));
    expect(events).toContain('amanece');
    expect(snapshotFor(w, 'm', 'u-a', 0, users).day).toEqual({ dayMs: 2_000, nightMs: 1_000, startAt: 200 });
  });

  it('entrar en una región la descubre (solo para quien entra)', () => {
    const w = start([human('a'), human('b')]);
    const a = w.actors[0];
    const target = w.map.pois[1];
    a.x = target.x;
    a.y = target.y;
    a.route = null;
    const ev = tick(w, 0, ['u-a', 'u-b']);
    expect(ev).toContainEqual({ type: 'descubre', actorId: 'a', region: target.id });
    expect(a.explored & (1 << target.id)).toBeTruthy();
    expect(computeView(w, 'u-a').actors.find((x) => x.id === 'a')!.explored).toBe(a.explored);
    expect(computeView(w, 'u-b').actors.find((x) => x.id === 'a')!.explored).toBeNull();
  });
});

describe('IA de los bots (fase 6)', () => {
  it('los bots se mueven solos, con intenciones válidas, y la partida sigue siendo determinista', () => {
    const actors = [human('h'), ...Array.from({ length: 7 }, (_, i) => bot(`b${i}`, ARCHETYPES[i].key, { personality: (['agresivo', 'cauteloso', 'explorador', 'estratega', 'pacifico', 'impredecible', 'desconfiado'] as const)[i] }, i + 2))];
    const w1 = start(actors);
    const w2 = start(actors);
    const spawn = w1.actors.map((a) => ({ x: a.x, y: a.y }));
    run(w1, 30_000);
    run(w2, 30_000);
    expect(hashWorld(w1)).toBe(hashWorld(w2));
    const moved = w1.actors.filter((a, i) => a.kind === 'bot' && Math.hypot(positionAt(a, w1.t).x - spawn[i].x, positionAt(a, w1.t).y - spawn[i].y) > 2);
    expect(moved.length).toBeGreaterThanOrEqual(6);
    for (const a of w1.actors.filter((x) => x.kind === 'bot')) expect(a.mind).toBeTruthy();
  });

  it('al empezar, el agresivo corre al Obelisco y el cauteloso se aparta', () => {
    const w = start([human('h'), bot('fiero', 'titan', { personality: 'agresivo', difficulty: 'experto' }, 3), bot('prudente', 'superviviente', { personality: 'cauteloso', difficulty: 'experto' }, 4)]);
    run(w, 8_000);
    const dist = (id: string) => {
      const p = positionAt(actorById(w, id)!, w.t);
      return Math.hypot(p.x - w.map.center.x, p.y - w.map.center.y);
    };
    expect(actorById(w, 'fiero')!.mind!.action).toBe('obelisco');
    expect(dist('fiero')).toBeLessThan(dist('prudente'));
  });

  it('huye de quien le supera y acecha a quien cree poder vencer', () => {
    const w = start([human('titan', 'titan'), bot('debil', 'diplomatico', { personality: 'cauteloso', difficulty: 'experto' }, 5), bot('cazador', 'cazador', { personality: 'agresivo', difficulty: 'experto' }, 6), human('presa', 'diplomatico', 7)]);
    run(w, 61_000); // pasada la carrera al Obelisco
    const put = (id: string, x: number, y: number) => {
      const a = actorById(w, id)!;
      a.x = x;
      a.y = y;
      a.route = null;
    };
    const c = w.map.center;
    put('titan', c.x, c.y);
    put('debil', c.x + 3, c.y);
    put('presa', c.x - 20, c.y + 20);
    put('cazador', c.x - 23, c.y + 20);
    think(w, actorById(w, 'debil')!);
    think(w, actorById(w, 'cazador')!);
    const debil = actorById(w, 'debil')!;
    expect(debil.mind!.action).toBe('huir');
    expect(Math.hypot(debil.mind!.goal!.x - c.x, debil.mind!.goal!.y - c.y)).toBeGreaterThan(6);
    const caz = actorById(w, 'cazador')!;
    expect(caz.mind!.action).toBe('acechar');
    expect(Math.hypot(caz.mind!.goal!.x - (c.x - 20), caz.mind!.goal!.y - (c.y + 20))).toBeLessThanOrEqual(3);
  });

  it('con niebla no reacciona a lo que no ve, y el fácil olvida al minuto', () => {
    const w = start([human('titan', 'titan'), bot('torpe', 'diplomatico', { personality: 'cauteloso', difficulty: 'facil' }, 5)], { visibility: 'niebla' });
    run(w, 61_000);
    const t = actorById(w, 'titan')!;
    const b = actorById(w, 'torpe')!;
    const c = w.map.center;
    Object.assign(t, { x: c.x, y: c.y, route: null });
    Object.assign(b, { x: c.x + 30, y: c.y, route: null });
    b.mind = null; // sin recuerdos previos de la partida
    expect(perceive(w, b).map((s) => s.o.id)).not.toContain('titan');
    think(w, b);
    expect(b.mind!.seen.titan).toBeUndefined();
    expect(b.mind!.action).not.toBe('huir');
    Object.assign(b, { x: c.x + 3, y: c.y, route: null });
    think(w, b);
    expect(b.mind!.seen.titan).toBeDefined();
    Object.assign(b, { x: c.x + 40, y: c.y, route: null });
    w.t += 61_000;
    think(w, b);
    expect(b.mind!.seen.titan).toBeUndefined();
  });

  it('contra humanos estima sin ver su build secreta', () => {
    const experto = DIFFICULTIES.experto;
    const odds = (arch: string, kind: 'human' | 'bot') => {
      const rival = kind === 'human' ? human('h', arch, 5) : bot('h', arch, {}, 5);
      const w = start([rival, bot('b', 'cazador', { personality: 'agresivo', difficulty: 'experto' }, 6)]);
      const b = actorById(w, 'b')!;
      b.mind = { action: 'esperar', goal: null, targetId: null, since: w.t, seen: {}, odds: {} };
      return estimateOdds(w, b, actorById(w, 'h')!, experto);
    };
    // Del humano solo se sabe lo público (su distrito): un titán y un diplomático le parecen iguales.
    expect(odds('titan', 'human')).toBe(odds('diplomatico', 'human'));
    // Los bots se ven completos en el lobby, así que contra ellos sí cuenta su build.
    expect(odds('titan', 'bot')).not.toBe(odds('diplomatico', 'bot'));
  });

  it('el cazador acecha y el superviviente se aparta ante la misma presa', () => {
    // Dos mundos idénticos salvo el estilo del bot que ve a una presa débil (bot, así su build es pública).
    const action = (playstyle: BotSettings['playstyle']) => {
      const w = start([bot('cazadora', 'cazador', { personality: 'estratega', difficulty: 'experto', playstyle }, 3), bot('presa', 'diplomatico', { personality: 'pacifico' }, 4)]);
      run(w, 61_000); // pasada la carrera al Obelisco
      const c = w.map.center;
      Object.assign(actorById(w, 'presa')!, { x: c.x, y: c.y, route: null });
      Object.assign(actorById(w, 'cazadora')!, { x: c.x + 3, y: c.y, route: null });
      const a = actorById(w, 'cazadora')!;
      think(w, a);
      return a.mind!.action;
    };
    expect(action('cazador')).toBe('acechar');
    expect(action('superviviente')).not.toBe('acechar');
  });

  it('el saqueador corre al Obelisco y el superviviente no', () => {
    const dist = (playstyle: BotSettings['playstyle']) => {
      // Una personalidad que duda entre el Obelisco y explorar: ahí es donde el estilo decide.
      const w = start([human('h'), bot('b', 'explorador', { personality: 'manipulador', difficulty: 'experto', playstyle }, 3)]);
      run(w, 6_000);
      const p = positionAt(actorById(w, 'b')!, w.t);
      return Math.hypot(p.x - w.map.center.x, p.y - w.map.center.y);
    };
    expect(dist('saqueador')).toBeLessThan(dist('superviviente'));
  });

  it('ningún tick gasta más simulaciones que el presupuesto', () => {
    const personalities = ['agresivo', 'cauteloso', 'estratega', 'pacifico', 'explorador', 'impredecible'] as const;
    const actors = [human('h'), ...Array.from({ length: 23 }, (_, i) => bot(`b${i}`, ARCHETYPES[i % 8].key, { personality: personalities[i % 6], difficulty: (['facil', 'normal', 'dificil', 'experto'] as const)[i % 4] }, (i % 12) + 1))];
    const w = start(actors, {}, 'carga', 128);
    Object.assign(aiStats, { ticks: 0, maxSimsInTick: 0, provisional: 0 });
    run(w, 30_000);
    expect(aiStats.ticks).toBeGreaterThan(0);
    expect(aiStats.maxSimsInTick).toBeGreaterThan(0);
    expect(aiStats.maxSimsInTick).toBeLessThanOrEqual(SIM_BUDGET_PER_TICK);
  });

  it('23 bots en el mapa grande cuestan poco por tick', () => {
    const personalities = ['agresivo', 'cauteloso', 'estratega', 'pacifico', 'explorador', 'impredecible'] as const;
    const actors = [human('h'), ...Array.from({ length: 23 }, (_, i) => bot(`b${i}`, ARCHETYPES[i % 8].key, { personality: personalities[i % 6], difficulty: (['facil', 'normal', 'dificil', 'experto'] as const)[i % 4] }, (i % 12) + 1))];
    const w = start(actors, {}, 'carga', 128);
    const t0 = Date.now();
    run(w, 120_000);
    const perTick = (Date.now() - t0) / 1200;
    expect(perTick).toBeLessThan(5);
  });
});
