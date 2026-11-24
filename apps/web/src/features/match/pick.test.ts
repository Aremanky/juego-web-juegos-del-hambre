import { describe, expect, it } from 'vitest';
import { pickActor, type HitBox } from './pick';

/** Un personaje de 60 px de alto y 28 de ancho con los pies en (x, bottom). */
const box = (id: string, x: number, bottom: number): HitBox => ({ id, x, top: bottom - 60, bottom, half: 14 });

describe('qué personaje se toca', () => {
  it('un punto dentro de una caja da su id', () => {
    expect(pickActor([box('a', 100, 200)], 105, 170, 0)).toBe('a');
  });

  it('si dos se solapan, el que va delante (el último dibujado)', () => {
    expect(pickActor([box('a', 100, 200), box('b', 110, 210)], 106, 180, 0)).toBe('b');
  });

  it('con margen para el dedo, y nada fuera de él', () => {
    // El borde derecho está en 114: el punto queda 10 px fuera.
    expect(pickActor([box('a', 100, 200)], 124, 170, 12)).toBe('a');
    expect(pickActor([box('a', 100, 200)], 124, 170, 4)).toBeNull();
  });
});
