import { ABILITIES } from './abilities.js';
import { computeDerived, type DerivedInput, type DerivedKey } from './derived.js';
import { districtById } from './districts.js';
import type { ModifierSource } from './situational.js';
import { DEFECTS, TRAITS } from './traits.js';

/** Fórmula de cada estadística a partir de los atributos (GDD §5.1), para explicarla en el editor. */
export const DERIVED_FORMULAS: Record<DerivedKey, string> = {
  maxHp: '70 + 6·Aguante + 2·Potencia',
  maxEnergy: '60 + 5·Aguante + 1,5·Reflejos',
  energyRegen: '1 + 0,1·Aguante por segundo, descansando',
  hpRegen: '0,25 + 0,03·Aguante por segundo, descansando',
  moveSpeed: '0,90 + 0,07·Reflejos casillas por segundo',
  carryCapacity: '8 + 1,5·Potencia kg',
  meleeMult: '1 + 0,07·(Potencia − 5)',
  rangedMult: '1 + 0,05·(Instinto − 5)',
  rangedAccuracy: '55 % + 4 %·Instinto, como mucho 95 %',
  critChance: '4 % + 1,2 %·Instinto',
  dodgeChance: '4 % + 2,2 %·Reflejos; ×2,5 al esquivar',
  initiative: 'Reflejos, más la velocidad del arma',
  visionRadius: '6 + 0,6·Instinto casillas, según el terreno',
  nightVisionMult: '×0,6 de noche',
  detectionPower: '10 + 3·Instinto',
  stealthPower: '10 + 3·Sigilo, más la cobertura del terreno',
  noiseRadius: '5 − 0,3·Sigilo casillas, como poco 1,5',
  ambushMult: '1,5 + 0,1·Sigilo',
  craftTimeMult: '1,3 − 0,05·Ingenio',
  craftQuality: '6 %·(Ingenio − 5)',
  healEfficiency: '1 + 0,06·(Ingenio − 5)',
  trapPower: '1 + 0,08·(Ingenio − 5)',
  searchTimeMult: '1,2 − 0,04·Instinto',
  searchYield: '1 + 0,06·(Instinto − 5)',
  hungerRate: '(1 + 0,04·(Potencia − 5)) × (1 − 0,035·(Aguante − 5))',
  thirstRate: '1 − 0,035·(Aguante − 5)',
  statusResist: '5 %·Aguante, como mucho 50 %',
  favorMult: '1 + 0,08·(Carisma − 5)',
  socialAppeal: '0,07·(Carisma − 5)',
  intimidation: '(Carisma + Potencia) / 2',
};

/** Estadísticas en las que un efecto se lee mejor como suma que como multiplicador. */
const ADDITIVE: ReadonlySet<DerivedKey> = new Set(['rangedAccuracy', 'critChance', 'dodgeChance', 'statusResist', 'craftQuality', 'socialAppeal']);

export function sourceLabel(s: ModifierSource): string {
  switch (s.kind) {
    case 'district': {
      const d = districtById(s.id);
      return d ? `Distrito ${d.roman} · ${d.name}` : `Distrito ${s.id}`;
    }
    case 'ability':
      return ABILITIES[s.key].name;
    case 'trait':
      return TRAITS[s.key].name;
    case 'defect':
      return DEFECTS[s.key].name;
    case 'rule':
      return { terreno: 'Terreno', noche: 'Noche', saludBaja: 'Salud baja' }[s.key];
  }
}

export interface BreakdownLine {
  label: string;
  /** Multiplicador (×1,10) o suma (+0,15), según la estadística. */
  op: 'mult' | 'add';
  value: number;
}

export interface Breakdown {
  formula: string;
  /** Valor solo con los atributos. */
  base: number;
  lines: BreakdownLine[];
  total: number;
}

/**
 * De dónde sale una estadística: el valor de los atributos y lo que cambia cada elección (distrito,
 * habilidades, rasgo y defecto), aplicadas en ese orden sobre la misma función que usa el motor.
 */
export function explainDerived(input: DerivedInput, key: DerivedKey): Breakdown {
  const steps: { label: string; input: DerivedInput }[] = [];
  let acc: DerivedInput = { attributes: input.attributes, district: null, trait: null, defect: null, abilities: [] };
  const base = computeDerived(acc)[key];
  if (input.district != null) {
    acc = { ...acc, district: input.district };
    steps.push({ label: sourceLabel({ kind: 'district', id: input.district }), input: acc });
  }
  for (const k of input.abilities ?? []) {
    acc = { ...acc, abilities: [...(acc.abilities ?? []), k] };
    steps.push({ label: ABILITIES[k].name, input: acc });
  }
  if (input.trait) {
    acc = { ...acc, trait: input.trait };
    steps.push({ label: TRAITS[input.trait].name, input: acc });
  }
  if (input.defect) {
    acc = { ...acc, defect: input.defect };
    steps.push({ label: DEFECTS[input.defect].name, input: acc });
  }
  const lines: BreakdownLine[] = [];
  let prev = base;
  for (const s of steps) {
    const v = computeDerived(s.input)[key];
    if (Math.abs(v - prev) > 1e-9) {
      const asAdd = ADDITIVE.has(key) || prev === 0;
      lines.push({ label: s.label, op: asAdd ? 'add' : 'mult', value: asAdd ? v - prev : v / prev });
    }
    prev = v;
  }
  return { formula: DERIVED_FORMULAS[key], base, lines, total: prev };
}
