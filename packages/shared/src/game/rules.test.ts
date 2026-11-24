import { describe, expect, it } from 'vitest';
import { ABILITIES, ABILITY_KEYS } from './abilities.js';
import { ATTRIBUTE_KEYS, type Attributes } from './attributes.js';
import { explainDerived } from './breakdown.js';
import { computeDerived, type DerivedInput, type DerivedKey } from './derived.js';
import { DISTRICTS } from './districts.js';
import {
  SITUATIONAL_MODIFIERS,
  MOVEMENT_PERKS,
  situationalStats,
  terrainCosts,
  visionByTerrain,
} from './situational.js';
import { TERRAIN_KINDS, TERRAIN_RULES } from './terrain.js';
import { DEFECTS, DEFECT_KEYS, TRAITS, TRAIT_KEYS } from './traits.js';
import { Rng } from '../util/rng.js';

const five: Attributes = { potencia: 5, reflejos: 5, aguante: 5, instinto: 5, sigilo: 5, ingenio: 5, carisma: 5 };
const idx = (k: (typeof TERRAIN_KINDS)[number]) => TERRAIN_KINDS.indexOf(k);

describe('efectos según la situación', () => {
  it('cada efecto apunta a un distrito, habilidad o rasgo que existe', () => {
    for (const m of [...SITUATIONAL_MODIFIERS, ...MOVEMENT_PERKS]) {
      const s = m.source;
      if (s.kind === 'district') expect(DISTRICTS.some((d) => d.id === s.id)).toBe(true);
      if (s.kind === 'ability') expect(ABILITIES[s.key]).toBeDefined();
      if (s.kind === 'trait') expect(TRAITS[s.key]).toBeDefined();
      if (s.kind === 'defect') expect(DEFECTS[s.key]).toBeDefined();
    }
  });

  it('el coste de terreno cambia solo con los distritos que lo prometen', () => {
    const base = terrainCosts({ attributes: five });
    expect(base).toEqual(TERRAIN_KINDS.map((k) => TERRAIN_RULES[k].cost));
    expect(terrainCosts({ attributes: five, district: 7 })[idx('bosque')]).toBeCloseTo(1.4 / 1.12, 3);
    expect(terrainCosts({ attributes: five, district: 6 })[idx('pradera')]).toBeCloseTo(1 / 1.08, 3);
    expect(terrainCosts({ attributes: five, district: 4 })[idx('agua')]).toBe(1);
    const cumbres = terrainCosts({ attributes: five, district: 10 });
    expect([cumbres[idx('montana')], cumbres[idx('roca')], cumbres[idx('cumbre')]]).toEqual([1, 1, 1.5]);
    expect(terrainCosts({ attributes: five, district: 1 })).toEqual(base);
  });

  it('la visión depende del terreno y de la altura para el distrito X', () => {
    const v = computeDerived({ attributes: five }).visionRadius;
    const by = visionByTerrain({ attributes: five });
    expect(by[idx('denso')]).toBeCloseTo(v * 0.7, 2);
    expect(by[idx('pradera')]).toBeCloseTo(v, 2);
    expect(visionByTerrain({ attributes: five, district: 10 })[idx('montana')]).toBeCloseTo(v * 1.15 * 1.1, 1);
  });

  it('noche, salud baja y rasgos de combate', () => {
    const d = computeDerived({ attributes: five });
    const night = situationalStats({ attributes: five }, { night: true }).stats;
    expect(night.visionRadius).toBeCloseTo(d.visionRadius * d.nightVisionMult, 5);
    expect(night.stealthPower).toBe(d.stealthPower + 5);

    expect(situationalStats({ attributes: five }, { hpFraction: 0.2 }).stats.damageMult).toBeCloseTo(0.9);
    expect(situationalStats({ attributes: five, abilities: ['resistenciaDolor'] }, { hpFraction: 0.2 }).stats.damageMult).toBe(1);

    const tem = { attributes: five, trait: 'temerario' as const };
    expect(situationalStats(tem, { firstAttack: true }).stats.damageMult).toBeCloseTo(1.15);
    expect(situationalStats(tem, {}).stats.damageTakenMult).toBeCloseTo(1.15);

    const sol = { attributes: five, trait: 'solitario' as const };
    expect(situationalStats(sol, { allies: 0 }).stats.damageMult).toBeCloseTo(1.1);
    expect(situationalStats(sol, { allies: 1 }).stats.damageMult).toBe(1);

    const sf = { attributes: five, trait: 'sangreFria' as const };
    expect(situationalStats(sf, { hpFraction: 0.4 }).stats.hitBonus).toBeCloseTo(0.1);
    expect(situationalStats(sf, { hpFraction: 0.6 }).stats.hitBonus).toBe(0);

    const ojo = situationalStats({ attributes: five, abilities: ['ojoCertero'] }, { attack: 'lejos' }).stats;
    expect(ojo.critChance).toBeCloseTo(d.critChance + 0.1, 5);
  });

  it('Ojo certero suma precisión a distancia sin pasar del 95 %', () => {
    expect(computeDerived({ attributes: five, abilities: ['ojoCertero'] }).rangedAccuracy).toBeCloseTo(0.9, 5);
    expect(computeDerived({ attributes: { ...five, instinto: 10 }, abilities: ['ojoCertero'] }).rangedAccuracy).toBe(0.95);
  });
});

describe('desglose de estadísticas', () => {
  it('reproduce exactamente el valor del motor para builds al azar', () => {
    const rng = new Rng('desglose');
    for (let n = 0; n < 200; n++) {
      const attributes = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, rng.int(1, 10)])) as Attributes;
      const input: DerivedInput = {
        attributes,
        district: rng.int(1, 12),
        abilities: [ABILITY_KEYS[rng.int(0, 15)], ABILITY_KEYS[rng.int(0, 15)]].filter((v, i, a) => a.indexOf(v) === i),
        trait: rng.chance(0.7) ? TRAIT_KEYS[rng.int(0, TRAIT_KEYS.length - 1)] : null,
        defect: rng.chance(0.5) ? DEFECT_KEYS[rng.int(0, DEFECT_KEYS.length - 1)] : null,
      };
      const d = computeDerived(input);
      for (const key of Object.keys(d) as DerivedKey[]) {
        const b = explainDerived(input, key);
        expect(b.total).toBeCloseTo(d[key], 6);
        expect(b.base).toBe(computeDerived({ attributes })[key]);
      }
    }
  });

  it('explica de dónde sale cada cambio', () => {
    const b = explainDerived({ attributes: five, district: 12, abilities: ['resistenciaDolor'], defect: 'fragil' }, 'maxHp');
    expect(b.base).toBe(110);
    expect(b.lines.map((l) => l.label)).toEqual(['Distrito XII · Minas', 'Resistencia al dolor', 'Frágil']);
    expect(b.lines.every((l) => l.op === 'mult')).toBe(true);
  });
});
