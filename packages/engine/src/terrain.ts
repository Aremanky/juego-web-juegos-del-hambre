/**
 * Terrenos de la arena (GDD §7.2). El coste multiplica el tiempo de cruzar una casilla.
 * Los ids 0–8 son los de la 0.4 (partidas guardadas); caminos, ríos, pantanos, ruinas y poblados llegan con el
 * generador completo de la fase 7.
 */
export const T = {
  AGUA: 0,
  PRADERA: 1,
  BOSQUE: 2,
  DENSO: 3,
  ROCA: 4,
  MONTANA: 5,
  CUMBRE: 6,
  PLAZA: 7,
  ORILLA: 8,
  CAMINO: 9,
  RIO: 10,
  PANTANO: 11,
  RUINAS: 12,
  POBLADO: 13,
} as const;
export type TerrainId = (typeof T)[keyof typeof T];

export interface TerrainDef {
  id: TerrainId;
  key: string;
  name: string;
  /** Multiplicador del tiempo de paso (pradera = 1). */
  cost: number;
  /** Color base para dibujar el mapa en el modo cartográfico. */
  color: string;
}

export const TERRAIN: readonly TerrainDef[] = [
  { id: T.AGUA, key: 'agua', name: 'Lago', cost: 3.0, color: '#24434c' },
  { id: T.PRADERA, key: 'pradera', name: 'Pradera', cost: 1.0, color: '#5b6338' },
  { id: T.BOSQUE, key: 'bosque', name: 'Bosque', cost: 1.4, color: '#36502f' },
  { id: T.DENSO, key: 'denso', name: 'Bosque denso', cost: 1.8, color: '#263d24' },
  { id: T.ROCA, key: 'roca', name: 'Zona rocosa', cost: 1.5, color: '#6a6255' },
  { id: T.MONTANA, key: 'montana', name: 'Montaña', cost: 2.5, color: '#857c6c' },
  { id: T.CUMBRE, key: 'cumbre', name: 'Cumbre', cost: 3.0, color: '#c8c1b2' },
  { id: T.PLAZA, key: 'plaza', name: 'Explanada del Obelisco', cost: 1.0, color: '#7b6a47' },
  { id: T.ORILLA, key: 'orilla', name: 'Orilla', cost: 1.1, color: '#8a7c58' },
  { id: T.CAMINO, key: 'camino', name: 'Camino', cost: 0.8, color: '#9b8a63' },
  { id: T.RIO, key: 'rio', name: 'Río', cost: 2.0, color: '#2f5560' },
  { id: T.PANTANO, key: 'pantano', name: 'Pantano', cost: 2.2, color: '#3d4a33' },
  { id: T.RUINAS, key: 'ruinas', name: 'Ruinas', cost: 1.3, color: '#77705f' },
  { id: T.POBLADO, key: 'poblado', name: 'Poblado', cost: 1.1, color: '#8c7650' },
];

export function terrainCost(id: number): number {
  return TERRAIN[id]?.cost ?? 1;
}

// ---------- base64 sin depender de Buffer (vale en el navegador y en Node) ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeTiles(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

export function decodeTiles(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
