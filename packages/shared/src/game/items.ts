/**
 * Armas y protecciones (GDD §8). Daño base del catálogo; el combate (`packages/engine/src/combat.ts`)
 * lo multiplica por Potencia (cuerpo a cuerpo) o Instinto (distancia).
 */
export type WeaponTag = 'filo' | 'contundente' | 'perforante' | 'metal' | 'hacha' | 'pesada' | 'alcance';

export interface WeaponDef {
  key: string;
  name: string;
  base: number;
  range: 'cerca' | 'lejos';
  /** Se suma a la iniciativa: rápida +2, lenta −2. */
  speed: number;
  tags: readonly WeaponTag[];
  /** Probabilidad de aturdir al acertar (armas contundentes). */
  stun?: number;
  /** Potencia mínima para usarla sin penalización. */
  minPotencia?: number;
}

export const WEAPONS = {
  punos: { key: 'punos', name: 'Puños', base: 7, range: 'cerca', speed: 1, tags: ['contundente'], stun: 0.05 },
  cuchillo: { key: 'cuchillo', name: 'Cuchillo', base: 16, range: 'cerca', speed: 2, tags: ['filo', 'metal'] },
  honda: { key: 'honda', name: 'Honda', base: 14, range: 'lejos', speed: 0, tags: ['contundente'], stun: 0.1 },
  arrojadizos: { key: 'arrojadizos', name: 'Cuchillos arrojadizos', base: 15, range: 'lejos', speed: 1, tags: ['filo', 'metal'] },
  lanza: { key: 'lanza', name: 'Lanza', base: 22, range: 'cerca', speed: 0, tags: ['perforante', 'alcance'] },
  machete: { key: 'machete', name: 'Machete', base: 23, range: 'cerca', speed: 0, tags: ['filo', 'metal'] },
  maza: { key: 'maza', name: 'Maza', base: 24, range: 'cerca', speed: -1, tags: ['contundente', 'pesada'], stun: 0.3 },
  arco: { key: 'arco', name: 'Arco', base: 24, range: 'lejos', speed: -1, tags: ['perforante'] },
  arpon: { key: 'arpon', name: 'Arpón', base: 25, range: 'cerca', speed: -1, tags: ['perforante', 'metal', 'alcance'] },
  espadaCorta: { key: 'espadaCorta', name: 'Espada corta', base: 26, range: 'cerca', speed: 1, tags: ['filo', 'metal'] },
  hacha: { key: 'hacha', name: 'Hacha', base: 28, range: 'cerca', speed: -2, tags: ['filo', 'hacha', 'pesada'], minPotencia: 5 },
} as const satisfies Record<string, WeaponDef>;
export type WeaponKey = keyof typeof WEAPONS;

export interface ArmorDef {
  key: string;
  name: string;
  /** Fracción de daño que absorbe. */
  protection: number;
  /** Defender con escudo reduce el daño un 70% en lugar del 50%. */
  block?: boolean;
  speedMult?: number;
}

export const ARMORS = {
  chaqueta: { key: 'chaqueta', name: 'Chaqueta acolchada', protection: 0.1 },
  chaleco: { key: 'chaleco', name: 'Chaleco de cuero', protection: 0.18 },
  escudo: { key: 'escudo', name: 'Escudo improvisado', protection: 0.05, block: true },
  armadura: { key: 'armadura', name: 'Armadura ligera', protection: 0.25, speedMult: 0.95 },
} as const satisfies Record<string, ArmorDef>;
export type ArmorKey = keyof typeof ARMORS;

/** Energía por acción de combate (GDD §9.8). */
export const COMBAT_ENERGY = { atacar: 8, atacarPesada: 12, defender: 4, esquivar: 12, huir: 15 } as const;
