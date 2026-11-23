import { Rng } from '../util/rng.js';
import { ATTR_MAX, ATTRIBUTE_KEYS, baseAttributes, budgetFor, stepCost, type AttributeKey, type Attributes } from './attributes.js';
import { ABILITIES, availableAbilities, type AbilityKey } from './abilities.js';
import { PERSONALITIES, PERSONALITY_KEYS, PLAYSTYLES, PLAYSTYLE_KEYS, type DifficultyKey, type PersonalityKey, type PlaystyleKey } from './bots.js';
import { DEFECT_KEYS, TRAIT_KEYS, type DefectKey, type TraitKey } from './traits.js';
import { FRAME_KEYS, PLAYER_COLORS } from './cosmetics.js';
import { BOT_NAMES, EPITHETS } from './names.js';
import type { Gender } from './districts.js';
import type { Character, Strategy } from '../schemas/character.js';
import type { BotSettings } from '../schemas/lobby.js';

const PLAYSTYLE_FOR: Record<PersonalityKey, PlaystyleKey[]> = {
  agresivo: ['cazador'],
  cauteloso: ['superviviente', 'trampero'],
  estratega: ['trampero', 'equilibrado', 'cazador'],
  pacifico: ['diplomatico', 'superviviente'],
  desconfiado: ['superviviente', 'cazador'],
  manipulador: ['diplomatico'],
  traicionero: ['diplomatico', 'cazador'],
  cooperativo: ['diplomatico', 'equilibrado'],
  explorador: ['saqueador'],
  impredecible: [...PLAYSTYLE_KEYS],
};

/** Mínimos que garantizan un bot viable y al menos 3 habilidades elegibles (forrajeo, carrera, escalada). */
const FLOORS: Partial<Record<AttributeKey, number>> = { aguante: 3, reflejos: 4, instinto: 3 };

export function generateBotAttributes(rng: Rng, personality: PersonalityKey, playstyle: PlaystyleKey, budget: number): Attributes {
  const attrs = baseAttributes();
  let remaining = budget;
  for (const [k, floor] of Object.entries(FLOORS) as [AttributeKey, number][]) {
    while (attrs[k] < floor && stepCost(attrs[k] + 1) <= remaining) {
      attrs[k]++;
      remaining -= stepCost(attrs[k]);
    }
  }
  const p = PERSONALITIES[personality];
  const s = PLAYSTYLES[playstyle];
  const weights = Object.fromEntries(
    ATTRIBUTE_KEYS.map((k) => {
      const base = 1 + (p.attrBias[k] ?? 0) + (s.attrBias[k] ?? 0);
      return [k, personality === 'impredecible' ? rng.float(0.3, 4) : base];
    }),
  ) as Record<AttributeKey, number>;

  for (let guard = 0; guard < 300; guard++) {
    const candidates = ATTRIBUTE_KEYS.filter((k) => attrs[k] < ATTR_MAX && stepCost(attrs[k] + 1) <= remaining);
    if (candidates.length === 0) break;
    const k = rng.weighted(candidates, (key) => weights[key] / (1 + 0.18 * attrs[key]));
    attrs[k]++;
    remaining -= stepCost(attrs[k]);
  }
  return attrs;
}

export function pickBotAbilities(rng: Rng, attrs: Attributes, personality: PersonalityKey, playstyle: PlaystyleKey): [AbilityKey, AbilityKey] {
  const avail = availableAbilities(attrs);
  const preferred = new Set(PLAYSTYLES[playstyle].preferredAbilities);
  const top = [...ATTRIBUTE_KEYS].sort((a, b) => attrs[b] - attrs[a]).slice(0, 2);
  const randomness = PERSONALITIES[personality].weights.randomness;
  const scored = avail
    .map((k) => {
      const synergy = ABILITIES[k].requirement.anyOf.some((c) => top.includes(c.attr)) ? 1.5 : 0;
      return { k, score: (preferred.has(k) ? 3 : 0) + synergy + rng.next() * (1 + 3 * randomness) };
    })
    .sort((a, b) => b.score - a.score);
  const first = scored[0]?.k ?? 'forrajeo';
  const second = scored.find((x) => x.k !== first)?.k ?? (first === 'carrera' ? 'forrajeo' : 'carrera');
  return [first, second];
}

function strategyFor(personality: PersonalityKey): Strategy {
  switch (personality) {
    case 'agresivo':
      return { combat: 'agresiva', fleeThreshold: 0.2, alliance: 'evaluar' };
    case 'cauteloso':
      return { combat: 'defensiva', fleeThreshold: 0.5, alliance: 'evaluar' };
    case 'pacifico':
      return { combat: 'huidiza', fleeThreshold: 0.5, alliance: 'aceptar' };
    case 'desconfiado':
      return { combat: 'equilibrada', fleeThreshold: 0.35, alliance: 'rechazar' };
    case 'cooperativo':
      return { combat: 'equilibrada', fleeThreshold: 0.35, alliance: 'aceptar' };
    case 'traicionero':
      return { combat: 'agresiva', fleeThreshold: 0.35, alliance: 'evaluar' };
    default:
      return { combat: 'equilibrada', fleeThreshold: 0.35, alliance: 'evaluar' };
  }
}

export function pickBotName(rng: Rng, gender: Gender, taken: ReadonlySet<string>): string {
  const free = BOT_NAMES[gender].filter((n) => !taken.has(n.toLowerCase()));
  if (free.length > 0) return rng.pick(free);
  const base = rng.pick(BOT_NAMES[gender]);
  for (let i = 2; i < 100; i++) {
    const n = `${base} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
  return `${base} ${rng.int(100, 999)}`;
}

export interface CreateBotOptions {
  rng: Rng;
  budget: number;
  difficulty: DifficultyKey;
  gender: Gender;
  district: number | null;
  takenNames: ReadonlySet<string>;
  personality?: PersonalityKey;
  playstyle?: PlaystyleKey;
}

export interface BotSpec {
  character: Character;
  settings: BotSettings;
}

export function createBot(o: CreateBotOptions): BotSpec {
  const { rng } = o;
  const personality = o.personality ?? rng.pick(PERSONALITY_KEYS);
  const playstyle = o.playstyle ?? rng.pick(PLAYSTYLE_FOR[personality]);
  const defect: DefectKey | null = rng.chance(0.15) ? rng.pick(DEFECT_KEYS) : null;
  const attributes = generateBotAttributes(rng, personality, playstyle, budgetFor(o.budget, defect != null));
  const abilities = pickBotAbilities(rng, attributes, personality, playstyle);
  const prefTraits = PERSONALITIES[personality].preferredTraits;
  const trait: TraitKey | null = rng.chance(0.7) && prefTraits.length > 0 ? rng.pick(prefTraits) : rng.chance(0.5) ? rng.pick(TRAIT_KEYS) : null;
  const name = pickBotName(rng, o.gender, o.takenNames);
  const epithet = rng.chance(0.6) ? rng.pick(EPITHETS)[o.gender] : '';
  const color = rng.pick(PLAYER_COLORS);
  return {
    character: {
      name,
      gender: o.gender,
      district: o.district,
      epithet,
      bio: PERSONALITIES[personality].description,
      color,
      frame: rng.pick(FRAME_KEYS),
      portrait: { kind: 'generated', seed: `${name}-${rng.int(0, 1e9)}` },
      victoryPhoto: null,
      attributes,
      defect,
      abilities,
      trait,
      strategy: strategyFor(personality),
    },
    settings: { difficulty: o.difficulty, personality, playstyle },
  };
}

/** Rehace atributos y habilidades de un bot respetando su personalidad (p. ej. al cambiar el presupuesto). */
export function rebalanceBot(rng: Rng, character: Character, settings: BotSettings, budget: number): Character {
  const attributes = generateBotAttributes(rng, settings.personality, settings.playstyle, budgetFor(budget, character.defect != null));
  const abilities = pickBotAbilities(rng, attributes, settings.personality, settings.playstyle);
  return { ...character, attributes, abilities, strategy: character.strategy ?? strategyFor(settings.personality) };
}
