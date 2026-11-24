import type { Attributes } from './attributes.js';
import type { AbilityKey } from './abilities.js';
import type { DefectKey, TraitKey } from './traits.js';

/**
 * Estadísticas derivadas (GDD §5.1). El motor de partida usa EXACTAMENTE estas funciones;
 * el editor las muestra en vivo. Los modificadores situacionales (terreno, noche, alianzas…)
 * los aplica el motor encima de estos valores base.
 */
export interface DerivedInput {
  attributes: Attributes;
  district?: number | null;
  trait?: TraitKey | null;
  defect?: DefectKey | null;
  abilities?: readonly AbilityKey[];
}

export interface DerivedStats {
  maxHp: number;
  maxEnergy: number;
  energyRegen: number; // por segundo descansando
  hpRegen: number; // por segundo descansando
  moveSpeed: number; // casillas/s en terreno de coste 1
  carryCapacity: number; // kg
  meleeMult: number;
  rangedMult: number;
  rangedAccuracy: number; // 0..0.95
  critChance: number;
  dodgeChance: number;
  initiative: number;
  visionRadius: number; // casillas, de día
  nightVisionMult: number;
  detectionPower: number;
  stealthPower: number;
  noiseRadius: number; // casillas al caminar
  ambushMult: number;
  craftTimeMult: number;
  craftQuality: number; // −0.24..+0.30
  healEfficiency: number;
  trapPower: number;
  searchTimeMult: number;
  searchYield: number;
  hungerRate: number; // multiplicador
  thirstRate: number; // multiplicador
  statusResist: number; // 0..0.5
  favorMult: number;
  socialAppeal: number; // suma en la evaluación de alianzas de los bots
  intimidation: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export function computeDerived(input: DerivedInput): DerivedStats {
  const a = input.attributes;
  const ab = new Set(input.abilities ?? []);
  const t = input.trait ?? null;
  const df = input.defect ?? null;
  const d = input.district ?? null;

  let maxHp = 70 + 6 * a.aguante + 2 * a.potencia;
  let maxEnergy = 60 + 5 * a.aguante + 1.5 * a.reflejos;
  let energyRegen = 1.0 + 0.1 * a.aguante;
  let hpRegen = 0.25 + 0.03 * a.aguante;
  let moveSpeed = 0.9 + 0.07 * a.reflejos;
  const carryCapacity = 8 + 1.5 * a.potencia;
  const meleeMult = 1 + 0.07 * (a.potencia - 5);
  const rangedMult = 1 + 0.05 * (a.instinto - 5);
  let rangedAccuracy = 0.55 + 0.04 * a.instinto;
  const critChance = 0.04 + 0.012 * a.instinto;
  const dodgeChance = 0.04 + 0.022 * a.reflejos;
  const initiative = a.reflejos;
  let visionRadius = 6 + 0.6 * a.instinto;
  let nightVisionMult = 0.6;
  let detectionPower = 10 + 3 * a.instinto;
  const stealthPower = 10 + 3 * a.sigilo;
  let noiseRadius = Math.max(1.5, 5 - 0.3 * a.sigilo);
  const ambushMult = 1.5 + 0.1 * a.sigilo;
  let craftTimeMult = 1.3 - 0.05 * a.ingenio;
  const craftQuality = 0.06 * (a.ingenio - 5);
  let healEfficiency = 1 + 0.06 * (a.ingenio - 5);
  let trapPower = 1 + 0.08 * (a.ingenio - 5);
  const searchTimeMult = 1.2 - 0.04 * a.instinto;
  const searchYield = 1 + 0.06 * (a.instinto - 5);
  let hungerRate = (1 + 0.04 * (a.potencia - 5)) * (1 - 0.035 * (a.aguante - 5));
  let thirstRate = 1 - 0.035 * (a.aguante - 5);
  const statusResist = clamp(0.05 * a.aguante, 0, 0.5);
  let favorMult = 1 + 0.08 * (a.carisma - 5);
  let socialAppeal = 0.07 * (a.carisma - 5);
  const intimidation = (a.carisma + a.potencia) / 2;

  // Distritos (solo efectos incondicionales; el resto los aplica el motor según contexto)
  if (d === 2) healEfficiency *= 1.25;
  if (d === 3) trapPower *= 1.25;
  if (d === 5) maxEnergy *= 1.1;
  if (d === 9) hungerRate *= 0.85;
  if (d === 11) favorMult *= 1.15;
  if (d === 12) {
    maxHp *= 1.08;
    nightVisionMult *= 1.3;
  }

  // Habilidades pasivas incondicionales
  if (ab.has('resistenciaDolor')) maxHp *= 1.1;
  if (ab.has('showman')) favorMult *= 1.35;
  if (ab.has('trampero')) trapPower *= 1.2;
  if (ab.has('labia')) socialAppeal += 0.25;
  if (ab.has('ojoCertero')) rangedAccuracy += 0.15;

  // Rasgos
  if (t === 'sangreFria') favorMult *= 0.85;
  if (t === 'precavido') moveSpeed *= 0.95;
  if (t === 'metabolismoRapido') {
    energyRegen *= 1.4;
    hpRegen *= 1.4;
    hungerRate *= 1.25;
    thirstRate *= 1.25;
  }
  if (t === 'insomne') {
    maxEnergy *= 0.9;
    nightVisionMult *= 1.15;
  }
  if (t === 'paranoico') {
    detectionPower *= 1.15;
    socialAppeal -= 0.1;
  }
  if (t === 'oportunista') socialAppeal -= 0.1;

  // Defectos
  if (df === 'miope') visionRadius *= 0.8;
  if (df === 'asmatico') energyRegen *= 0.75;
  if (df === 'torpe') craftTimeMult *= 1.2;
  if (df === 'cojera') moveSpeed *= 0.92;
  if (df === 'fragil') maxHp *= 0.88;
  if (df === 'antipatico') {
    socialAppeal -= 0.25;
    favorMult *= 0.85;
  }
  if (df === 'ruidoso') noiseRadius *= 1.4;

  return {
    maxHp: Math.round(maxHp),
    maxEnergy: Math.round(maxEnergy),
    energyRegen: round(energyRegen, 2),
    hpRegen: round(hpRegen, 2),
    moveSpeed: round(moveSpeed, 3),
    carryCapacity: round(carryCapacity, 1),
    meleeMult: round(meleeMult, 3),
    rangedMult: round(rangedMult, 3),
    rangedAccuracy: round(clamp(rangedAccuracy, 0, 0.95), 3),
    critChance: round(critChance, 3),
    dodgeChance: round(dodgeChance, 3),
    initiative,
    visionRadius: round(visionRadius, 2),
    nightVisionMult: round(nightVisionMult, 3),
    detectionPower: round(detectionPower, 2),
    stealthPower,
    noiseRadius: round(noiseRadius, 2),
    ambushMult: round(ambushMult, 3),
    craftTimeMult: round(craftTimeMult, 3),
    craftQuality: round(craftQuality, 3),
    healEfficiency: round(healEfficiency, 3),
    trapPower: round(trapPower, 3),
    searchTimeMult: round(searchTimeMult, 3),
    searchYield: round(searchYield, 3),
    hungerRate: round(hungerRate, 3),
    thirstRate: round(thirstRate, 3),
    statusResist: round(statusResist, 3),
    favorMult: round(favorMult, 3),
    socialAppeal: round(socialAppeal, 3),
    intimidation,
  };
}

export type DerivedKey = keyof DerivedStats;

export interface DerivedDisplay {
  key: DerivedKey;
  label: string;
  group: 'Supervivencia' | 'Movimiento y percepción' | 'Combate' | 'Oficio' | 'Social';
  format: (v: number) => string;
  /** true si un valor más alto es mejor */
  higherIsBetter: boolean;
}

/** Decimales con coma y « %» separado, como se escribe en español. */
const dec = (v: number, digits: number) => v.toFixed(digits).replace('.', ',');
const pct = (v: number) => `${Math.round(v * 100)}\u00a0%`;
const mult = (v: number) => `×${dec(v, 2)}`;
const num = (digits = 0) => (v: number) => dec(v, digits);

export const DERIVED_DISPLAY: DerivedDisplay[] = [
  { key: 'maxHp', label: 'Salud máx.', group: 'Supervivencia', format: num(), higherIsBetter: true },
  { key: 'maxEnergy', label: 'Energía máx.', group: 'Supervivencia', format: num(), higherIsBetter: true },
  { key: 'energyRegen', label: 'Regeneración de energía', group: 'Supervivencia', format: (v) => `${dec(v, 1)}/s`, higherIsBetter: true },
  { key: 'hungerRate', label: 'Hambre', group: 'Supervivencia', format: mult, higherIsBetter: false },
  { key: 'thirstRate', label: 'Sed', group: 'Supervivencia', format: mult, higherIsBetter: false },
  { key: 'statusResist', label: 'Resistencia a estados', group: 'Supervivencia', format: pct, higherIsBetter: true },
  { key: 'moveSpeed', label: 'Velocidad', group: 'Movimiento y percepción', format: (v) => `${dec(v, 2)} c/s`, higherIsBetter: true },
  { key: 'carryCapacity', label: 'Carga máx.', group: 'Movimiento y percepción', format: (v) => `${dec(v, 1)} kg`, higherIsBetter: true },
  { key: 'visionRadius', label: 'Radio de visión', group: 'Movimiento y percepción', format: (v) => `${dec(v, 1)} c`, higherIsBetter: true },
  { key: 'detectionPower', label: 'Detección', group: 'Movimiento y percepción', format: num(), higherIsBetter: true },
  { key: 'stealthPower', label: 'Sigilo', group: 'Movimiento y percepción', format: num(), higherIsBetter: true },
  { key: 'noiseRadius', label: 'Ruido al moverte', group: 'Movimiento y percepción', format: (v) => `${dec(v, 1)} c`, higherIsBetter: false },
  { key: 'meleeMult', label: 'Daño cuerpo a cuerpo', group: 'Combate', format: mult, higherIsBetter: true },
  { key: 'rangedMult', label: 'Daño a distancia', group: 'Combate', format: mult, higherIsBetter: true },
  { key: 'rangedAccuracy', label: 'Precisión a distancia', group: 'Combate', format: pct, higherIsBetter: true },
  { key: 'critChance', label: 'Crítico', group: 'Combate', format: pct, higherIsBetter: true },
  { key: 'dodgeChance', label: 'Esquiva', group: 'Combate', format: pct, higherIsBetter: true },
  { key: 'ambushMult', label: 'Daño de emboscada', group: 'Combate', format: mult, higherIsBetter: true },
  { key: 'craftTimeMult', label: 'Tiempo de fabricación', group: 'Oficio', format: mult, higherIsBetter: false },
  { key: 'craftQuality', label: 'Calidad fabricada', group: 'Oficio', format: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}\u00a0%`, higherIsBetter: true },
  { key: 'trapPower', label: 'Potencia de trampas', group: 'Oficio', format: mult, higherIsBetter: true },
  { key: 'healEfficiency', label: 'Eficacia curando', group: 'Oficio', format: mult, higherIsBetter: true },
  { key: 'searchYield', label: 'Rendimiento al buscar', group: 'Oficio', format: mult, higherIsBetter: true },
  { key: 'favorMult', label: 'Favor del público', group: 'Social', format: mult, higherIsBetter: true },
  { key: 'socialAppeal', label: 'Atractivo social', group: 'Social', format: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}`, higherIsBetter: true },
  { key: 'intimidation', label: 'Intimidación', group: 'Social', format: num(1), higherIsBetter: true },
];
