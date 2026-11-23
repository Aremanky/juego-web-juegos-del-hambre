/**
 * Apariencia del personaje animado del mapa (GDD §5.9). En el mapa nunca va la foto: va una figura con
 * piel, pelo y ropa. Hasta el editor de apariencia de la fase 10 se deriva de forma determinista de lo
 * que ya tiene cada personaje: el peinado coincide con el de su camafeo, la ropa lleva su color de
 * jugador y el ribete el color de su distrito.
 */
import { Rng } from '../util/rng.js';
import { CAMEO_HAIR_STYLES, type HairStyle } from './avatar.js';
import { districtById, type Gender } from './districts.js';
import type { Portrait } from '../schemas/character.js';

export interface Appearance {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  hairStyle: HairStyle;
  /** Color de la ropa: el del jugador. */
  outfit: string;
  /** Ribete y cinturón: el color del distrito. */
  trim: string;
  /** Proporciones: 1 normal; algo más ancho o estrecho según el género y la semilla. */
  build: number;
}

const SKINS = [
  ['#f1d3b8', '#d6b296'],
  ['#e3b48e', '#c49470'],
  ['#c98f63', '#a8734b'],
  ['#a86e47', '#8a5635'],
  ['#7d4f33', '#623b25'],
  ['#5a3824', '#45291a'],
] as const;

const HAIRS = [
  ['#1f1a17', '#110e0c'],
  ['#3b2a1e', '#271b12'],
  ['#5e3f26', '#432c19'],
  ['#8a5a32', '#6a4325'],
  ['#b88a4e', '#946c39'],
  ['#d8c49a', '#b8a276'],
  ['#8c8c88', '#6d6d69'],
  ['#7a2e1f', '#5a2116'],
] as const;

export function appearanceOf(a: { portrait: Portrait; color: string; district: number; gender: Gender; name: string }): Appearance {
  const seed = a.portrait.kind === 'generated' ? a.portrait.seed : `${a.name}:${a.portrait.photoId}`;
  // Mismo primer sorteo que el camafeo: el peinado del mapa es el de su retrato.
  const style = new Rng('camafeo:' + seed).pick(CAMEO_HAIR_STYLES);
  const r = new Rng('figura:' + seed);
  const [skin, skinShade] = r.pick(SKINS);
  const [hair, hairShade] = r.pick(HAIRS);
  return {
    skin,
    skinShade,
    hair,
    hairShade,
    hairStyle: style,
    outfit: a.color,
    trim: districtById(a.district)?.color ?? '#8f877b',
    build: (a.gender === 'F' ? 0.92 : 1.04) + r.int(-4, 4) / 100,
  };
}
