import type { AttributeKey } from './attributes.js';
import type { AbilityKey } from './abilities.js';
import type { TraitKey } from './traits.js';

/** Personalidades, estilos y dificultades de bots (GDD §13). */
export const PERSONALITY_KEYS = [
  'agresivo',
  'cauteloso',
  'estratega',
  'pacifico',
  'desconfiado',
  'manipulador',
  'traicionero',
  'cooperativo',
  'explorador',
  'impredecible',
] as const;
export type PersonalityKey = (typeof PERSONALITY_KEYS)[number];

export interface PersonalityWeights {
  aggression: number;
  caution: number;
  sociability: number;
  loyalty: number;
  greed: number;
  curiosity: number;
  paranoia: number;
  randomness: number;
}

export interface PersonalityDef {
  key: PersonalityKey;
  name: string;
  description: string;
  weights: PersonalityWeights;
  /** Atributos que tiende a subir al autogenerarse. */
  attrBias: Partial<Record<AttributeKey, number>>;
  preferredTraits: TraitKey[];
}

const W = (aggression: number, caution: number, sociability: number, loyalty: number, greed: number, curiosity: number, paranoia: number, randomness: number): PersonalityWeights => ({
  aggression, caution, sociability, loyalty, greed, curiosity, paranoia, randomness,
});

export const PERSONALITIES: Record<PersonalityKey, PersonalityDef> = {
  agresivo: { key: 'agresivo', name: 'Agresivo', description: 'Busca pelea y presiona sin descanso.', weights: W(0.9, 0.2, 0.3, 0.5, 0.6, 0.4, 0.3, 0.2), attrBias: { potencia: 3, reflejos: 2, aguante: 1.5 }, preferredTraits: ['temerario', 'sangreFria'] },
  cauteloso: { key: 'cauteloso', name: 'Cauteloso', description: 'Evita riesgos, se esconde y espera su momento.', weights: W(0.25, 0.9, 0.4, 0.6, 0.4, 0.3, 0.6, 0.1), attrBias: { sigilo: 2.5, aguante: 2, instinto: 1.5 }, preferredTraits: ['precavido', 'solitario'] },
  estratega: { key: 'estratega', name: 'Inteligente y estratégico', description: 'Calcula cada paso, usa el terreno y planifica.', weights: W(0.5, 0.6, 0.6, 0.5, 0.5, 0.5, 0.4, 0.05), attrBias: { ingenio: 2.5, instinto: 2, reflejos: 1 }, preferredTraits: ['sangreFria', 'precavido'] },
  pacifico: { key: 'pacifico', name: 'Pacífico', description: 'Prefiere pactar y sobrevivir antes que luchar.', weights: W(0.1, 0.6, 0.8, 0.8, 0.3, 0.5, 0.2, 0.1), attrBias: { carisma: 2.5, aguante: 2, instinto: 1 }, preferredTraits: ['leal'] },
  desconfiado: { key: 'desconfiado', name: 'Desconfiado', description: 'Rechaza alianzas y ataca a quien se acerca demasiado.', weights: W(0.5, 0.7, 0.15, 0.4, 0.5, 0.3, 0.95, 0.15), attrBias: { instinto: 2.5, sigilo: 1.5, reflejos: 1.5 }, preferredTraits: ['paranoico', 'solitario'] },
  manipulador: { key: 'manipulador', name: 'Manipulador', description: 'Seduce con pactos y usa a los demás.', weights: W(0.45, 0.5, 0.9, 0.2, 0.7, 0.4, 0.4, 0.15), attrBias: { carisma: 3, sigilo: 1.5, ingenio: 1 }, preferredTraits: ['oportunista', 'dramatico'] },
  traicionero: { key: 'traicionero', name: 'Traicionero', description: 'Se alía para clavarte el puñal en el peor momento.', weights: W(0.6, 0.4, 0.7, 0.05, 0.8, 0.3, 0.5, 0.2), attrBias: { sigilo: 2.5, carisma: 2, potencia: 1 }, preferredTraits: ['oportunista'] },
  cooperativo: { key: 'cooperativo', name: 'Cooperativo', description: 'Comparte, defiende a sus aliados y cumple su palabra.', weights: W(0.35, 0.5, 0.95, 0.9, 0.3, 0.4, 0.2, 0.1), attrBias: { carisma: 2, aguante: 2, ingenio: 1.5 }, preferredTraits: ['leal'] },
  explorador: { key: 'explorador', name: 'Explorador', description: 'Recorre la arena entera y conoce cada rincón.', weights: W(0.35, 0.4, 0.5, 0.6, 0.6, 0.95, 0.3, 0.2), attrBias: { reflejos: 2.5, instinto: 2.5, aguante: 1 }, preferredTraits: ['insomne'] },
  impredecible: { key: 'impredecible', name: 'Impredecible', description: 'Nadie, ni él mismo, sabe qué hará.', weights: W(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.8), attrBias: {}, preferredTraits: ['dramatico', 'metabolismoRapido'] },
};

export const PLAYSTYLE_KEYS = ['cazador', 'superviviente', 'saqueador', 'diplomatico', 'trampero', 'equilibrado'] as const;
export type PlaystyleKey = (typeof PLAYSTYLE_KEYS)[number];

/** Lo que la IA de un bot puede decidir hoy (GDD §13). Comer, fabricar o aliarse llegan con la fase 8. */
export const BOT_ACTION_KEYS = ['obelisco', 'explorar', 'acechar', 'huir', 'esconderse', 'esperar'] as const;
export type BotActionKey = (typeof BOT_ACTION_KEYS)[number];

export interface PlaystyleDef {
  key: PlaystyleKey;
  name: string;
  description: string;
  attrBias: Partial<Record<AttributeKey, number>>;
  preferredAbilities: AbilityKey[];
  /** Multiplica la puntuación de cada acción en la IA del bot: el estilo modula los pesos (GDD §13). */
  actionBias: Partial<Record<BotActionKey, number>>;
}

export const PLAYSTYLES: Record<PlaystyleKey, PlaystyleDef> = {
  cazador: { key: 'cazador', name: 'Cazador', description: 'Prioriza encontrar y eliminar rivales.', attrBias: { potencia: 2, instinto: 1.5, reflejos: 1 }, preferredAbilities: ['rastrear', 'golpeBrutal', 'ojoCertero', 'carrera'], actionBias: { acechar: 1.3, huir: 0.9, esconderse: 0.85 } },
  superviviente: { key: 'superviviente', name: 'Superviviente', description: 'Evita combates y aguanta hasta el final.', attrBias: { aguante: 2, sigilo: 1.5, instinto: 1 }, preferredAbilities: ['ultimoAliento', 'forrajeo', 'camuflaje', 'resistenciaDolor'], actionBias: { huir: 1.2, esconderse: 1.3, esperar: 1.25, acechar: 0.75, obelisco: 0.75 } },
  saqueador: { key: 'saqueador', name: 'Saqueador', description: 'Va a por el mejor botín y los suministros.', attrBias: { reflejos: 1.5, potencia: 1, instinto: 1.5 }, preferredAbilities: ['carrera', 'forrajeo', 'escalada'], actionBias: { obelisco: 1.35, explorar: 1.15, acechar: 0.9 } },
  diplomatico: { key: 'diplomatico', name: 'Diplomático', description: 'Teje alianzas y pactos.', attrBias: { carisma: 2.5, aguante: 1 }, preferredAbilities: ['labia', 'showman', 'intimidar'], actionBias: { acechar: 0.8, explorar: 1.1, huir: 1.05 } },
  trampero: { key: 'trampero', name: 'Trampero', description: 'Emboscadas, trampas y señuelos.', attrBias: { ingenio: 2.5, sigilo: 1.5 }, preferredAbilities: ['trampero', 'senuelo', 'camuflaje'], actionBias: { esconderse: 1.25, esperar: 1.25, obelisco: 0.85, acechar: 1.05 } },
  equilibrado: { key: 'equilibrado', name: 'Equilibrado', description: 'Se adapta a lo que ofrezca la arena.', attrBias: {}, preferredAbilities: ['primerosAuxilios', 'forrajeo', 'carrera'], actionBias: {} },
};

export const DIFFICULTY_KEYS = ['facil', 'normal', 'dificil', 'experto'] as const;
export type DifficultyKey = (typeof DIFFICULTY_KEYS)[number];

export interface DifficultyDef {
  key: DifficultyKey;
  name: string;
  description: string;
  decisionNoise: number;
  thinkIntervalMs: number;
  memoryMs: number; // Infinity = completa
  combatEstimateNoise: number;
  anticipation: number; // 0..1
}

export const DIFFICULTIES: Record<DifficultyKey, DifficultyDef> = {
  facil: { key: 'facil', name: 'Fácil', description: 'Decide con torpeza y olvida rápido.', decisionNoise: 0.35, thinkIntervalMs: 2500, memoryMs: 60_000, combatEstimateNoise: 0.4, anticipation: 0 },
  normal: { key: 'normal', name: 'Normal', description: 'Un rival correcto.', decisionNoise: 0.2, thinkIntervalMs: 1500, memoryMs: 180_000, combatEstimateNoise: 0.2, anticipation: 0.4 },
  dificil: { key: 'dificil', name: 'Difícil', description: 'Planifica, anticipa la zona y usa el terreno.', decisionNoise: 0.1, thinkIntervalMs: 1000, memoryMs: Number.POSITIVE_INFINITY, combatEstimateNoise: 0.08, anticipation: 0.8 },
  experto: { key: 'experto', name: 'Experto', description: 'Decisiones casi óptimas. Sin trampas.', decisionNoise: 0.05, thinkIntervalMs: 800, memoryMs: Number.POSITIVE_INFINITY, combatEstimateNoise: 0.03, anticipation: 1 },
};
