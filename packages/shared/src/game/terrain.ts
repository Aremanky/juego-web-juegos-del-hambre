/**
 * Terrenos (GDD §7.2) y su efecto en las reglas. El índice de cada terreno coincide con su id en el
 * motor (`packages/engine/src/terrain.ts`), así el mapa codificado no necesita traducción.
 */
export const TERRAIN_KINDS = ['agua', 'pradera', 'bosque', 'denso', 'roca', 'montana', 'cumbre', 'plaza', 'orilla', 'camino', 'rio', 'pantano', 'ruinas', 'poblado'] as const;
export type TerrainKind = (typeof TERRAIN_KINDS)[number];

export interface TerrainRule {
  name: string;
  /** Multiplica el tiempo de cruzar una casilla. */
  cost: number;
  /** Multiplica el radio de visión de quien está en la casilla. */
  vision: number;
  /** Suma al sigilo de quien está en la casilla (GDD §5.1, detección de ocultos). */
  cover: number;
  /** Altura: +10% de daño contra quien está más abajo (GDD §9). */
  high: boolean;
  /** Suma a la probabilidad de huir (GDD §9.7). */
  flee: number;
}

export const TERRAIN_RULES: Record<TerrainKind, TerrainRule> = {
  agua: { name: 'Lago', cost: 3.0, vision: 1.0, cover: -8, high: false, flee: -0.1 },
  pradera: { name: 'Pradera', cost: 1.0, vision: 1.0, cover: -4, high: false, flee: -0.1 },
  bosque: { name: 'Bosque', cost: 1.4, vision: 0.85, cover: 6, high: false, flee: 0.1 },
  denso: { name: 'Bosque denso', cost: 1.8, vision: 0.7, cover: 10, high: false, flee: 0.15 },
  roca: { name: 'Zona rocosa', cost: 1.5, vision: 1.0, cover: 3, high: false, flee: 0 },
  montana: { name: 'Montaña', cost: 2.5, vision: 1.15, cover: 3, high: true, flee: 0 },
  cumbre: { name: 'Cumbre', cost: 3.0, vision: 1.3, cover: -4, high: true, flee: -0.05 },
  plaza: { name: 'Explanada del Obelisco', cost: 1.0, vision: 1.0, cover: -8, high: false, flee: -0.1 },
  orilla: { name: 'Orilla', cost: 1.1, vision: 1.0, cover: -4, high: false, flee: -0.1 },
  // Fase 7: caminos, ríos y puntos de interés del generador completo (GDD §7.1–7.2).
  camino: { name: 'Camino', cost: 0.8, vision: 1.0, cover: -8, high: false, flee: -0.1 },
  rio: { name: 'Río', cost: 2.0, vision: 1.0, cover: -4, high: false, flee: -0.1 },
  pantano: { name: 'Pantano', cost: 2.2, vision: 0.8, cover: 6, high: false, flee: 0.05 },
  ruinas: { name: 'Ruinas', cost: 1.3, vision: 0.9, cover: 5, high: false, flee: 0.05 },
  poblado: { name: 'Poblado', cost: 1.1, vision: 0.9, cover: 4, high: false, flee: 0 },
};

export function terrainKind(id: number): TerrainKind {
  return TERRAIN_KINDS[id] ?? 'pradera';
}
