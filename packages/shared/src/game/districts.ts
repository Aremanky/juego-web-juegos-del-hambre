/** Distritos (GDD §5.6). 12 distritos × 2 plazas (masculina y femenina). */
export const DISTRICT_COUNT = 12;
export const GENDERS = ['M', 'F'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABEL: Record<Gender, string> = { M: 'Masculino', F: 'Femenino' };

export interface DistrictDef {
  id: number;
  roman: string;
  name: string;
  industry: string;
  perk: string;
  color: string;
}

/** Cada color es el material de su industria: óxido, verdín, latón, mar, sodio, raíl, pino, rubia, trigo, glaciar, tinta y carbón. */
export const DISTRICTS: DistrictDef[] = [
  { id: 1, roman: 'I', name: 'Forjas', industry: 'Metalurgia', perk: 'Armas metálicas +10% de daño; puede reparar armas.', color: '#c96546' },
  { id: 2, roman: 'II', name: 'Laboratorios', industry: 'Química y medicina', perk: 'Curaciones +25%; identifica venenos y comida peligrosa.', color: '#5aa898' },
  { id: 3, roman: 'III', name: 'Talleres', industry: 'Ingeniería', perk: 'Trampas +25% de daño; herramientas −20% de tiempo de fabricación.', color: '#c9a04e' },
  { id: 4, roman: 'IV', name: 'Puertos', industry: 'Pesca y navegación', perk: 'Nada sin penalización; +50% de comida al pescar.', color: '#5b8cb3' },
  { id: 5, roman: 'V', name: 'Centrales', industry: 'Energía', perk: 'Inmune a descargas eléctricas; +10% de energía máxima.', color: '#cfba5a' },
  { id: 6, roman: 'VI', name: 'Raíles', industry: 'Transporte', perk: '+8% de velocidad en caminos y praderas; viajar gasta −15% de energía.', color: '#a88474' },
  { id: 7, roman: 'VII', name: 'Aserraderos', industry: 'Madera', perk: '+12% de velocidad en el bosque; hachas +15% de daño; más madera.', color: '#6c9b58' },
  { id: 8, roman: 'VIII', name: 'Telares', industry: 'Textil', perk: '+15% de sigilo al esconderse; resiste el frío.', color: '#b57499' },
  { id: 9, roman: 'IX', name: 'Graneros', industry: 'Cereal', perk: '−15% de hambre; detecta comida venenosa.', color: '#d8b56e' },
  { id: 10, roman: 'X', name: 'Cumbres', industry: 'Pastoreo de montaña', perk: 'Sin penalización en montaña y roca; +10% de visión en altura.', color: '#9fb7c9' },
  { id: 11, roman: 'XI', name: 'Archivos', industry: 'Comunicación', perk: '+15% de favor; ve la composición de las alianzas ajenas.', color: '#8583c2' },
  { id: 12, roman: 'XII', name: 'Minas', industry: 'Carbón', perk: '+30% de visión nocturna; +8% de salud máxima.', color: '#9399a3' },
];

export function districtById(id: number | null | undefined): DistrictDef | undefined {
  if (id == null) return undefined;
  return DISTRICTS[id - 1];
}

export const MAX_PER_GENDER = DISTRICT_COUNT;
