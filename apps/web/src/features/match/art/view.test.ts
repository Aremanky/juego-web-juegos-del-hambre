import { describe, expect, it } from 'vitest';
import { chunkLevel } from './view';

describe('nivel de los bloques del terreno', () => {
  it('con el zoom en un entero de píxeles por casilla, los bloques se hacen a ese tamaño (se copian sin escalar)', () => {
    expect(chunkLevel(24)).toBe(24);
    expect(chunkLevel(26)).toBe(26);
    expect(chunkLevel(40)).toBe(40);
  });

  it('con un zoom intermedio (mientras se pellizca o se gira la rueda), los niveles fijos de siempre', () => {
    expect(chunkLevel(25.6)).toBe(32);
    expect(chunkLevel(20.5)).toBe(16);
    expect(chunkLevel(44.2)).toBe(48);
  });

  it('muy lejos, la vista general; muy cerca, el nivel más fino', () => {
    expect(chunkLevel(10)).toBe(8);
    expect(chunkLevel(12)).toBe(8);
    expect(chunkLevel(60)).toBe(48);
  });
});
