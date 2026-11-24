import { describe, expect, it } from 'vitest';
import { facingOf, type Facing } from './facing';

describe('rumbo en ocho direcciones', () => {
  it('cada sector de 45° tiene su rumbo (y crece hacia el sur)', () => {
    const cases: [number, number, Facing][] = [
      [1, 0, 'E'],
      [1, 1, 'SE'],
      [0, 1, 'S'],
      [-1, 1, 'SW'],
      [-1, 0, 'W'],
      [-1, -1, 'NW'],
      [0, -1, 'N'],
      [1, -1, 'NE'],
      [1, 0.3, 'E'],
      [1, 0.5, 'SE'],
    ];
    for (const [dx, dy, f] of cases) expect(facingOf(dx, dy, 'S'), `${dx},${dy}`).toBe(f);
  });

  it('quieto, conserva el último', () => {
    expect(facingOf(0, 0, 'NE')).toBe('NE');
    expect(facingOf(0.001, 0, 'NW')).toBe('NW');
  });
});
