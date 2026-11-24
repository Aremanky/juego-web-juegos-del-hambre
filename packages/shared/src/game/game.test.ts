import { describe, expect, it } from 'vitest';
import {
  ABILITY_KEYS,
  ARCHETYPES,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_BUDGETS,
  BOT_ACTION_KEYS,
  CharacterSchema,
  DEFAULT_ROOM_CONFIG,
  DIFFICULTY_KEYS,
  PERSONALITY_KEYS,
  PLAYSTYLE_KEYS,
  PLAYSTYLES,
  Rng,
  avatarSvg,
  buildCost,
  computeDerived,
  costToReach,
  createBot,
  defaultCharacter,
  mergeRoomConfig,
  summarizeBuild,
  RoomCodeSchema,
} from '../index.js';

describe('coste de atributos', () => {
  it('sigue la escala creciente 1/2/3', () => {
    expect(costToReach(1)).toBe(0);
    expect(costToReach(6)).toBe(5);
    expect(costToReach(8)).toBe(9);
    expect(costToReach(10)).toBe(15);
  });

  it('todos a 5 cuestan exactamente 28', () => {
    expect(buildCost({ potencia: 5, reflejos: 5, aguante: 5, instinto: 5, sigilo: 5, ingenio: 5, carisma: 5 })).toBe(28);
  });

  it('todos los arquetipos cuestan 28 y son válidos', () => {
    for (const a of ARCHETYPES) {
      const s = summarizeBuild({ attributes: a.attributes, abilities: a.abilities, defect: null }, 28);
      expect(s.cost, a.key).toBe(28);
      expect(s.issues, a.key).toEqual([]);
    }
  });
});

describe('estadísticas derivadas', () => {
  it('cada atributo cambia al menos una derivada (sin atributos decorativos)', () => {
    const base = { potencia: 5, reflejos: 5, aguante: 5, instinto: 5, sigilo: 5, ingenio: 5, carisma: 5 };
    const d0 = computeDerived({ attributes: base });
    for (const k of ATTRIBUTE_KEYS) {
      const d1 = computeDerived({ attributes: { ...base, [k]: 9 } });
      const changed = Object.keys(d0).filter((key) => (d0 as never)[key] !== (d1 as never)[key]);
      expect(changed.length, k).toBeGreaterThanOrEqual(3);
    }
  });

  it('valores razonables en los extremos', () => {
    const min = computeDerived({ attributes: { potencia: 1, reflejos: 1, aguante: 1, instinto: 1, sigilo: 1, ingenio: 1, carisma: 1 } });
    const max = computeDerived({ attributes: { potencia: 10, reflejos: 10, aguante: 10, instinto: 10, sigilo: 10, ingenio: 10, carisma: 10 } });
    expect(min.maxHp).toBe(78);
    expect(max.maxHp).toBe(150);
    expect(max.rangedAccuracy).toBeLessThanOrEqual(0.95);
    expect(min.moveSpeed).toBeGreaterThan(0.9);
    expect(max.moveSpeed).toBeCloseTo(1.6, 2);
  });

  it('defectos y rasgos aplican sus penalizaciones', () => {
    const attrs = { potencia: 5, reflejos: 5, aguante: 5, instinto: 5, sigilo: 5, ingenio: 5, carisma: 5 };
    const base = computeDerived({ attributes: attrs });
    expect(computeDerived({ attributes: attrs, defect: 'miope' }).visionRadius).toBeLessThan(base.visionRadius);
    expect(computeDerived({ attributes: attrs, trait: 'metabolismoRapido' }).hungerRate).toBeGreaterThan(base.hungerRate);
    expect(computeDerived({ attributes: attrs, district: 12 }).maxHp).toBeGreaterThan(base.maxHp);
  });
});

describe('validación de personaje', () => {
  it('detecta exceso de presupuesto y requisitos', () => {
    const c = defaultCharacter();
    c.attributes = { ...c.attributes, potencia: 10 };
    c.abilities = ['showman', 'forrajeo'];
    const s = summarizeBuild(c, 28);
    expect(s.valid).toBe(false);
    expect(s.issues.map((i) => i.code).sort()).toEqual(['ability_requirement', 'over_budget']);
  });

  it('el defecto concede 2 puntos extra', () => {
    const c = defaultCharacter();
    c.attributes = { ...c.attributes, potencia: 6 }; // 29 puntos
    expect(summarizeBuild(c, 28).valid).toBe(false);
    expect(summarizeBuild({ ...c, defect: 'ruidoso' }, 28).valid).toBe(true);
  });

  it('el esquema limpia texto y rechaza datos inválidos', () => {
    const c = defaultCharacter({ name: '  Kira \n la   Roja ' });
    expect(CharacterSchema.parse(c).name).toBe('Kira la Roja');
    expect(CharacterSchema.safeParse({ ...c, abilities: ['carrera'] }).success).toBe(false);
    expect(CharacterSchema.safeParse({ ...c, color: 'red' }).success).toBe(false);
  });
});

describe('fábrica de bots', () => {
  it('genera builds válidos para todas las combinaciones', () => {
    const rng = new Rng('test-bots');
    for (const budget of ATTRIBUTE_BUDGETS) {
      for (const personality of PERSONALITY_KEYS) {
        for (const playstyle of PLAYSTYLE_KEYS) {
          const bot = createBot({ rng, budget, difficulty: rng.pick(DIFFICULTY_KEYS), gender: rng.pick(['M', 'F'] as const), district: null, takenNames: new Set(), personality, playstyle });
          expect(CharacterSchema.safeParse(bot.character).success).toBe(true);
          const s = summarizeBuild(bot.character, budget);
          expect(s.issues, `${personality}/${playstyle}/${budget}`).toEqual([]);
          expect(s.remaining).toBeLessThanOrEqual(2);
          expect(new Set(bot.character.abilities).size).toBe(2);
          expect(ABILITY_KEYS).toContain(bot.character.abilities[0]);
        }
      }
    }
  });

  it('las personalidades sesgan los atributos', () => {
    const rng = new Rng('bias');
    let aggrPot = 0;
    let diploCar = 0;
    for (let i = 0; i < 50; i++) {
      aggrPot += createBot({ rng, budget: 28, difficulty: 'normal', gender: 'M', district: null, takenNames: new Set(), personality: 'agresivo', playstyle: 'cazador' }).character.attributes.potencia;
      diploCar += createBot({ rng, budget: 28, difficulty: 'normal', gender: 'F', district: null, takenNames: new Set(), personality: 'manipulador', playstyle: 'diplomatico' }).character.attributes.carisma;
    }
    expect(aggrPot / 50).toBeGreaterThan(5.5);
    expect(diploCar / 50).toBeGreaterThan(5.5);
  });

  it('no repite nombres ocupados', () => {
    const rng = new Rng('names');
    const taken = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const b = createBot({ rng, budget: 28, difficulty: 'normal', gender: 'F', district: null, takenNames: taken });
      expect(taken.has(b.character.name.toLowerCase())).toBe(false);
      taken.add(b.character.name.toLowerCase());
    }
  });
});

describe('estilos de juego', () => {
  it('cada estilo sesga las acciones de la IA con valores moderados', () => {
    for (const k of PLAYSTYLE_KEYS) {
      for (const [action, v] of Object.entries(PLAYSTYLES[k].actionBias)) {
        expect(BOT_ACTION_KEYS as readonly string[]).toContain(action);
        expect(v).toBeGreaterThanOrEqual(0.5);
        expect(v).toBeLessThanOrEqual(1.5);
      }
    }
    expect(PLAYSTYLES.equilibrado.actionBias).toEqual({});
    expect(PLAYSTYLES.cazador.actionBias.acechar).toBeGreaterThan(1);
    expect(PLAYSTYLES.superviviente.actionBias.esconderse).toBeGreaterThan(1);
    expect(PLAYSTYLES.saqueador.actionBias.obelisco).toBeGreaterThan(1);
  });
});

describe('utilidades', () => {
  it('el RNG es determinista y reanudable', () => {
    const a = new Rng('x');
    const seq = [a.next(), a.next(), a.next()];
    const b = new Rng('x');
    expect([b.next(), b.next(), b.next()]).toEqual(seq);
    const c = new Rng(a.state());
    expect(c.next()).toBe(a.next());
  });

  it('el avatar es SVG determinista', () => {
    expect(avatarSvg('abc')).toBe(avatarSvg('abc'));
    expect(avatarSvg('abc')).not.toBe(avatarSvg('abd'));
    expect(avatarSvg('abc').startsWith('<svg')).toBe(true);
  });

  it('configuración de sala: parche sin perder valores', () => {
    const c = mergeRoomConfig(DEFAULT_ROOM_CONFIG, { pace: 'ilimitada' });
    expect(c.pace).toBe('ilimitada');
    expect(c.maxParticipants).toBe(DEFAULT_ROOM_CONFIG.maxParticipants);
    expect(() => mergeRoomConfig(DEFAULT_ROOM_CONFIG, { maxParticipants: 99 })).toThrow();
  });

  it('códigos de sala normalizados', () => {
    expect(RoomCodeSchema.parse(' abc234 ')).toBe('ABC234');
    expect(RoomCodeSchema.safeParse('ABC10O').success).toBe(false);
  });
});
