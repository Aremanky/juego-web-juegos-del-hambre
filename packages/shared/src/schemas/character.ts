import { z } from 'zod';
import { ATTR_MAX, ATTR_MIN, ATTRIBUTE_KEYS, ATTRIBUTES, buildCost, budgetFor, type Attributes } from '../game/attributes.js';
import { ABILITIES, ABILITY_KEYS, describeRequirement, meetsRequirement } from '../game/abilities.js';
import { DEFECT_KEYS, TRAIT_KEYS } from '../game/traits.js';
import { DISTRICT_COUNT, GENDERS } from '../game/districts.js';
import { ALLIANCE_POLICIES, COMBAT_STRATEGIES, FRAME_KEYS, PLAYER_COLORS } from '../game/cosmetics.js';

const attr = z.number().int().min(ATTR_MIN).max(ATTR_MAX);

export const AttributesSchema = z.object({
  potencia: attr,
  reflejos: attr,
  aguante: attr,
  instinto: attr,
  sigilo: attr,
  ingenio: attr,
  carisma: attr,
});

export const PortraitSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('photo'), photoId: z.uuid(), v: z.number().int().min(0).max(1_000_000) }),
  z.object({ kind: z.literal('generated'), seed: z.string().min(1).max(64) }),
]);
export type Portrait = z.infer<typeof PortraitSchema>;

export const StrategySchema = z.object({
  combat: z.enum(COMBAT_STRATEGIES),
  fleeThreshold: z.union([z.literal(0.2), z.literal(0.35), z.literal(0.5)]),
  alliance: z.enum(ALLIANCE_POLICIES),
});
export type Strategy = z.infer<typeof StrategySchema>;

/** Quita caracteres de control y colapsa espacios. */
export const cleanText = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();

export const CharacterSchema = z.object({
  name: z.string().transform(cleanText).pipe(z.string().min(2, 'El nombre necesita al menos 2 caracteres').max(24)),
  gender: z.enum(GENDERS),
  /** Distrito preferido (en plantillas) o asignado (en sala). */
  district: z.number().int().min(1).max(DISTRICT_COUNT).nullable(),
  epithet: z.string().transform(cleanText).pipe(z.string().max(32)),
  bio: z.string().transform(cleanText).pipe(z.string().max(240)),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  frame: z.enum(FRAME_KEYS),
  portrait: PortraitSchema,
  victoryPhoto: PortraitSchema.nullable(),
  attributes: AttributesSchema,
  defect: z.enum(DEFECT_KEYS).nullable(),
  abilities: z.array(z.enum(ABILITY_KEYS)).length(2),
  trait: z.enum(TRAIT_KEYS).nullable(),
  strategy: StrategySchema,
});
export type Character = z.infer<typeof CharacterSchema>;

export interface BuildIssue {
  code: 'over_budget' | 'ability_requirement' | 'duplicate_ability';
  message: string;
}

export interface BuildSummary {
  cost: number;
  budget: number;
  remaining: number;
  issues: BuildIssue[];
  valid: boolean;
}

const ATTR_NAMES = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, ATTRIBUTES[k].name])) as Record<keyof Attributes, string>;

/** Validación de reglas de construcción (además del esquema). */
export function summarizeBuild(c: Pick<Character, 'attributes' | 'abilities' | 'defect'>, baseBudget: number): BuildSummary {
  const issues: BuildIssue[] = [];
  const cost = buildCost(c.attributes);
  const budget = budgetFor(baseBudget, c.defect != null);
  if (cost > budget) {
    issues.push({ code: 'over_budget', message: `Has gastado ${cost} puntos y el máximo es ${budget}.` });
  }
  if (new Set(c.abilities).size !== c.abilities.length) {
    issues.push({ code: 'duplicate_ability', message: 'No puedes elegir dos veces la misma habilidad.' });
  }
  for (const key of c.abilities) {
    const def = ABILITIES[key];
    if (!meetsRequirement(c.attributes, def.requirement)) {
      issues.push({
        code: 'ability_requirement',
        message: `${def.name} requiere ${describeRequirement(def.requirement, ATTR_NAMES)}.`,
      });
    }
  }
  return { cost, budget, remaining: budget - cost, issues, valid: issues.length === 0 };
}

export function defaultCharacter(opts: { name?: string; gender?: 'M' | 'F'; seed?: string; color?: string } = {}): Character {
  return {
    name: opts.name && opts.name.length >= 2 ? opts.name.slice(0, 24) : 'Elegido',
    gender: opts.gender ?? 'M',
    district: null,
    epithet: '',
    bio: '',
    color: opts.color ?? PLAYER_COLORS[0],
    frame: 'laurel',
    portrait: { kind: 'generated', seed: opts.seed ?? 'ceniza' },
    victoryPhoto: null,
    attributes: { potencia: 5, reflejos: 5, aguante: 5, instinto: 5, sigilo: 5, ingenio: 5, carisma: 5 },
    defect: null,
    abilities: ['primerosAuxilios', 'forrajeo'],
    trait: null,
    strategy: { combat: 'equilibrada', fleeThreshold: 0.35, alliance: 'evaluar' },
  };
}

/** Datos públicos que ven los demás humanos de un participante humano (sin su build). */
export type PublicCharacter = Pick<Character, 'name' | 'gender' | 'district' | 'epithet' | 'bio' | 'color' | 'frame' | 'portrait'>;

export function toPublicCharacter(c: Character): PublicCharacter {
  return { name: c.name, gender: c.gender, district: c.district, epithet: c.epithet, bio: c.bio, color: c.color, frame: c.frame, portrait: c.portrait };
}

/** Plantilla guardada (API REST). */
export const TemplateUpsertSchema = z.object({ data: CharacterSchema });
export interface TemplateDTO {
  id: string;
  name: string;
  data: Character;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export const MAX_TEMPLATE_BUDGET = 32;
