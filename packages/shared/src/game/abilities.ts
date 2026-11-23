import type { AttributeKey, Attributes } from './attributes.js';

/** Habilidades (GDD §5.3). Cada personaje elige 2. */
export const ABILITY_KEYS = [
  'carrera',
  'camuflaje',
  'rastrear',
  'golpeBrutal',
  'contraataque',
  'primerosAuxilios',
  'trampero',
  'intimidar',
  'labia',
  'forrajeo',
  'escalada',
  'ojoCertero',
  'ultimoAliento',
  'senuelo',
  'showman',
  'resistenciaDolor',
] as const;

export type AbilityKey = (typeof ABILITY_KEYS)[number];
export type AbilityKind = 'activa' | 'pasiva' | 'combate';

/** Requisito: basta con cumplir UNA de las condiciones. */
export interface AbilityRequirement {
  anyOf: { attr: AttributeKey; min: number }[];
}

export interface AbilityDef {
  key: AbilityKey;
  name: string;
  kind: AbilityKind;
  icon: string;
  requirement: AbilityRequirement;
  description: string;
  cooldownS?: number;
  energyCost?: number;
  durationS?: number;
}

const req = (...anyOf: { attr: AttributeKey; min: number }[]): AbilityRequirement => ({ anyOf });

export const ABILITIES: Record<AbilityKey, AbilityDef> = {
  carrera: {
    key: 'carrera', name: 'Carrera', kind: 'activa', icon: 'Wind', requirement: req({ attr: 'reflejos', min: 4 }),
    description: '+60% de velocidad durante 8 s.', cooldownS: 60, energyCost: 25, durationS: 8,
  },
  camuflaje: {
    key: 'camuflaje', name: 'Camuflaje', kind: 'activa', icon: 'Leaf', requirement: req({ attr: 'sigilo', min: 4 }),
    description: 'Te ocultas al instante, incluso en terreno abierto, con +10 de sigilo durante 25 s.', cooldownS: 90, durationS: 25,
  },
  rastrear: {
    key: 'rastrear', name: 'Rastrear', kind: 'activa', icon: 'Footprints', requirement: req({ attr: 'instinto', min: 4 }),
    description: 'Revela rastros (última posición y rumbo) en 30 casillas durante 20 s.', cooldownS: 75, durationS: 20,
  },
  golpeBrutal: {
    key: 'golpeBrutal', name: 'Golpe brutal', kind: 'combate', icon: 'Hammer', requirement: req({ attr: 'potencia', min: 5 }),
    description: 'Tu siguiente golpe cuerpo a cuerpo hace +60% de daño y puede aturdir (50%). Una vez por combate.',
  },
  contraataque: {
    key: 'contraataque', name: 'Contraataque', kind: 'combate', icon: 'Swords', requirement: req({ attr: 'reflejos', min: 5 }),
    description: 'Durante una ronda, cada esquiva con éxito devuelve un golpe al 70%. Una vez por combate.',
  },
  primerosAuxilios: {
    key: 'primerosAuxilios', name: 'Primeros auxilios', kind: 'activa', icon: 'Cross', requirement: req({ attr: 'ingenio', min: 4 }),
    description: 'Cura 18 PV y corta el sangrado sin gastar objetos (6 s).', cooldownS: 120, durationS: 6,
  },
  trampero: {
    key: 'trampero', name: 'Trampero', kind: 'pasiva', icon: 'Radar', requirement: req({ attr: 'ingenio', min: 5 }),
    description: 'Colocas trampas en la mitad de tiempo, con un material menos, +1 trampa activa y +20% de daño.',
  },
  intimidar: {
    key: 'intimidar', name: 'Intimidar', kind: 'combate', icon: 'Skull',
    requirement: req({ attr: 'carisma', min: 4 }, { attr: 'potencia', min: 6 }),
    description: 'Si el rival falla su tirada, hace −30% de daño 2 rondas. Fuera de combate, disuade a los bots 30 s.', cooldownS: 90,
  },
  labia: {
    key: 'labia', name: 'Labia', kind: 'pasiva', icon: 'MessagesSquare', requirement: req({ attr: 'carisma', min: 5 }),
    description: '+25% de aceptación de tus propuestas, pactos un 50% más largos y desbloquea «Sembrar discordia».',
  },
  forrajeo: {
    key: 'forrajeo', name: 'Forrajeo', kind: 'pasiva', icon: 'Sprout', requirement: req({ attr: 'instinto', min: 3 }),
    description: '+40% de comida y agua al buscar, detectas comida venenosa y el agua turbia te enferma la mitad de veces.',
  },
  escalada: {
    key: 'escalada', name: 'Escalada', kind: 'activa', icon: 'TreePine',
    requirement: req({ attr: 'reflejos', min: 4 }, { attr: 'potencia', min: 4 }),
    description: 'En el bosque, trepas: inmune al cuerpo a cuerpo, +40% de visión y +8 de sigilo, pero inmóvil.',
  },
  ojoCertero: {
    key: 'ojoCertero', name: 'Ojo certero', kind: 'pasiva', icon: 'Crosshair', requirement: req({ attr: 'instinto', min: 5 }),
    description: '+15% de precisión y +10% de crítico a distancia. Ves la salud aproximada de quien ves.',
  },
  ultimoAliento: {
    key: 'ultimoAliento', name: 'Último aliento', kind: 'pasiva', icon: 'ShieldAlert', requirement: req({ attr: 'aguante', min: 6 }),
    description: 'Una vez por partida, sobrevives a un golpe letal con 1 PV, +30 de energía y 3 s de invulnerabilidad.',
  },
  senuelo: {
    key: 'senuelo', name: 'Señuelo', kind: 'activa', icon: 'Bell',
    requirement: req({ attr: 'ingenio', min: 3 }, { attr: 'sigilo', min: 3 }),
    description: 'Lanzas un señuelo a ≤8 casillas que genera ruido y una huella falsa durante 20 s.', cooldownS: 90, durationS: 20,
  },
  showman: {
    key: 'showman', name: 'Showman', kind: 'pasiva', icon: 'Sparkles', requirement: req({ attr: 'carisma', min: 6 }),
    description: '+35% de favor y mecenas un 20% más baratos. A cambio, tu posición se revela 5 s al empezar cada combate.',
  },
  resistenciaDolor: {
    key: 'resistenciaDolor', name: 'Resistencia al dolor', kind: 'pasiva', icon: 'Shield', requirement: req({ attr: 'aguante', min: 4 }),
    description: 'Estados negativos −40% de duración, sin penalización por salud baja y +10% de salud máxima.',
  },
};

export function meetsRequirement(attrs: Attributes, requirement: AbilityRequirement): boolean {
  return requirement.anyOf.some((c) => attrs[c.attr] >= c.min);
}

export function describeRequirement(requirement: AbilityRequirement, names: Record<AttributeKey, string>): string {
  return requirement.anyOf.map((c) => `${names[c.attr]} ${c.min}`).join(' o ');
}

export function availableAbilities(attrs: Attributes): AbilityKey[] {
  return ABILITY_KEYS.filter((k) => meetsRequirement(attrs, ABILITIES[k].requirement));
}
