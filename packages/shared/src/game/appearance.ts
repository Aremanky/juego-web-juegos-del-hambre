/**
 * Apariencia del personaje animado del mapa (GDD §5.9). En el mapa nunca va la foto: va una figura con
 * piel, pelo, ropa y complementos. Lo que el jugador no elige en el editor de apariencia se deriva de
 * forma determinista de su retrato: el peinado coincide con el de su camafeo, la ropa lleva su color de
 * jugador y el ribete el de su distrito.
 */
import { Rng } from '../util/rng.js';
import { CAMEO_HAIR_STYLES, type HairStyle } from './avatar.js';
import { districtById, type Gender } from './districts.js';
import type { Look, Portrait } from '../schemas/character.js';

export const OUTFIT_STYLES = ['tunica', 'chaqueta', 'capa', 'peto', 'vestido', 'mono'] as const;
export type OutfitStyle = (typeof OUTFIT_STYLES)[number];
export const ACCESSORIES = ['ninguno', 'bufanda', 'mochila', 'carcaj', 'cinta'] as const;
export type Accessory = (typeof ACCESSORIES)[number];
export const BUILDS = ['delgada', 'media', 'robusta'] as const;
export type Build = (typeof BUILDS)[number];

export const OUTFIT_LABEL: Record<OutfitStyle, string> = { tunica: 'Túnica', chaqueta: 'Chaqueta', capa: 'Capa', peto: 'Peto de cuero', vestido: 'Vestido', mono: 'Mono de faena' };
export const ACCESSORY_LABEL: Record<Accessory, string> = { ninguno: 'Ninguno', bufanda: 'Bufanda', mochila: 'Mochila', carcaj: 'Carcaj', cinta: 'Cinta' };
export const BUILD_LABEL: Record<Build, string> = { delgada: 'Delgada', media: 'Media', robusta: 'Robusta' };
export const HAIR_LABEL: Record<HairStyle, string> = { corto: 'Corto', melena: 'Melena', mono: 'Moño', trenza: 'Trenza', rizos: 'Rizos', cresta: 'Cresta', rapado: 'Rapado', capucha: 'Capucha', coleta: 'Coleta' };

/** Tonos de piel: [base, sombra]. */
export const SKIN_TONES = [
  ['#f4dcc4', '#d9b99d'],
  ['#f1d3b8', '#d6b296'],
  ['#e3b48e', '#c49470'],
  ['#d5a077', '#b5805a'],
  ['#c98f63', '#a8734b'],
  ['#a86e47', '#8a5635'],
  ['#7d4f33', '#623b25'],
  ['#5a3824', '#45291a'],
] as const;

export const HAIR_COLORS = [
  ['#1f1a17', '#110e0c'],
  ['#3b2a1e', '#271b12'],
  ['#5e3f26', '#432c19'],
  ['#8a5a32', '#6a4325'],
  ['#b88a4e', '#946c39'],
  ['#d8c49a', '#b8a276'],
  ['#e8e2d4', '#c4bcab'],
  ['#8c8c88', '#6d6d69'],
  ['#7a2e1f', '#5a2116'],
  ['#3e5a6e', '#2b4050'],
] as const;

export const OUTFIT_COLORS = ['#8c3b2e', '#b5652e', '#c49a3a', '#6b7a3a', '#3f6b4f', '#2f5d6b', '#3b4f7a', '#5a3f6b', '#7a3a55', '#5e574c', '#3a3633', '#c8bfae'] as const;
export const PANTS_COLORS = ['#3b342c', '#2e3238', '#4a3b2a', '#55503f', '#2b2b2b', '#5a4a3a'] as const;
const BOOTS = ['#2a1f17', '#3b2a1e', '#1c1a18'] as const;

export interface Appearance {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  hairStyle: HairStyle;
  /** Color principal de la ropa (por defecto, el del jugador). */
  outfit: string;
  /** Ribete, cinturón y detalles (por defecto, el color del distrito). */
  trim: string;
  outfitStyle: OutfitStyle;
  accessory: Accessory;
  pants: string;
  boots: string;
  /** Anchura del cuerpo: ~0,9 delgada, 1 media, ~1,1 robusta. */
  build: number;
  /** Estatura relativa: 0,94–1,06. */
  height: number;
}

export interface AppearanceInput {
  portrait: Portrait;
  color: string;
  district: number;
  gender: Gender;
  name: string;
  look?: Look | null;
}

export function appearanceOf(a: AppearanceInput): Appearance {
  const seed = a.portrait.kind === 'generated' ? a.portrait.seed : `${a.name}:${a.portrait.photoId}`;
  // Mismo primer sorteo que el camafeo: el peinado del mapa es el de su retrato.
  const style = new Rng('camafeo:' + seed).pick(CAMEO_HAIR_STYLES);
  const r = new Rng('figura:' + seed);
  const skinIdx = r.int(1, SKIN_TONES.length - 1);
  const hairIdx = r.int(0, 8);
  const outfitStyle = r.pick(a.gender === 'F' ? (['tunica', 'vestido', 'capa', 'chaqueta', 'peto'] as const) : (['tunica', 'chaqueta', 'capa', 'peto', 'mono'] as const));
  const accessory = r.chance(0.55) ? 'ninguno' : r.pick(['bufanda', 'mochila', 'carcaj', 'cinta'] as const);
  const pants = r.pick(PANTS_COLORS);
  const boots = r.pick(BOOTS);
  const buildBase = (a.gender === 'F' ? 0.93 : 1.04) + r.int(-4, 4) / 100;
  const L = a.look ?? {};
  const [skin, skinShade] = SKIN_TONES[L.skin ?? skinIdx] ?? SKIN_TONES[skinIdx];
  const [hair, hairShade] = HAIR_COLORS[L.hairColor ?? hairIdx] ?? HAIR_COLORS[hairIdx];
  const build = L.build === 'delgada' ? buildBase - 0.08 : L.build === 'robusta' ? buildBase + 0.1 : buildBase;
  return {
    skin,
    skinShade,
    hair,
    hairShade,
    hairStyle: L.hairStyle ?? style,
    outfit: L.outfit ?? a.color,
    trim: L.trim ?? districtById(a.district)?.color ?? '#8f877b',
    outfitStyle: L.outfitStyle ?? outfitStyle,
    accessory: L.accessory ?? accessory,
    pants: PANTS_COLORS[L.pants ?? -1] ?? pants,
    boots,
    build,
    height: 1 + (L.height ?? 0) * 0.03,
  };
}
