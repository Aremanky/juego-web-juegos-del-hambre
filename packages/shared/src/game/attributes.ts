/**
 * Sistema de atributos (GDD §5.1).
 * 7 atributos de 1 a 10 con coste creciente: niveles 2–6 cuestan 1, 7–8 cuestan 2, 9–10 cuestan 3.
 */
export const ATTRIBUTE_KEYS = [
  'potencia',
  'reflejos',
  'aguante',
  'instinto',
  'sigilo',
  'ingenio',
  'carisma',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

export const ATTR_MIN = 1;
export const ATTR_MAX = 10;
export const ATTRIBUTE_BUDGETS = [24, 28, 32] as const;
export type AttributeBudget = (typeof ATTRIBUTE_BUDGETS)[number];
export const DEFAULT_ATTRIBUTE_BUDGET: AttributeBudget = 28;
export const DEFECT_BONUS_POINTS = 2;

export interface AttributeDef {
  key: AttributeKey;
  name: string;
  short: string;
  /** Nombre de icono de lucide-react (lo resuelve el cliente). */
  icon: string;
  color: string;
  summary: string;
  effects: string[];
  drawback: string;
}

export const ATTRIBUTES: Record<AttributeKey, AttributeDef> = {
  potencia: {
    key: 'potencia',
    name: 'Potencia',
    short: 'POT',
    icon: 'Dumbbell',
    color: '#ff6a2b',
    summary: 'Fuerza bruta y corpulencia.',
    effects: ['Daño cuerpo a cuerpo', 'Carga máxima', 'Algo de salud', 'Intimidación', 'Armas pesadas sin penalización'],
    drawback: 'Más hambre: un cuerpo grande quema más.',
  },
  reflejos: {
    key: 'reflejos',
    name: 'Reflejos',
    short: 'REF',
    icon: 'Zap',
    color: '#ffd23f',
    summary: 'Velocidad, coordinación y reacción.',
    effects: ['Velocidad de movimiento', 'Esquiva', 'Iniciativa en combate', 'Probabilidad de huida', 'Algo de energía'],
    drawback: 'Sin Aguante, eres rápido pero frágil.',
  },
  aguante: {
    key: 'aguante',
    name: 'Aguante',
    short: 'AGU',
    icon: 'HeartPulse',
    color: '#d7263d',
    summary: 'Resistencia física y mental.',
    effects: ['Salud máxima', 'Energía y su regeneración', 'Menos hambre y sed', 'Resistencia a estados', 'Tolerancia al frío y al calor'],
    drawback: 'Te mantiene vivo, pero no gana combates.',
  },
  instinto: {
    key: 'instinto',
    name: 'Instinto',
    short: 'INS',
    icon: 'Eye',
    color: '#38e1d0',
    summary: 'Percepción, puntería y sentido de la naturaleza.',
    effects: ['Radio de visión', 'Detectar ocultos y trampas', 'Puntería a distancia', 'Críticos', 'Buscar recursos más rápido y mejor'],
    drawback: 'Ver venir el golpe no lo para.',
  },
  sigilo: {
    key: 'sigilo',
    name: 'Sigilo',
    short: 'SIG',
    icon: 'Ghost',
    color: '#8c6cf0',
    summary: 'Pasar desapercibido y golpear sin avisar.',
    effects: ['Ocultarse', 'Menos ruido al moverse', 'Daño de emboscada', 'Robar'],
    drawback: 'Si te encuentran, estás expuesto.',
  },
  ingenio: {
    key: 'ingenio',
    name: 'Ingenio',
    short: 'ING',
    icon: 'Wrench',
    color: '#d4a63a',
    summary: 'Manos hábiles y cabeza fría.',
    effects: ['Velocidad y calidad de fabricación', 'Trampas', 'Eficacia curando', 'Investigar puntos de interés', 'Recetas avanzadas'],
    drawback: 'Necesita materiales: empieza lento.',
  },
  carisma: {
    key: 'carisma',
    name: 'Carisma',
    short: 'CAR',
    icon: 'Crown',
    color: '#f28fad',
    summary: 'Presencia, labia y favor del público.',
    effects: ['Favor de la Audiencia', 'Mecenas más baratos', 'Aceptación de alianzas', 'Negociación', 'Intimidación'],
    drawback: 'Solo rinde si juegas con los demás.',
  },
};

/** Coste de subir al nivel `level` desde `level-1`. */
export function stepCost(level: number): number {
  if (level <= 6) return 1;
  if (level <= 8) return 2;
  return 3;
}

/** Coste total de llevar un atributo de 1 a `level`. */
export function costToReach(level: number): number {
  let c = 0;
  for (let l = ATTR_MIN + 1; l <= level; l++) c += stepCost(l);
  return c;
}

export function buildCost(attrs: Attributes): number {
  return ATTRIBUTE_KEYS.reduce((acc, k) => acc + costToReach(attrs[k]), 0);
}

export function budgetFor(baseBudget: number, hasDefect: boolean): number {
  return baseBudget + (hasDefect ? DEFECT_BONUS_POINTS : 0);
}

export function baseAttributes(): Attributes {
  return { potencia: 1, reflejos: 1, aguante: 1, instinto: 1, sigilo: 1, ingenio: 1, carisma: 1 };
}

export function isAttributes(value: unknown): value is Attributes {
  if (!value || typeof value !== 'object') return false;
  return ATTRIBUTE_KEYS.every((k) => {
    const v = (value as Record<string, unknown>)[k];
    return typeof v === 'number' && Number.isInteger(v) && v >= ATTR_MIN && v <= ATTR_MAX;
  });
}
