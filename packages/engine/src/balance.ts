import {
  ARCHETYPES,
  ARMORS,
  Rng,
  WEAPONS,
  computeDerived,
  situationalStats,
  type DerivedInput,
  type TerrainKind,
  type WeaponDef,
} from '@ceniza/shared';
import { advantage, createFighter, detectionChance, fight, startCombat, type FighterInit, type Support } from './combat.js';

/**
 * Simulador de equilibrio (GDD §16). Enfrenta personajes en encuentros típicos de una partida usando
 * las mismas reglas que el motor (estadísticas, efectos según la situación, combate y detección).
 * Mientras no existan bots completos, eventos y recursos (fases 6–9), mide encuentros, no partidas
 * enteras; los supuestos de cada escenario están escritos junto a él.
 */
export interface Contender {
  key: string;
  name: string;
  build: DerivedInput;
}

export interface Scenario {
  key: string;
  name: string;
  description: string;
  /** 0 o 1: quién gana; null: nadie cae (huida o sin desenlace). */
  run: (a: Contender, b: Contender, rng: Rng) => 0 | 1 | null;
}

export const POLICY = { fleeAt: 0.25, retreatBelow: 0.55 } as const;

export const ARCHETYPE_CONTENDERS: Contender[] = ARCHETYPES.map((a) => ({
  key: a.key,
  name: a.name,
  build: { attributes: a.attributes, abilities: a.abilities, trait: a.trait, defect: null, district: null },
}));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const has = (c: Contender, ability: string) => (c.build.abilities ?? []).includes(ability as never);
const pick = <T>(rng: Rng, list: readonly T[]): T => list[rng.int(0, list.length - 1)];

const CRAFTED = new Set(['lanza', 'honda', 'arco', 'hacha', 'maza']);

/** Arma que fabricaría o elegiría este personaje: la de más daño esperado entre las que puede usar. */
export function pickWeapon(build: DerivedInput): WeaponDef {
  const d = computeDerived(build);
  const a = build.attributes;
  const options: WeaponDef[] = [WEAPONS.cuchillo, WEAPONS.lanza, WEAPONS.honda];
  if (a.ingenio >= 4) options.push(WEAPONS.arco);
  if (a.potencia >= 5) options.push(WEAPONS.hacha, WEAPONS.maza);
  const score = (w: WeaponDef) =>
    withQuality(w, d.craftQuality).base * (w.range === 'lejos' ? d.rangedMult * d.rangedAccuracy * 1.15 : d.meleeMult * 0.85) * (1 + 0.03 * w.speed);
  return withQuality(options.reduce((best, w) => (score(w) > score(best) ? w : best)), d.craftQuality);
}

/** Las armas fabricadas salen mejores o peores según el Ingenio (calidad fabricada). */
export function withQuality(w: WeaponDef, quality: number): WeaponDef {
  return CRAFTED.has(w.key) ? { ...w, base: Math.round(w.base * (1 + quality) * 10) / 10 } : w;
}

function fighterInit(c: Contender, i: number, extra: Partial<FighterInit>): FighterInit {
  return { id: `${c.key}-${i}`, name: c.name, build: c.build, weapon: WEAPONS.cuchillo, terrain: 'pradera', ...extra };
}

/**
 * Probabilidad de aceptar un pacto de no agresión: sube con el atractivo social de quien lo propone
 * (Carisma, Labia…) y baja cuanto más ventaja cree tener quien decide.
 */
export function pactAcceptance(proposerAppeal: number, accepterAdvantage: number): number {
  return clamp(0.2 + 1.2 * proposerAppeal - 0.3 * (accepterAdvantage - 1), 0.02, 0.9);
}

function play(
  a: FighterInit,
  b: FighterInit,
  rng: Rng,
  opts: { distance?: 'cerca' | 'lejos'; surprise?: 0 | 1 | null; support?: [Support | null, Support | null]; choice?: 0 | 1 } = {},
): 0 | 1 | null {
  const c = startCombat(createFighter(a), createFighter(b), { ...opts, surprise: null }, rng);
  if (opts.choice != null) {
    // Quien ve primero decide: embosca si le conviene; si no, se aleja sin ser visto.
    if (advantage(c, opts.choice) < 0.8) return null;
    return fight(startCombat(createFighter(a), createFighter(b), { ...opts, surprise: opts.choice }, rng), rng, [POLICY, POLICY]).winner;
  }
  if (opts.surprise != null) return fight(startCombat(createFighter(a), createFighter(b), opts, rng), rng, [POLICY, POLICY]).winner;
  // Cara a cara, quien va perdiendo propone un pacto antes de pelear.
  for (const i of [0, 1] as const) {
    const adv = advantage(c, i);
    if (adv < 0.9 && rng.chance(pactAcceptance(c.fighters[i].base.socialAppeal, 1 / adv))) return null;
  }
  return fight(c, rng, [POLICY, POLICY]).winner;
}

/** Salud y energía con las que se llega al tercer día según el hambre, la sed y lo que se encuentra. */
export function attrition(build: DerivedInput): { hp: number; energy: number } {
  const d = computeDerived(build);
  const s = situationalStats(build, { activity: 'comida', allies: 0 }, d).stats;
  const ratio = (d.hungerRate + d.thirstRate) / 2 / (s.searchYield / d.searchTimeMult);
  const hpLoss = clamp(80 * (ratio - 0.55), 0, 70) / d.healEfficiency;
  const energyLoss = clamp(60 * (ratio - 0.55), 0, 50);
  return { hp: Math.round(d.maxHp - hpLoss), energy: Math.round(d.maxEnergy - energyLoss) };
}

export const SCENARIOS: Scenario[] = [
  {
    key: 'abierto',
    name: 'A campo abierto',
    description: 'Se ven de lejos en la pradera, de día, con un cuchillo cada uno.',
    run: (a, b, rng) => play(fighterInit(a, 0, {}), fighterInit(b, 1, {}), rng, { distance: 'lejos' }),
  },
  {
    key: 'bosque',
    name: 'Emboscada en el bosque',
    description:
      'Avanzan por bosque denso sin saber del otro. Cada segundo se tira la detección (Instinto contra Sigilo y cobertura). Quien ve primero decide: embosca si le conviene o se aleja sin ser visto. Quien tiene Camuflaje lo usa.',
    run: (a, b, rng) => {
      const terrain: TerrainKind = 'denso';
      const da = computeDerived(a.build);
      const db = computeDerived(b.build);
      let dist = 10;
      let surprise: 0 | 1 | null = null;
      while (dist > 1) {
        const pa = detectionChance(
          { build: a.build, base: da, terrain, against: 'emboscada' },
          { build: b.build, base: db, terrain, moving: true, camouflaged: has(b, 'camuflaje'), allies: 0 },
          dist,
        );
        const pb = detectionChance(
          { build: b.build, base: db, terrain, against: 'emboscada' },
          { build: a.build, base: da, terrain, moving: true, camouflaged: has(a, 'camuflaje'), allies: 0 },
          dist,
        );
        const seesA = rng.chance(pa);
        const seesB = rng.chance(pb);
        if (seesA !== seesB) {
          surprise = seesA ? 0 : 1;
          break;
        }
        if (seesA && seesB) break;
        dist -= 0.5;
      }
      return play(fighterInit(a, 0, { terrain }), fighterInit(b, 1, { terrain }), rng, {
        distance: dist > 3 ? 'lejos' : 'cerca',
        choice: surprise ?? undefined,
      });
    },
  },
  {
    key: 'armas',
    name: 'Segundo día, armas fabricadas',
    description: 'Cada uno lleva el arma que mejor le va y puede fabricar (arco con Ingenio 4, hacha y maza con Potencia 5); la calidad depende del Ingenio.',
    run: (a, b, rng) => {
      const terrain = pick<TerrainKind>(rng, ['pradera', 'roca', 'bosque']);
      return play(fighterInit(a, 0, { terrain, weapon: pickWeapon(a.build) }), fighterInit(b, 1, { terrain, weapon: pickWeapon(b.build) }), rng, {
        distance: 'lejos',
      });
    },
  },
  {
    key: 'desgaste',
    name: 'Tercer día de desgaste',
    description:
      'Llegan con la salud y la energía que les han dejado el hambre y la sed (según Aguante, Potencia, Instinto y Forrajeo). Con Ingenio 5 llevan escudo y un ungüento; con Trampero o Ingenio 6, una trampa en el camino del rival.',
    run: (a, b, rng) => {
      const terrain = pick<TerrainKind>(rng, ['pradera', 'roca', 'bosque']);
      const gear = (c: Contender, i: number): FighterInit => {
        const att = attrition(c.build);
        const ing = c.build.attributes.ingenio;
        return fighterInit(c, i, {
          terrain,
          weapon: pickWeapon(c.build),
          armor: ing >= 5 ? ARMORS.escudo : null,
          medkits: ing >= 5 ? 1 : 0,
          hp: att.hp,
          energy: att.energy,
        });
      };
      const fa = gear(a, 0);
      const fb = gear(b, 1);
      const trap = (owner: Contender, victim: Contender, target: FighterInit) => {
        if (!(has(owner, 'trampero') || owner.build.attributes.ingenio >= 6)) return;
        const o = computeDerived(owner.build);
        const v = situationalStats(victim.build, { against: 'trampa' }).stats;
        const avoid = clamp(0.5 + (v.detectionPower - (10 + 3 * owner.build.attributes.ingenio)) / 20, 0.02, 0.95) * 0.5;
        for (let n = has(owner, 'trampero') ? 2 : 1; n > 0; n--) {
          if (rng.chance(0.4 * (1 - avoid))) target.hp = Math.max(1, (target.hp ?? 0) - Math.round(20 * o.trapPower));
        }
      };
      trap(a, b, fb);
      trap(b, a, fa);
      return play(fa, fb, rng, { distance: 'lejos' });
    },
  },
  {
    key: 'testigos',
    name: 'Con testigos',
    description:
      'Un tercer participante lo ve todo y, seis de cada diez veces, se une al bando que le cae mejor (atractivo social e intimidación); el rasgo Leal hace más útil al aliado. El favor del público puede traer un botiquín de un mecenas.',
    run: (a, b, rng) => {
      const da = computeDerived(a.build);
      const db = computeDerived(b.build);
      const appeal = (d: typeof da) => d.socialAppeal + 0.02 * (d.intimidation - 5);
      const support: [Support | null, Support | null] = [null, null];
      if (rng.chance(0.6)) {
        const side = rng.chance(1 / (1 + Math.exp(-6 * (appeal(da) - appeal(db))))) ? 0 : 1;
        const loyal = (side === 0 ? a : b).build.trait === 'leal' ? 1.25 : 1;
        support[side] = { name: 'Testigo', hitChance: 0.8, damage: 14 * loyal, flank: 0.1 };
      }
      const medkits = (d: typeof da) => (rng.chance(Math.min(0.5, 0.15 * d.favorMult)) ? 1 : 0);
      return play(fighterInit(a, 0, { medkits: medkits(da) }), fighterInit(b, 1, { medkits: medkits(db) }), rng, { distance: 'lejos', support });
    },
  },
];

export interface BalanceReport {
  runs: number;
  seed: string;
  contenders: { key: string; name: string }[];
  scenarios: { key: string; name: string; description: string }[];
  /** matrix[s][i][j]: puntos de i contra j en el escenario s (ganar 1, nadie cae 0,5). */
  matrix: number[][][];
  /** byScenario[s][i]: media de i contra los demás en el escenario s. */
  byScenario: number[][];
  /** overall[i]: media de i en todos los escenarios. */
  overall: number[];
  mean: number;
}

function duel(s: Scenario, a: Contender, b: Contender, runs: number, rng: Rng): number {
  let points = 0;
  for (let r = 0; r < runs; r++) {
    // Se alternan los papeles para que el orden no dé ventaja.
    const swap = r % 2 === 1;
    const w = swap ? s.run(b, a, rng) : s.run(a, b, rng);
    if (w === null) points += 0.5;
    else if ((w === 0) !== swap) points += 1;
  }
  return points / runs;
}

export function runBalance(opts: { runs?: number; seed?: string; contenders?: Contender[]; scenarios?: Scenario[] } = {}): BalanceReport {
  const runs = opts.runs ?? 200;
  const seed = opts.seed ?? 'equilibrio';
  const cs = opts.contenders ?? ARCHETYPE_CONTENDERS;
  const ss = opts.scenarios ?? SCENARIOS;
  const matrix = ss.map((s) => {
    const m = cs.map(() => cs.map(() => 0.5));
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const p = duel(s, cs[i], cs[j], runs, new Rng(`${seed}:${s.key}:${cs[i].key}:${cs[j].key}`));
        m[i][j] = p;
        m[j][i] = 1 - p;
      }
    }
    return m;
  });
  const byScenario = matrix.map((m) => m.map((row, i) => row.reduce((acc, v, j) => (j === i ? acc : acc + v), 0) / (cs.length - 1)));
  const overall = cs.map((_, i) => byScenario.reduce((acc, row) => acc + row[i], 0) / ss.length);
  const mean = overall.reduce((x, y) => x + y, 0) / overall.length;
  return {
    runs,
    seed,
    contenders: cs.map((c) => ({ key: c.key, name: c.name })),
    scenarios: ss.map((s) => ({ key: s.key, name: s.name, description: s.description })),
    matrix,
    byScenario,
    overall,
    mean,
  };
}

/** Un personaje contra cada rival en cada escenario: result[s][j] = sus puntos contra el rival j. */
export function runMatchups(you: Contender, field: Contender[] = ARCHETYPE_CONTENDERS, runs = 60, seed = 'prueba'): number[][] {
  return SCENARIOS.map((s) => field.map((f) => duel(s, you, f, runs, new Rng(`${seed}:${s.key}:${f.key}`))));
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

export function formatBalanceMarkdown(r: BalanceReport): string {
  const head = `| Arquetipo | ${r.scenarios.map((s) => s.name).join(' | ')} | **Total** | Respecto a la media |`;
  const sep = `|---|${r.scenarios.map(() => '---:').join('|')}|---:|---:|`;
  const rows = r.contenders.map(
    (c, i) => `| ${c.name} | ${r.byScenario.map((row) => pct(row[i])).join(' | ')} | **${pct(r.overall[i])}** | ×${(r.overall[i] / r.mean).toFixed(2)} |`,
  );
  const scen = r.scenarios.map((s) => `- **${s.name}.** ${s.description}`);
  return [
    '# Informe de equilibrio',
    '',
    `Generado con \`npm run balance\` (${r.runs} enfrentamientos por pareja y escenario, semilla \`${r.seed}\`).`,
    'Cada celda es la media de puntos contra los otros siete arquetipos: ganar vale 1 y que nadie caiga',
    '(huida o sin desenlace) vale 0,5. El objetivo del GDD §16 es que ningún arquetipo quede por encima de',
    '×1,5 ni por debajo de ×0,5 de la media.',
    '',
    head,
    sep,
    ...rows,
    '',
    '## Escenarios',
    '',
    ...scen,
    '',
    '## Límites del modelo',
    '',
    '- Mide encuentros, no partidas completas: la exploración, los eventos, los mecenas y las alianzas',
    '  largas llegarán con las fases 6–9, y entonces el simulador jugará partidas enteras con bots.',
    '- Todos usan la misma política de combate (la de los bots normales) y huyen por debajo del 25 % de salud.',
    '',
  ].join('\n');
}
