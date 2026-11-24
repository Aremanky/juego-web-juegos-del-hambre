import { ARCHETYPES, Rng, WEAPONS, computeDerived, situationalStats, type DerivedInput, type Situation } from '@ceniza/shared';
import { describe, expect, it } from 'vitest';
import { ARCHETYPE_CONTENDERS, runBalance, runMatchups, SCENARIOS, warmUpCombat } from './balance.js';
import {
  createFighter,
  detectionChance,
  fight,
  fighterStats,
  fleeChance,
  hitChance,
  resolveRound,
  startCombat,
  type FighterInit,
} from './combat.js';

const arch = (key: string): DerivedInput => {
  const a = ARCHETYPES.find((x) => x.key === key)!;
  return { attributes: a.attributes, abilities: a.abilities, trait: a.trait };
};
const init = (key: string, extra: Partial<FighterInit> = {}): FighterInit => ({ id: key, name: key, build: arch(key), weapon: WEAPONS.cuchillo, ...extra });

describe('combate por rondas', () => {
  it('es determinista con la misma semilla', () => {
    const run = () => {
      const rng = new Rng('combate');
      return fight(startCombat(createFighter(init('cazador')), createFighter(init('sombra')), {}, rng), rng).log;
    };
    expect(run()).toEqual(run());
  });

  it('el cuerpo a cuerpo tiene que acercarse antes de golpear', () => {
    const rng = new Rng('distancia');
    const c = startCombat(createFighter(init('titan')), createFighter(init('equilibrado')), { distance: 'lejos' }, rng);
    const ev = resolveRound(c, [{ type: 'atacar' }, { type: 'defender' }], rng);
    expect(ev[0]).toMatchObject({ type: 'distancia', distance: 'cerca', by: 0 });
    expect(c.fighters[1].hp).toBe(c.fighters[1].maxHp);
  });

  it('esquivar multiplica la esquiva ×2,5', () => {
    const c = startCombat(createFighter(init('titan')), createFighter(init('sombra')), { distance: 'cerca' }, new Rng('x'));
    const dodge = computeDerived(arch('sombra')).dodgeChance;
    expect(hitChance(c, 0, null)).toBeCloseTo(1 - dodge, 5);
    expect(hitChance(c, 0, 'esquivar')).toBeCloseTo(1 - dodge * 2.5, 5);
  });

  it('la sorpresa da ventaja a quien embosca', () => {
    let withSurprise = 0;
    let without = 0;
    for (let n = 0; n < 300; n++) {
      const r1 = new Rng('s' + n);
      if (fight(startCombat(createFighter(init('equilibrado')), createFighter(init('equilibrado')), { surprise: 0 }, r1), r1).winner === 0) withSurprise++;
      const r2 = new Rng('s' + n);
      if (fight(startCombat(createFighter(init('equilibrado')), createFighter(init('equilibrado')), { distance: 'cerca' }, r2), r2).winner === 0) without++;
    }
    expect(withSurprise).toBeGreaterThan(without + 40);
  });

  it('Último aliento salva una vez de un golpe mortal', () => {
    for (let n = 0; n < 50; n++) {
      const rng = new Rng('aliento' + n);
      const c = startCombat(createFighter(init('titan', { weapon: WEAPONS.hacha })), createFighter(init('superviviente', { hp: 1 })), { distance: 'cerca' }, rng);
      resolveRound(c, [{ type: 'atacar' }, { type: 'defender' }], rng);
      if (c.log.some((e) => e.type === 'golpe' && e.by === 0)) {
        expect(c.log.some((e) => e.type === 'ultimoAliento')).toBe(true);
        expect(c.over).toBe(false);
        expect(c.fighters[1].hp).toBe(1);
        return;
      }
    }
    throw new Error('el titán no acertó en 50 intentos');
  });

  it('Golpe brutal solo se usa una vez por combate', () => {
    const rng = new Rng('brutal');
    const c = startCombat(createFighter(init('titan')), createFighter(init('superviviente')), { distance: 'cerca' }, rng);
    for (let r = 0; r < 4 && !c.over; r++) resolveRound(c, [{ type: 'atacar', brutal: true }, { type: 'defender' }], rng);
    expect(c.log.filter((e) => e.type === 'golpe' && e.brutal).length).toBeLessThanOrEqual(1);
    expect(c.fighters[0].usedBrutal).toBe(true);
  });

  it('huida según el GDD: reflejos, terreno, carrera y salud baja', () => {
    const c = startCombat(createFighter(init('sombra', { terrain: 'bosque' })), createFighter(init('titan')), {}, new Rng('h'));
    // 0,35 + 0,05·(7 − 4) + bosque 0,10 + Carrera 0,25
    expect(fleeChance(c, 0)).toBeCloseTo(0.85, 5);
    expect(fleeChance(c, 0, false)).toBeCloseTo(0.6, 5);
    c.fighters[0].hp = 10;
    expect(fleeChance(c, 0, false)).toBeCloseTo(0.5, 5);
  });

  it('tregua solo si los dos la eligen', () => {
    const rng = new Rng('t');
    const c = startCombat(createFighter(init('diplomatico')), createFighter(init('ingeniero')), {}, rng);
    resolveRound(c, [{ type: 'tregua' }, { type: 'acercarse' }], rng);
    expect(c.over).toBe(false);
    resolveRound(c, [{ type: 'tregua' }, { type: 'tregua' }], rng);
    expect(c.over).toBe(true);
    expect(c.winner).toBeNull();
  });
});

describe('detección de ocultos', () => {
  const obs = (key: string, terrain: 'pradera' | 'denso' = 'pradera') => ({ build: arch(key), terrain });
  it('sigue la fórmula del GDD y depende del sigilo, la cobertura y la distancia', () => {
    const det = computeDerived(arch('explorador')).detectionPower;
    const st = computeDerived(arch('titan')).stealthPower;
    expect(detectionChance(obs('explorador'), { ...obs('titan'), moving: false }, 0)).toBeCloseTo(Math.min(0.95, 0.5 + (det - (st - 4)) / 20), 5);
    const open = detectionChance(obs('titan'), obs('sombra'), 3);
    const forest = detectionChance(obs('titan', 'denso'), obs('sombra', 'denso'), 3);
    expect(forest).toBeLessThan(open);
    expect(detectionChance(obs('titan'), obs('equilibrado'), 50)).toBe(0);
  });
});

describe('simulador de equilibrio', () => {
  const report = runBalance({ runs: 120 });
  const idx = (k: string) => report.contenders.findIndex((c) => c.key === k);
  const best = (s: string) => {
    const row = report.byScenario[report.scenarios.findIndex((x) => x.key === s)];
    return report.contenders[row.indexOf(Math.max(...row))].key;
  };

  it('ningún arquetipo se aleja de la media más de lo que permite el GDD (×0,5–×1,5)', () => {
    for (const v of report.overall) {
      expect(v / report.mean).toBeGreaterThan(0.75);
      expect(v / report.mean).toBeLessThan(1.3);
    }
  });

  it('cada estilo tiene su terreno', () => {
    expect(best('abierto')).toBe('titan');
    expect(best('bosque')).toBe('sombra');
    expect(best('testigos')).toBe('diplomatico');
    expect(['ingeniero', 'superviviente']).toContain(best('desgaste'));
    const titan = idx('titan');
    expect(report.byScenario[3][titan]).toBeLessThan(report.byScenario[0][titan] - 0.25);
  });

  it('la prueba de fuerza del editor da un resultado por escenario y rival', () => {
    const m = runMatchups(ARCHETYPE_CONTENDERS[0], ARCHETYPE_CONTENDERS, 20);
    expect(m).toHaveLength(SCENARIOS.length);
    for (const row of m) for (const v of row) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });
});

describe('estadísticas del luchador', () => {
  it('fighterStats con caché da lo mismo que situationalStats', () => {
    // Rasgos y habilidades que dependen de la salud, el primer ataque, la carrera y la distancia.
    const a: DerivedInput = { ...arch('cazador'), trait: 'sangreFria', abilities: ['carrera', 'ojoCertero'], district: 1 };
    const b: DerivedInput = { ...arch('titan'), trait: 'temerario', abilities: ['resistenciaDolor', 'golpeBrutal'], district: 7 };
    const c = startCombat(
      createFighter({ id: 'a', name: 'a', build: a, weapon: WEAPONS.honda, terrain: 'bosque' }),
      createFighter({ id: 'b', name: 'b', build: b, weapon: WEAPONS.hacha, terrain: 'pradera' }),
      { distance: 'lejos' },
      new Rng('cache'),
    );
    let checked = 0;
    for (const i of [0, 1] as const) {
      const f = c.fighters[i];
      for (let hp = f.maxHp; hp >= 0; hp -= 7) {
        f.hp = hp;
        for (const attacked of [false, true]) {
          f.attacked = attacked;
          for (const extra of [undefined, {}, { sprinting: true }] as (Situation | undefined)[]) {
            const sit: Situation = { terrain: f.terrain, allies: f.allies, hpFraction: f.hp / f.maxHp, attack: f.weapon.range, weaponTags: f.weapon.tags, firstAttack: !f.attacked, ...extra };
            // Dos veces: la segunda sale de la caché.
            expect(fighterStats(c, i, extra)).toEqual(situationalStats(f.build, sit, f.base).stats);
            expect(fighterStats(c, i, extra)).toEqual(situationalStats(f.build, sit, f.base).stats);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });
});

describe('arranque del servidor', () => {
  it('warmUpCombat prepara el combate sin tocar ningún azar compartido', () => {
    const [you] = ARCHETYPE_CONTENDERS;
    const before = runMatchups(you, ARCHETYPE_CONTENDERS, 4, 'antes');
    expect(warmUpCombat()).toBeGreaterThan(0);
    expect(runMatchups(you, ARCHETYPE_CONTENDERS, 4, 'antes')).toEqual(before);
  });
});
