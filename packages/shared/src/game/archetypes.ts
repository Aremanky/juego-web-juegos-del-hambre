import type { Attributes } from './attributes.js';
import type { AbilityKey } from './abilities.js';
import type { TraitKey } from './traits.js';

/** Arquetipos rápidos (GDD §5.2). Todos cuestan exactamente 28 puntos. */
export interface ArchetypeDef {
  key: string;
  name: string;
  description: string;
  attributes: Attributes;
  abilities: [AbilityKey, AbilityKey];
  trait: TraitKey | null;
}

const A = (potencia: number, reflejos: number, aguante: number, instinto: number, sigilo: number, ingenio: number, carisma: number): Attributes => ({
  potencia, reflejos, aguante, instinto, sigilo, ingenio, carisma,
});

export const ARCHETYPES: ArchetypeDef[] = [
  { key: 'equilibrado', name: 'Equilibrado', description: 'Sin puntos débiles ni fuertes. Se adapta a todo.', attributes: A(5, 5, 5, 5, 5, 5, 5), abilities: ['primerosAuxilios', 'forrajeo'], trait: null },
  { key: 'cazador', name: 'Cazador', description: 'Persigue, golpea y remata. Gana el cuerpo a cuerpo medio.', attributes: A(7, 6, 5, 6, 4, 3, 3), abilities: ['golpeBrutal', 'rastrear'], trait: 'temerario' },
  { key: 'sombra', name: 'Sombra', description: 'Nadie la ve llegar. Si la pillan, cae rápido.', attributes: A(3, 7, 4, 5, 8, 3, 2), abilities: ['camuflaje', 'carrera'], trait: 'solitario' },
  { key: 'superviviente', name: 'Superviviente', description: 'Aguanta más que nadie y siempre encuentra comida.', attributes: A(4, 5, 8, 6, 3, 5, 2), abilities: ['ultimoAliento', 'forrajeo'], trait: 'precavido' },
  { key: 'ingeniero', name: 'Ingeniero', description: 'Empieza débil; termina con arco, trampas y botiquín.', attributes: A(3, 4, 5, 6, 4, 8, 3), abilities: ['trampero', 'primerosAuxilios'], trait: null },
  { key: 'diplomatico', name: 'Diplomático', description: 'Vive de alianzas, pactos y mecenas.', attributes: A(3, 5, 5, 5, 3, 4, 8), abilities: ['labia', 'showman'], trait: 'leal' },
  { key: 'explorador', name: 'Explorador', description: 'Rápido y atento: llega primero a todo.', attributes: A(3, 7, 6, 7, 4, 3, 3), abilities: ['carrera', 'ojoCertero'], trait: 'insomne' },
  { key: 'titan', name: 'Titán', description: 'Golpea como un mazo. Lento, hambriento y visible.', attributes: A(9, 4, 7, 3, 2, 2, 3), abilities: ['golpeBrutal', 'intimidar'], trait: 'sangreFria' },
];
