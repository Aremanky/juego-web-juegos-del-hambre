/** Estrategias preconfiguradas (GDD §5.8) y opciones estéticas (§5.9). */
export const COMBAT_STRATEGIES = ['agresiva', 'equilibrada', 'defensiva', 'huidiza'] as const;
export type CombatStrategy = (typeof COMBAT_STRATEGIES)[number];
export const COMBAT_STRATEGY_LABEL: Record<CombatStrategy, string> = {
  agresiva: 'Agresiva',
  equilibrada: 'Equilibrada',
  defensiva: 'Defensiva',
  huidiza: 'Huidiza',
};

export const FLEE_THRESHOLDS = [0.2, 0.35, 0.5] as const;
export type FleeThreshold = (typeof FLEE_THRESHOLDS)[number];

export const ALLIANCE_POLICIES = ['aceptar', 'evaluar', 'rechazar'] as const;
export type AlliancePolicy = (typeof ALLIANCE_POLICIES)[number];
export const ALLIANCE_POLICY_LABEL: Record<AlliancePolicy, string> = {
  aceptar: 'Aceptar siempre',
  evaluar: 'Evaluar (IA)',
  rechazar: 'Rechazar siempre',
};

/**
 * Colores de jugador: pigmentos apagados que conviven con el hollín y el oro
 * (ascua, ocre, sangre de buey, verdín, cobalto, ciruela, rubia, musgo, pino,
 * arena, hueso, terracota, glaciar, azafrán, rosa ceniza y pizarra).
 */
export const PLAYER_COLORS = [
  '#d9652e', '#c79a3f', '#b23a3f', '#4ea493', '#4b7bb0', '#8a64a8', '#b8608c', '#8ea64d',
  '#4f8b5d', '#d0ad7a', '#cdc6b6', '#d8846a', '#6fa9c8', '#dfa62e', '#c98b9b', '#76869b',
] as const;

export const FRAME_KEYS = ['laurel', 'hexagono', 'llama', 'sencillo', 'corona', 'espinas'] as const;
export type FrameKey = (typeof FRAME_KEYS)[number];
export const FRAME_LABEL: Record<FrameKey, string> = {
  laurel: 'Laurel',
  hexagono: 'Hexágono',
  llama: 'Llama',
  sencillo: 'Sencillo',
  corona: 'Corona',
  espinas: 'Espinas',
};
