import type { AbilityKey } from './abilities.js';
import { computeDerived, type DerivedInput, type DerivedStats } from './derived.js';
import type { WeaponTag } from './items.js';
import { TERRAIN_KINDS, TERRAIN_RULES, type TerrainKind } from './terrain.js';
import type { DefectKey, TraitKey } from './traits.js';

/**
 * Efectos que dependen de la situación (GDD §5.3–5.6, §9). `computeDerived` da los valores de base
 * (lo que no depende de nada); aquí se suman los que solo valen en un terreno, de noche, escondido,
 * en combate… Lo usan el motor, el combate, el simulador de equilibrio y el editor (para explicarlos).
 */
export type Activity = 'comida' | 'agua' | 'pescar' | 'madera' | 'herramienta' | 'traicion';
export type Against = 'trampa' | 'emboscada' | 'oculto';

export interface Situation {
  terrain?: TerrainKind;
  night?: boolean;
  hiding?: boolean;
  climbing?: boolean;
  camouflaged?: boolean;
  sprinting?: boolean;
  pursuing?: boolean;
  allies?: number;
  hpFraction?: number;
  attack?: 'cerca' | 'lejos';
  weaponTags?: readonly WeaponTag[];
  firstAttack?: boolean;
  against?: Against;
  activity?: Activity;
}

export type ModifierSource =
  | { kind: 'district'; id: number }
  | { kind: 'ability'; key: AbilityKey }
  | { kind: 'trait'; key: TraitKey }
  | { kind: 'defect'; key: DefectKey }
  | { kind: 'rule'; key: 'terreno' | 'noche' | 'saludBaja' };

export interface SituationalStats extends DerivedStats {
  /** Multiplica el daño que haces. */
  damageMult: number;
  /** Multiplica el daño que recibes. */
  damageTakenMult: number;
  /** Se suma a la probabilidad de acertar. */
  hitBonus: number;
  /** Se suma a la probabilidad de huir. */
  fleeBonus: number;
  /** Multiplica la duración de los estados negativos. */
  statusDurationMult: number;
}
export type SituationalKey = keyof SituationalStats;

export interface Condition {
  terrain?: readonly TerrainKind[];
  night?: boolean;
  hiding?: boolean;
  climbing?: boolean;
  camouflaged?: boolean;
  sprinting?: boolean;
  pursuing?: boolean;
  noAllies?: boolean;
  hpBelow?: number;
  attack?: 'cerca' | 'lejos';
  weaponTag?: WeaponTag;
  firstAttack?: boolean;
  against?: readonly Against[];
  activity?: readonly Activity[];
}

export interface SituationalModifier {
  source: ModifierSource;
  stat: SituationalKey;
  op: 'mult' | 'add';
  value: number;
  when: Condition;
  /** Cuándo se aplica, en palabras («en el bosque», «escondido»…). */
  text: string;
}

const district = (id: number): ModifierSource => ({ kind: 'district', id });
const ability = (key: AbilityKey): ModifierSource => ({ kind: 'ability', key });
const trait = (key: TraitKey): ModifierSource => ({ kind: 'trait', key });

export const SITUATIONAL_MODIFIERS: readonly SituationalModifier[] = [
  { source: district(1), stat: 'damageMult', op: 'mult', value: 1.1, when: { weaponTag: 'metal' }, text: 'con armas metálicas' },
  { source: district(3), stat: 'craftTimeMult', op: 'mult', value: 0.8, when: { activity: ['herramienta'] }, text: 'fabricando herramientas' },
  { source: district(4), stat: 'searchYield', op: 'mult', value: 1.5, when: { activity: ['pescar'] }, text: 'pescando' },
  { source: district(7), stat: 'damageMult', op: 'mult', value: 1.15, when: { weaponTag: 'hacha' }, text: 'con hacha' },
  { source: district(7), stat: 'searchYield', op: 'mult', value: 1.3, when: { activity: ['madera'] }, text: 'recogiendo madera' },
  { source: district(8), stat: 'stealthPower', op: 'mult', value: 1.15, when: { hiding: true }, text: 'escondido' },
  { source: district(10), stat: 'visionRadius', op: 'mult', value: 1.1, when: { terrain: ['montana', 'cumbre'] }, text: 'en altura' },

  { source: ability('carrera'), stat: 'moveSpeed', op: 'mult', value: 1.6, when: { sprinting: true }, text: 'durante la carrera' },
  { source: ability('carrera'), stat: 'fleeBonus', op: 'add', value: 0.25, when: { sprinting: true }, text: 'huyendo a la carrera' },
  { source: ability('camuflaje'), stat: 'stealthPower', op: 'add', value: 10, when: { camouflaged: true }, text: 'camuflado' },
  { source: ability('escalada'), stat: 'visionRadius', op: 'mult', value: 1.4, when: { climbing: true }, text: 'subido a un árbol' },
  { source: ability('escalada'), stat: 'stealthPower', op: 'add', value: 8, when: { climbing: true }, text: 'subido a un árbol' },
  { source: ability('ojoCertero'), stat: 'critChance', op: 'add', value: 0.1, when: { attack: 'lejos' }, text: 'a distancia' },
  { source: ability('forrajeo'), stat: 'searchYield', op: 'mult', value: 1.4, when: { activity: ['comida', 'agua'] }, text: 'buscando comida o agua' },
  { source: ability('resistenciaDolor'), stat: 'statusDurationMult', op: 'mult', value: 0.6, when: {}, text: 'siempre' },

  { source: trait('sangreFria'), stat: 'hitBonus', op: 'add', value: 0.1, when: { hpBelow: 0.5 }, text: 'con menos de la mitad de salud' },
  { source: trait('temerario'), stat: 'damageMult', op: 'mult', value: 1.15, when: { firstAttack: true }, text: 'en tu primer ataque de cada combate' },
  { source: trait('temerario'), stat: 'moveSpeed', op: 'mult', value: 1.05, when: { pursuing: true }, text: 'persiguiendo' },
  { source: trait('temerario'), stat: 'damageTakenMult', op: 'mult', value: 1.15, when: {}, text: 'siempre' },
  { source: trait('precavido'), stat: 'detectionPower', op: 'mult', value: 1.2, when: { against: ['trampa', 'emboscada'] }, text: 'contra trampas y emboscadas' },
  { source: trait('solitario'), stat: 'searchYield', op: 'mult', value: 1.1, when: { noAllies: true }, text: 'sin aliados' },
  { source: trait('solitario'), stat: 'stealthPower', op: 'mult', value: 1.1, when: { noAllies: true }, text: 'sin aliados' },
  { source: trait('solitario'), stat: 'damageMult', op: 'mult', value: 1.1, when: { noAllies: true }, text: 'sin aliados' },
  { source: trait('oportunista'), stat: 'damageMult', op: 'mult', value: 1.25, when: { activity: ['traicion'] }, text: 'al traicionar' },
];

/** Por debajo de esta fracción de salud se lucha y se corre peor, salvo con Resistencia al dolor. */
export const LOW_HEALTH = 0.3;
export const LOW_HEALTH_MULT = 0.9;
/** De noche el sigilo sube (GDD §4). */
export const NIGHT_STEALTH = 5;

export function hasSource(input: DerivedInput, s: ModifierSource): boolean {
  switch (s.kind) {
    case 'district':
      return input.district === s.id;
    case 'ability':
      return (input.abilities ?? []).includes(s.key);
    case 'trait':
      return input.trait === s.key;
    case 'defect':
      return input.defect === s.key;
    case 'rule':
      return true;
  }
}

export function conditionHolds(c: Condition, s: Situation): boolean {
  if (c.terrain && !(s.terrain && c.terrain.includes(s.terrain))) return false;
  if (c.night !== undefined && !!s.night !== c.night) return false;
  if (c.hiding && !s.hiding) return false;
  if (c.climbing && !s.climbing) return false;
  if (c.camouflaged && !s.camouflaged) return false;
  if (c.sprinting && !s.sprinting) return false;
  if (c.pursuing && !s.pursuing) return false;
  if (c.noAllies && (s.allies ?? 0) > 0) return false;
  if (c.hpBelow !== undefined && !((s.hpFraction ?? 1) < c.hpBelow)) return false;
  if (c.attack && s.attack !== c.attack) return false;
  if (c.weaponTag && !(s.weaponTags ?? []).includes(c.weaponTag)) return false;
  if (c.firstAttack && !s.firstAttack) return false;
  if (c.against && !(s.against && c.against.includes(s.against))) return false;
  if (c.activity && !(s.activity && c.activity.includes(s.activity))) return false;
  return true;
}

export interface AppliedModifier {
  source: ModifierSource;
  stat: SituationalKey;
  op: 'mult' | 'add';
  value: number;
  text: string;
}

/** Estadísticas efectivas en una situación concreta, con la lista de efectos que se han aplicado. */
export function situationalStats(input: DerivedInput, sit: Situation = {}, base?: DerivedStats): { stats: SituationalStats; applied: AppliedModifier[] } {
  const d = base ?? computeDerived(input);
  const stats: SituationalStats = { ...d, damageMult: 1, damageTakenMult: 1, hitBonus: 0, fleeBonus: 0, statusDurationMult: 1 };
  const applied: AppliedModifier[] = [];
  const apply = (m: Omit<AppliedModifier, 'value'> & { value: number }) => {
    if (m.op === 'mult') stats[m.stat] *= m.value;
    else stats[m.stat] += m.value;
    applied.push(m);
  };

  if (sit.terrain) {
    const rule = TERRAIN_RULES[sit.terrain];
    if (rule.vision !== 1) apply({ source: { kind: 'rule', key: 'terreno' }, stat: 'visionRadius', op: 'mult', value: rule.vision, text: rule.name.toLowerCase() });
  }
  if (sit.night) {
    apply({ source: { kind: 'rule', key: 'noche' }, stat: 'visionRadius', op: 'mult', value: d.nightVisionMult, text: 'de noche' });
    apply({ source: { kind: 'rule', key: 'noche' }, stat: 'stealthPower', op: 'add', value: NIGHT_STEALTH, text: 'de noche' });
  }
  if ((sit.hpFraction ?? 1) < LOW_HEALTH && !(input.abilities ?? []).includes('resistenciaDolor')) {
    const text = `con menos del ${Math.round(LOW_HEALTH * 100)} % de salud`;
    apply({ source: { kind: 'rule', key: 'saludBaja' }, stat: 'damageMult', op: 'mult', value: LOW_HEALTH_MULT, text });
    apply({ source: { kind: 'rule', key: 'saludBaja' }, stat: 'moveSpeed', op: 'mult', value: LOW_HEALTH_MULT, text });
  }
  for (const m of SITUATIONAL_MODIFIERS) {
    if (hasSource(input, m.source) && conditionHolds(m.when, sit)) apply(m);
  }
  if (stats.critChance > 0.95) stats.critChance = 0.95;
  return { stats, applied };
}

/** Efectos que dependen de la situación y que tiene este personaje (para mostrarlos en el editor). */
export function situationalModifiersFor(input: DerivedInput): SituationalModifier[] {
  return SITUATIONAL_MODIFIERS.filter((m) => hasSource(input, m.source));
}

// ------------------------------------------------------------------ movimiento por terreno
export interface MovementPerk {
  source: ModifierSource;
  terrain: readonly TerrainKind[];
  /** Coste fijo de la casilla («sin penalización» = 1). */
  cost?: number;
  /** Divide el coste: +12 % de velocidad = ×1,12. */
  speedMult?: number;
  text: string;
}

export const MOVEMENT_PERKS: readonly MovementPerk[] = [
  { source: district(4), terrain: ['agua', 'orilla'], cost: 1, text: 'nada sin penalización' },
  { source: district(6), terrain: ['pradera', 'plaza'], speedMult: 1.08, text: '+8 % de velocidad en praderas y caminos' },
  { source: district(7), terrain: ['bosque', 'denso'], speedMult: 1.12, text: '+12 % de velocidad en el bosque' },
  { source: district(10), terrain: ['montana', 'roca'], cost: 1, text: 'sin penalización en montaña y roca' },
  { source: district(10), terrain: ['cumbre'], cost: 1.5, text: 'media penalización en las cumbres' },
];

/** Coste de cada terreno para este personaje, en el orden de `TERRAIN_KINDS`. */
export function terrainCosts(input: DerivedInput): number[] {
  return TERRAIN_KINDS.map((k) => {
    let cost = TERRAIN_RULES[k].cost;
    for (const p of MOVEMENT_PERKS) {
      if (!p.terrain.includes(k) || !hasSource(input, p.source)) continue;
      if (p.cost !== undefined) cost = Math.min(cost, p.cost);
      if (p.speedMult !== undefined) cost /= p.speedMult;
    }
    return Math.round(cost * 1000) / 1000;
  });
}

/** Radio de visión de día en cada terreno para este personaje, en el orden de `TERRAIN_KINDS`. */
export function visionByTerrain(input: DerivedInput, base?: DerivedStats): number[] {
  const d = base ?? computeDerived(input);
  return TERRAIN_KINDS.map((k) => Math.round(situationalStats(input, { terrain: k }, d).stats.visionRadius * 100) / 100);
}
