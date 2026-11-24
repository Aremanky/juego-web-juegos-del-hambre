import {
  COMBAT_ENERGY,
  LOW_HEALTH,
  SITUATIONAL_MODIFIERS,
  TERRAIN_RULES,
  WEAPONS,
  computeDerived,
  situationalStats,
  type ArmorDef,
  type DerivedInput,
  type DerivedStats,
  type Rng,
  type Situation,
  type SituationalStats,
  type TerrainKind,
  type WeaponDef,
} from '@ceniza/shared';

/**
 * Combate por rondas (GDD §9), sin E/S: lo usarán el motor (fase 8), los bots para estimar si les
 * conviene pelear (GDD §13) y el simulador de equilibrio. Todo el azar sale del `Rng` que se pasa.
 */
export const MAX_ROUNDS = 40;
export const CRIT_MULT = 1.6;
export const VARIANCE = 0.15;
export const BRUTAL_STUN = 0.35;
export const BRUTAL_MULT = 1.5;

export interface FighterInit {
  id: string;
  name: string;
  build: DerivedInput;
  weapon?: WeaponDef;
  armor?: ArmorDef | null;
  hp?: number;
  energy?: number;
  terrain?: TerrainKind;
  allies?: number;
  medkits?: number;
  lastBreathUsed?: boolean;
  sprintReady?: boolean;
}

export interface Fighter {
  id: string;
  name: string;
  build: DerivedInput;
  base: DerivedStats;
  weapon: WeaponDef;
  armor: ArmorDef | null;
  maxHp: number;
  hp: number;
  maxEnergy: number;
  energy: number;
  terrain: TerrainKind;
  allies: number;
  medkits: number;
  lastBreathUsed: boolean;
  sprintReady: boolean;
  usedBrutal: boolean;
  usedCounter: boolean;
  usedIntimidate: boolean;
  usedFirstAid: boolean;
  attacked: boolean;
  bleed: number;
  stunned: boolean;
  intimidated: number;
  riposte: boolean;
  invulnerableRound: number;
}

export type CombatAction =
  | { type: 'atacar'; brutal?: boolean }
  | { type: 'defender' }
  | { type: 'esquivar'; counter?: boolean }
  | { type: 'acercarse' }
  | { type: 'alejarse' }
  | { type: 'huir' }
  | { type: 'intimidar' }
  | { type: 'curarse' }
  | { type: 'tregua' };

export type CombatEvent =
  | { type: 'sorpresa'; by: number }
  | { type: 'golpe'; by: number; to: number; damage: number; crit: boolean; brutal: boolean; counter: boolean }
  | { type: 'fallo'; by: number; to: number }
  | { type: 'aturdido'; who: number }
  | { type: 'sangrado'; who: number; damage: number }
  | { type: 'intimidar'; by: number; ok: boolean }
  | { type: 'curado'; who: number; amount: number }
  | { type: 'distancia'; distance: 'cerca' | 'lejos'; by: number }
  | { type: 'huida'; who: number; ok: boolean }
  | { type: 'ultimoAliento'; who: number }
  | { type: 'apoyo'; to: number; damage: number }
  | { type: 'caido'; who: number }
  | { type: 'tregua' };

/** Un aliado o espectador que se une a un bando (GDD §9.9). */
export interface Support {
  name: string;
  hitChance: number;
  damage: number;
  /** Se suma a la probabilidad de acertar de quien recibe el apoyo (flanqueo). */
  flank: number;
}

export interface Combat {
  fighters: [Fighter, Fighter];
  distance: 'cerca' | 'lejos';
  round: number;
  over: boolean;
  /** Quién ha ganado al hacer caer al otro; null si acaba en huida, tregua o sin desenlace. */
  winner: 0 | 1 | null;
  fled: 0 | 1 | null;
  support: [Support | null, Support | null];
  log: CombatEvent[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const has = (f: Fighter, ability: string) => (f.build.abilities ?? []).includes(ability as never);
const other = (i: number) => (1 - i) as 0 | 1;

export function createFighter(init: FighterInit): Fighter {
  const base = computeDerived(init.build);
  return {
    id: init.id,
    name: init.name,
    build: init.build,
    base,
    weapon: init.weapon ?? WEAPONS.punos,
    armor: init.armor ?? null,
    maxHp: base.maxHp,
    hp: Math.min(init.hp ?? base.maxHp, base.maxHp),
    maxEnergy: base.maxEnergy,
    energy: Math.min(init.energy ?? base.maxEnergy, base.maxEnergy),
    terrain: init.terrain ?? 'pradera',
    allies: init.allies ?? 0,
    medkits: init.medkits ?? 0,
    lastBreathUsed: init.lastBreathUsed ?? false,
    sprintReady: init.sprintReady ?? true,
    usedBrutal: false,
    usedCounter: false,
    usedIntimidate: false,
    usedFirstAid: false,
    attacked: false,
    bleed: 0,
    stunned: false,
    intimidated: 0,
    riposte: false,
    invulnerableRound: -1,
  };
}

/** Umbrales de salud que cambian las estadísticas: la regla de salud baja y los `hpBelow` de los efectos. */
const HP_THRESHOLDS = [...new Set([LOW_HEALTH, ...SITUATIONAL_MODIFIERS.flatMap((m) => (m.when.hpBelow === undefined ? [] : [m.when.hpBelow]))])];

/**
 * Clave de una situación con todo lo que lee `situationalStats`. La salud solo cuenta por los umbrales
 * que cruza, así que dos rondas con distinta salud pero los mismos umbrales comparten resultado.
 */
function situationKey(s: Situation): string {
  const flags = [s.night, s.hiding, s.climbing, s.camouflaged, s.sprinting, s.pursuing, s.firstAttack].map((v) => (v ? 1 : 0)).join('');
  let k = `${s.terrain ?? ''}|${flags}|${s.allies ?? 0}|${s.attack ?? ''}|${(s.weaponTags ?? []).join(',')}|${s.against ?? ''}|${s.activity ?? ''}|`;
  const hp = s.hpFraction ?? 1;
  for (const t of HP_THRESHOLDS) k += hp < t ? '1' : '0';
  return k;
}

/**
 * Estadísticas ya calculadas de cada luchador (en un combate se piden muchas veces por ronda). Sin
 * situación extra, lo único que cambia dentro de un combate es si ya atacó y qué umbrales de salud
 * cruza: eso indexa `slots` sin construir cadenas. Si cambiasen el terreno, el arma o los aliados, se
 * empieza de cero.
 */
interface StatsCache {
  terrain: TerrainKind;
  weapon: WeaponDef;
  allies: number;
  slots: (SituationalStats | undefined)[];
  other: Map<string, SituationalStats>;
}
const statsCache = new WeakMap<Fighter, StatsCache>();

/** Estadísticas del luchador en este momento del combate. El resultado es compartido: no se modifica. */
export function fighterStats(c: Combat, i: number, extra?: Situation): SituationalStats {
  const f = c.fighters[i];
  const allies = f.allies + (c.support[i] ? 1 : 0);
  let cache = statsCache.get(f);
  if (!cache || cache.terrain !== f.terrain || cache.weapon !== f.weapon || cache.allies !== allies) {
    statsCache.set(f, (cache = { terrain: f.terrain, weapon: f.weapon, allies, slots: [], other: new Map() }));
  }
  const hp = f.hp / f.maxHp;
  const sit = (): Situation => ({ terrain: f.terrain, allies, hpFraction: hp, attack: f.weapon.range, weaponTags: f.weapon.tags, firstAttack: !f.attacked, ...extra });
  if (!extra) {
    let slot = f.attacked ? 1 : 0;
    for (const t of HP_THRESHOLDS) slot = slot * 2 + (hp < t ? 1 : 0);
    return (cache.slots[slot] ??= situationalStats(f.build, sit(), f.base).stats);
  }
  const s = sit();
  const key = situationKey(s);
  let stats = cache.other.get(key);
  if (!stats) cache.other.set(key, (stats = situationalStats(f.build, s, f.base).stats));
  return stats;
}

export function startCombat(
  a: Fighter,
  b: Fighter,
  opts: { distance?: 'cerca' | 'lejos'; surprise?: 0 | 1 | null; support?: [Support | null, Support | null] },
  rng: Rng,
): Combat {
  const c: Combat = {
    fighters: [a, b],
    distance: opts.distance ?? 'lejos',
    round: 0,
    over: false,
    winner: null,
    fled: null,
    support: opts.support ?? [null, null],
    log: [],
  };
  if (opts.surprise != null) {
    const s = opts.surprise;
    // Quien embosca con arma de cuerpo a cuerpo se ha acercado sin ser visto.
    if (c.fighters[s].weapon.range === 'cerca') c.distance = 'cerca';
    c.log.push({ type: 'sorpresa', by: s });
    attack(c, s, rng, { free: true });
  }
  return c;
}

export function attackCost(f: Fighter): number {
  return f.weapon.tags.includes('pesada') ? COMBAT_ENERGY.atacarPesada : COMBAT_ENERGY.atacar;
}

interface AttackOpts {
  free?: boolean;
  brutal?: boolean;
  counter?: boolean;
  exposed?: boolean;
  stance?: CombatAction['type'];
  counterReady?: boolean[];
}

/** Probabilidad de acertar, antes de tirar (también la usan los bots para estimar). */
export function hitChance(c: Combat, i: number, defStance: CombatAction['type'] | null = null): number {
  const att = c.fighters[i];
  const def = c.fighters[other(i)];
  const sa = fighterStats(c, i);
  const sd = fighterStats(c, other(i));
  const ranged = att.weapon.range === 'lejos';
  const canDodge = def.energy > 0 && !def.stunned;
  const dodge = canDodge ? Math.min(0.85, sd.dodgeChance * (defStance === 'esquivar' ? 2.5 : 1)) : 0;
  const flank = c.support[i]?.flank ?? 0;
  const p = ranged ? sa.rangedAccuracy - (c.distance === 'cerca' ? 0.15 : 0) - dodge * 0.5 : 1 - dodge;
  return clamp(p + sa.hitBonus + flank, 0.05, 0.95);
}

/** Daño medio por ronda que haría i a su rival ahora mismo (lo usan los bots para decidir si pelean). */
export function expectedDamage(c: Combat, i: number): number {
  const att = c.fighters[i];
  const j = other(i);
  const def = c.fighters[j];
  const sa = fighterStats(c, i);
  const sd = fighterStats(c, j);
  const mult = att.weapon.range === 'lejos' ? sa.rangedMult : sa.meleeMult;
  const support = c.support[i] ? c.support[i]!.damage * c.support[i]!.hitChance : 0;
  return (
    att.weapon.base * mult * sa.damageMult * hitChance(c, i) * (1 + sa.critChance * (CRIT_MULT - 1)) * sd.damageTakenMult * (1 - (def.armor?.protection ?? 0)) +
    support
  );
}

/** Ventaja de i: rondas que aguantaría frente a rondas que necesita para tumbar al rival (>1 = gana). */
export function advantage(c: Combat, i: number): number {
  const j = other(i);
  const toKill = c.fighters[j].hp / Math.max(0.1, expectedDamage(c, i));
  const toDie = c.fighters[i].hp / Math.max(0.1, expectedDamage(c, j));
  return toDie / toKill;
}

function attack(c: Combat, i: number, rng: Rng, o: AttackOpts): void {
  const att = c.fighters[i];
  const j = other(i);
  const def = c.fighters[j];
  const sa = fighterStats(c, i);
  const sd = fighterStats(c, j);
  const ranged = att.weapon.range === 'lejos';

  let exhausted = false;
  if (!o.counter && !o.free) {
    const cost = attackCost(att);
    if (att.energy < cost) {
      exhausted = true;
      att.energy = 0;
    } else att.energy -= cost;
  }

  const defStance = o.free ? null : (o.stance ?? null);
  const p = o.counter ? 1 : o.exposed ? 0.95 : o.free ? clamp((ranged ? sa.rangedAccuracy : 1) + sa.hitBonus, 0.05, 0.95) : hitChance(c, i, defStance);
  att.attacked = true;
  if (!rng.chance(p)) {
    c.log.push({ type: 'fallo', by: i, to: j });
    if (defStance === 'esquivar') {
      att.energy = Math.max(0, att.energy - 6);
      if (o.counterReady?.[j] && !c.over) {
        o.counterReady[j] = false;
        attack(c, j, rng, { counter: true });
      }
    }
    return;
  }
  if (def.invulnerableRound === c.round) return;

  let dmg = att.weapon.base * (ranged ? sa.rangedMult : sa.meleeMult) * rng.float(1 - VARIANCE, 1 + VARIANCE);
  const crit = rng.chance(sa.critChance);
  if (crit) dmg *= CRIT_MULT;
  if (TERRAIN_RULES[att.terrain].high && !TERRAIN_RULES[def.terrain].high) dmg *= 1.1;
  if (att.terrain === 'agua') dmg *= 0.85;
  if (o.free) dmg *= sa.ambushMult;
  dmg *= sa.damageMult;
  if (att.weapon.minPotencia && att.build.attributes.potencia < att.weapon.minPotencia) dmg *= 0.8;
  if (exhausted) dmg *= 0.7;
  if (att.intimidated > 0) dmg *= 0.7;
  if (o.brutal) dmg *= BRUTAL_MULT;
  if (att.riposte) {
    dmg *= 1.2;
    att.riposte = false;
  }
  if (o.counter) dmg *= 0.7;
  if (o.exposed) dmg *= 1.25;
  dmg *= sd.damageTakenMult;
  if (defStance === 'defender') {
    dmg *= def.armor?.block ? 0.3 : 0.5;
    def.riposte = true;
  }
  dmg *= 1 - (def.armor?.protection ?? 0);
  const damage = Math.max(1, Math.round(dmg));
  def.hp -= damage;
  c.log.push({ type: 'golpe', by: i, to: j, damage, crit, brutal: !!o.brutal, counter: !!o.counter });

  if (att.weapon.tags.includes('filo') && !rng.chance(sd.statusResist)) {
    def.bleed = Math.max(def.bleed, Math.max(1, Math.round(3 * sd.statusDurationMult)));
  }
  const stun = o.brutal ? BRUTAL_STUN : (att.weapon.stun ?? 0);
  if (stun > 0 && rng.chance(stun) && !rng.chance(sd.statusResist)) {
    def.stunned = true;
    c.log.push({ type: 'aturdido', who: j });
  }
  checkDown(c, j);
}

function checkDown(c: Combat, j: 0 | 1): void {
  const f = c.fighters[j];
  if (f.hp > 0 || c.over) return;
  if (has(f, 'ultimoAliento') && !f.lastBreathUsed) {
    f.lastBreathUsed = true;
    f.hp = 1;
    f.energy = Math.min(f.maxEnergy, f.energy + 30);
    f.invulnerableRound = c.round;
    c.log.push({ type: 'ultimoAliento', who: j });
    return;
  }
  f.hp = 0;
  c.over = true;
  c.winner = other(j);
  c.log.push({ type: 'caido', who: j });
}

/** Probabilidad de pasar de Cerca a Lejos en una ronda. */
export function retreatChance(c: Combat, i: number): number {
  const f = c.fighters[i];
  const o = c.fighters[other(i)];
  return clamp(0.5 + 0.05 * (f.build.attributes.reflejos - o.build.attributes.reflejos) + TERRAIN_RULES[f.terrain].flee, 0.1, 0.9);
}

/** Probabilidad de huir (GDD §9.7). */
export function fleeChance(c: Combat, i: number, sprint = c.fighters[i].sprintReady && has(c.fighters[i], 'carrera')): number {
  const f = c.fighters[i];
  const o = c.fighters[other(i)];
  const s = fighterStats(c, i, { sprinting: sprint });
  const p =
    0.35 +
    0.05 * (f.build.attributes.reflejos - o.build.attributes.reflejos) +
    TERRAIN_RULES[f.terrain].flee +
    s.fleeBonus -
    (f.hp / f.maxHp < LOW_HEALTH ? 0.1 : 0) -
    (f.energy < COMBAT_ENERGY.huir ? 0.15 : 0);
  return clamp(p, 0.05, 0.95);
}

function act(c: Combat, i: 0 | 1, a: CombatAction, rng: Rng, stances: CombatAction['type'][], counterReady: boolean[]): void {
  const f = c.fighters[i];
  const j = other(i);
  const o = c.fighters[j];
  switch (a.type) {
    case 'atacar': {
      if (f.weapon.range === 'cerca' && c.distance === 'lejos') {
        c.distance = 'cerca';
        c.log.push({ type: 'distancia', distance: 'cerca', by: i });
        return;
      }
      const brutal = !!a.brutal && has(f, 'golpeBrutal') && !f.usedBrutal && f.weapon.range === 'cerca';
      if (brutal) f.usedBrutal = true;
      attack(c, i, rng, { brutal, stance: stances[j], counterReady });
      return;
    }
    case 'acercarse':
      if (c.distance === 'lejos') {
        c.distance = 'cerca';
        c.log.push({ type: 'distancia', distance: 'cerca', by: i });
      }
      return;
    case 'alejarse': {
      if (c.distance === 'lejos') return;
      if (rng.chance(retreatChance(c, i))) {
        c.distance = 'lejos';
        c.log.push({ type: 'distancia', distance: 'lejos', by: i });
      }
      return;
    }
    case 'huir': {
      const sprint = f.sprintReady && has(f, 'carrera');
      const p = fleeChance(c, i, sprint);
      if (sprint) f.sprintReady = false;
      f.energy = Math.max(0, f.energy - COMBAT_ENERGY.huir);
      const ok = rng.chance(p);
      c.log.push({ type: 'huida', who: i, ok });
      if (ok) {
        c.over = true;
        c.fled = i;
      } else if (!c.over) {
        attack(c, j, rng, { exposed: true });
      }
      return;
    }
    case 'intimidar': {
      if (!has(f, 'intimidar') || f.usedIntimidate) return;
      f.usedIntimidate = true;
      const immune = o.build.trait === 'sangreFria';
      const ok = !immune && rng.chance(clamp(0.5 + 0.08 * (f.base.intimidation - o.base.intimidation), 0.15, 0.85));
      if (ok) o.intimidated = 2;
      c.log.push({ type: 'intimidar', by: i, ok });
      return;
    }
    case 'curarse': {
      let amount = 0;
      if (f.medkits > 0) {
        f.medkits--;
        amount = 30 * f.base.healEfficiency;
      } else if (has(f, 'primerosAuxilios') && !f.usedFirstAid) {
        f.usedFirstAid = true;
        amount = 18 * f.base.healEfficiency;
      }
      if (amount > 0) {
        const before = f.hp;
        f.hp = Math.min(f.maxHp, f.hp + Math.round(amount));
        f.bleed = 0;
        c.log.push({ type: 'curado', who: i, amount: f.hp - before });
      }
      return;
    }
    default:
      return; // defender, esquivar y tregua son posturas: se resuelven al recibir el golpe
  }
}

/** Resuelve una ronda con las acciones de los dos luchadores. Devuelve lo que ha pasado en ella. */
export function resolveRound(c: Combat, actions: [CombatAction, CombatAction], rng: Rng): CombatEvent[] {
  if (c.over) return [];
  const from = c.log.length;
  c.round++;
  if (actions[0].type === 'tregua' && actions[1].type === 'tregua') {
    c.over = true;
    c.log.push({ type: 'tregua' });
    return c.log.slice(from);
  }
  const stances = actions.map((a) => a.type);
  const counterReady = [false, false];
  for (const i of [0, 1] as const) {
    const f = c.fighters[i];
    const a = actions[i];
    if (a.type === 'defender') f.energy = Math.max(0, f.energy - COMBAT_ENERGY.defender);
    if (a.type === 'esquivar') {
      if (f.energy >= COMBAT_ENERGY.esquivar) {
        f.energy -= COMBAT_ENERGY.esquivar;
        if (a.counter && has(f, 'contraataque') && !f.usedCounter) {
          f.usedCounter = true;
          counterReady[i] = true;
        }
      } else stances[i] = 'defender';
    }
  }
  const init = ([0, 1] as const).map((i) => {
    const f = c.fighters[i];
    const o = c.fighters[other(i)];
    let v = f.base.initiative + f.weapon.speed + rng.float(0, 3);
    if (f.weapon.minPotencia && f.build.attributes.potencia < f.weapon.minPotencia) v -= 1;
    if (f.weapon.tags.includes('alcance') && actions[other(i)].type === 'acercarse' && o.weapon.range === 'cerca') v += 2;
    return v;
  });
  const order: (0 | 1)[] = init[0] >= init[1] ? [0, 1] : [1, 0];
  for (const i of order) {
    if (c.over) break;
    const f = c.fighters[i];
    if (f.stunned) {
      f.stunned = false;
      continue;
    }
    act(c, i, actions[i], rng, stances, counterReady);
  }
  for (const i of [0, 1] as const) {
    const s = c.support[i];
    if (c.over || !s) continue;
    if (rng.chance(s.hitChance)) {
      const j = other(i);
      const damage = Math.max(1, Math.round(s.damage * rng.float(1 - VARIANCE, 1 + VARIANCE) * fighterStats(c, j).damageTakenMult));
      if (c.fighters[j].invulnerableRound !== c.round) {
        c.fighters[j].hp -= damage;
        c.log.push({ type: 'apoyo', to: j, damage });
        checkDown(c, j);
      }
    }
  }
  for (const i of [0, 1] as const) {
    const f = c.fighters[i];
    if (!c.over && f.bleed > 0) {
      f.bleed--;
      if (f.invulnerableRound !== c.round) {
        f.hp -= 2;
        c.log.push({ type: 'sangrado', who: i, damage: 2 });
        checkDown(c, i);
      }
    }
    if (f.intimidated > 0) f.intimidated--;
    f.energy = Math.min(f.maxEnergy, f.energy + f.base.energyRegen);
  }
  if (!c.over && c.round >= MAX_ROUNDS) c.over = true;
  return c.log.slice(from);
}

export interface PolicyOptions {
  /** Huye por debajo de esta fracción de salud si el rival está mejor (0 = nunca). */
  fleeAt?: number;
  /** Huye si su ventaja (ver `advantage`) baja de este valor y tiene opciones de escapar. */
  retreatBelow?: number;
}

/**
 * Política sencilla: la de los bots de dificultad normal mientras no llegue la IA de la fase 6, y la
 * del simulador de equilibrio. Usa solo lo que ve un jugador: su estado, el del rival y la distancia.
 */
export function chooseAction(c: Combat, i: 0 | 1, rng: Rng, opts: PolicyOptions = {}): CombatAction {
  const f = c.fighters[i];
  const o = c.fighters[other(i)];
  const hp = f.hp / f.maxHp;
  const canHeal = f.medkits > 0 || (has(f, 'primerosAuxilios') && !f.usedFirstAid);
  if (canHeal && (hp < 0.35 || (hp < 0.6 && f.bleed > 1))) return { type: 'curarse' };
  if (opts.fleeAt && hp < opts.fleeAt && o.hp / o.maxHp > hp + 0.1) return { type: 'huir' };
  if (opts.retreatBelow && advantage(c, i) < opts.retreatBelow && fleeChance(c, i) >= 0.35) return { type: 'huir' };
  if (c.distance === 'lejos') return f.weapon.range === 'lejos' ? { type: 'atacar' } : { type: 'acercarse' };
  if (f.weapon.range === 'lejos' && o.weapon.range === 'cerca' && retreatChance(c, i) >= 0.5 && rng.chance(0.6)) return { type: 'alejarse' };
  if (has(f, 'intimidar') && !f.usedIntimidate && o.build.trait !== 'sangreFria') return { type: 'intimidar' };
  if (has(f, 'golpeBrutal') && !f.usedBrutal && f.weapon.range === 'cerca') return { type: 'atacar', brutal: true };
  if (has(f, 'contraataque') && !f.usedCounter && o.weapon.range === 'cerca' && f.energy >= COMBAT_ENERGY.esquivar) {
    return { type: 'esquivar', counter: true };
  }
  if (f.energy < attackCost(f) && f.energy >= COMBAT_ENERGY.defender) return { type: 'defender' };
  if (f.energy >= COMBAT_ENERGY.esquivar && f.base.dodgeChance >= 0.15 && rng.chance(0.2)) return { type: 'esquivar' };
  if (rng.chance(0.08)) return { type: 'defender' };
  return { type: 'atacar' };
}

/** Pelea completa con la política por defecto. Útil para bots y para el simulador. */
export function fight(c: Combat, rng: Rng, opts: [PolicyOptions, PolicyOptions] = [{}, {}]): Combat {
  while (!c.over) resolveRound(c, [chooseAction(c, 0, rng, opts[0]), chooseAction(c, 1, rng, opts[1])], rng);
  return c;
}

/**
 * Probabilidad de que un observador detecte a un objetivo en un segundo (GDD §5.1). La cobertura del
 * terreno del objetivo, la noche y el movimiento ya entran en el sigilo efectivo.
 */
export function detectionChance(
  observer: { build: DerivedInput; base?: DerivedStats; terrain: TerrainKind; night?: boolean; watching?: boolean; resting?: boolean; against?: 'emboscada' | 'trampa' | 'oculto' },
  target: { build: DerivedInput; base?: DerivedStats; terrain: TerrainKind; night?: boolean; moving?: boolean; hiding?: boolean; camouflaged?: boolean; allies?: number },
  distance: number,
): number {
  const so = situationalStats(observer.build, { terrain: observer.terrain, night: observer.night, against: observer.against }, observer.base).stats;
  const st = situationalStats(
    target.build,
    { terrain: target.terrain, night: target.night, hiding: target.hiding, camouflaged: target.camouflaged, allies: target.allies },
    target.base,
  ).stats;
  if (distance > so.visionRadius) return 0;
  const detection = so.detectionPower + (observer.watching ? 5 : 0) - (observer.resting ? 8 : 0);
  const stealth = st.stealthPower + TERRAIN_RULES[target.terrain].cover - (target.moving ? 6 : 0);
  const proximity = 1 - 0.75 * (distance / Math.max(1, so.visionRadius));
  return clamp(0.5 + (detection - stealth) / 20, 0.02, 0.95) * proximity;
}
