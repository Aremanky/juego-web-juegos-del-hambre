import type { Gender } from './districts.js';

/** Nombres y epítetos originales para bots. */
export const BOT_NAMES: Record<Gender, string[]> = {
  M: [
    'Kael', 'Torvo', 'Silas', 'Dorian', 'Bram', 'Elio', 'Garrick', 'Iker', 'Joren', 'Lazlo', 'Marek', 'Nilo',
    'Orión', 'Pável', 'Quillan', 'Ronan', 'Sven', 'Teo', 'Ulric', 'Varo', 'Yago', 'Zane', 'Darío', 'Leandro',
    'Bastian', 'Cyrus', 'Ivo', 'Matías', 'Anselm', 'Brennan', 'Caspian', 'Dax', 'Ezra', 'Gael', 'Hollis', 'Kiran',
  ],
  F: [
    'Nara', 'Vera', 'Brisa', 'Selene', 'Ilsa', 'Kira', 'Lyra', 'Mara', 'Nadia', 'Oriana', 'Petra', 'Rhea',
    'Sabela', 'Talia', 'Uma', 'Vesna', 'Wren', 'Yara', 'Zoe', 'Alba', 'Dalia', 'Greta', 'Iria', 'Juno',
    'Lía', 'Mina', 'Noa', 'Astrid', 'Cora', 'Dana', 'Freya', 'Hela', 'Inés', 'Liora', 'Maren', 'Siena',
  ],
};

/** Epítetos con forma masculina y femenina. */
export const EPITHETS: { M: string; F: string }[] = [
  { M: 'el Silencioso', F: 'la Silenciosa' },
  { M: 'Mano de Hierro', F: 'Mano de Hierro' },
  { M: 'el Astuto', F: 'la Astuta' },
  { M: 'Ojo de Lince', F: 'Ojo de Lince' },
  { M: 'Sin Miedo', F: 'Sin Miedo' },
  { M: 'la Sombra', F: 'la Sombra' },
  { M: 'el Errante', F: 'la Errante' },
  { M: 'Rompehuesos', F: 'Rompehuesos' },
  { M: 'el Paciente', F: 'la Paciente' },
  { M: 'Lengua de Plata', F: 'Lengua de Plata' },
  { M: 'el Implacable', F: 'la Implacable' },
  { M: 'del Pantano', F: 'del Pantano' },
  { M: 'Hijo de la Ceniza', F: 'Hija de la Ceniza' },
  { M: 'el Lobo', F: 'la Loba' },
  { M: 'el Centinela', F: 'la Centinela' },
  { M: 'Corazón de Brasa', F: 'Corazón de Brasa' },
];
