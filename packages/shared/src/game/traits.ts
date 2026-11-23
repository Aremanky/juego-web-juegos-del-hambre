/** Rasgos de personalidad (GDD §5.4) y defectos (§5.5). */
export const TRAIT_KEYS = [
  'leal',
  'oportunista',
  'sangreFria',
  'temerario',
  'precavido',
  'solitario',
  'metabolismoRapido',
  'insomne',
  'paranoico',
  'dramatico',
] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

export interface TraitDef {
  key: TraitKey;
  name: string;
  icon: string;
  pro: string;
  con: string;
}

export const TRAITS: Record<TraitKey, TraitDef> = {
  leal: { key: 'leal', name: 'Leal', icon: 'Handshake', pro: 'Bonos de alianza +50% y reputación inicial 60.', con: 'Traicionar te provoca Remordimiento (−15% a todo 3 min) y −45 de reputación.' },
  oportunista: { key: 'oportunista', name: 'Oportunista', icon: 'Coins', pro: 'Las traiciones dan +50% de favor y +25% de daño en el golpe de traición.', con: 'Reputación inicial 35; los bots desconfían de ti.' },
  sangreFria: { key: 'sangreFria', name: 'Sangre fría', icon: 'Snowflake', pro: 'Inmune a Pánico e Intimidar; +10% de precisión con menos del 50% de salud.', con: '−15% de favor: aburres al público.' },
  temerario: { key: 'temerario', name: 'Temerario', icon: 'Flame', pro: '+15% de daño en tu primer ataque de cada combate y +5% de velocidad persiguiendo.', con: 'Recibes +15% de daño.' },
  precavido: { key: 'precavido', name: 'Precavido', icon: 'ScanEye', pro: '+20% de detección de trampas y emboscadas.', con: '−5% de velocidad: te paras a mirar.' },
  solitario: { key: 'solitario', name: 'Solitario', icon: 'UserRound', pro: '+10% de búsqueda, sigilo y daño mientras no tengas aliados.', con: 'Alianzas de 2 como máximo; pierdes el bono si tienes aliado.' },
  metabolismoRapido: { key: 'metabolismoRapido', name: 'Metabolismo rápido', icon: 'Activity', pro: '+40% de regeneración de salud y energía.', con: '+25% de hambre y sed.' },
  insomne: { key: 'insomne', name: 'Insomne', icon: 'Moon', pro: 'Descansar de noche no reduce tu percepción; +15% de visión nocturna.', con: '−10% de energía máxima.' },
  paranoico: { key: 'paranoico', name: 'Paranoico', icon: 'Siren', pro: '+15% de detección de ocultos y alerta si alguien te apunta.', con: 'Descansar recupera −25% y −10% de aceptación de alianzas.' },
  dramatico: { key: 'dramatico', name: 'Dramático', icon: 'Drama', pro: '+30% de favor en combates y eventos.', con: 'Tus combates se anuncian a toda la arena con tu ubicación.' },
};

export const DEFECT_KEYS = ['miope', 'asmatico', 'torpe', 'cojera', 'fragil', 'antipatico', 'ruidoso'] as const;
export type DefectKey = (typeof DEFECT_KEYS)[number];

export interface DefectDef {
  key: DefectKey;
  name: string;
  description: string;
}

export const DEFECTS: Record<DefectKey, DefectDef> = {
  miope: { key: 'miope', name: 'Miope', description: '−20% de radio de visión.' },
  asmatico: { key: 'asmatico', name: 'Asmático', description: '−25% de regeneración de energía.' },
  torpe: { key: 'torpe', name: 'Torpe', description: '+20% de tiempo al fabricar y colocar trampas.' },
  cojera: { key: 'cojera', name: 'Cojera', description: '−8% de velocidad.' },
  fragil: { key: 'fragil', name: 'Frágil', description: '−12% de salud máxima.' },
  antipatico: { key: 'antipatico', name: 'Antipático', description: '−25% de aceptación de alianzas y −15% de favor.' },
  ruidoso: { key: 'ruidoso', name: 'Ruidoso', description: '+40% de radio de ruido al moverte.' },
};
