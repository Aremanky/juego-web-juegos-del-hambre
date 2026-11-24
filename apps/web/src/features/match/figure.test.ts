import { describe, expect, it } from 'vitest';
import { appearanceOf } from '@ceniza/shared';
import type { Facing } from './facing';
import { drawFigure, type Pose } from './figure';

const LOOK = appearanceOf({ name: 'Ana', portrait: { kind: 'generated', seed: 'Ana' }, color: '#9a5b3c', frame: 'sencillo', look: null, district: 3, gender: 'F' } as never);
const MIRROR = 'scale(-1.00,1.00)';

/** Lo que dibuja la figura, llamada a llamada, con un contexto de lienzo que solo apunta. */
export function record(over: Partial<Pose> = {}): string[] {
  const calls: string[] = [];
  const fmt = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : typeof v === 'function' ? 'fn' : String(v));
  const g = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (...args: unknown[]) => {
      calls.push(`${String(k)}(${args.map(fmt).join(',')})`);
    },
    set: (_t, k, v) => {
      calls.push(`${String(k)}=${fmt(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  drawFigure(g, LOOK, 0, 0, 64, { facing: 'S', t: 1000, moving: true, running: false, swimming: false, crouched: false, dead: false, celebrating: false, climbing: false, ...over });
  return calls;
}

const without = (calls: string[], call: string) => {
  const i = calls.indexOf(call);
  return i < 0 ? calls : [...calls.slice(0, i), ...calls.slice(i + 1)];
};

/** Colores de relleno y trazo que pone la figura. */
const colors = (calls: string[]) => calls.filter((c) => /^(fill|stroke)Style=/.test(c)).map((c) => c.slice(c.indexOf('=') + 1));
/** Rojo, verde y azul de un color #rgb, #rrggbb, rgb() o rgba(). */
function rgb(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    const h = c.length === 4 ? [...c.slice(1)].map((d) => d + d).join('') : c.slice(1, 7);
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const [r, g, b] = c.slice(c.indexOf('(') + 1, -1).split(',').map(Number);
  return [r, g, b];
}
/** Lo lejos que está un color del gris: 0 en un gris puro. */
const chroma = (c: string) => Math.max(...rgb(c)) - Math.min(...rgb(c));
const maxChroma = (calls: string[]) => Math.max(...colors(calls).map(chroma));

describe('figura en ocho rumbos', () => {
  it('SW es SE en espejo, W es E y NW es NE', () => {
    for (const [mirrored, drawn] of [['SW', 'SE'], ['W', 'E'], ['NW', 'NE']] as [Facing, Facing][]) {
      const m = record({ facing: mirrored });
      expect(m, mirrored).toContain(MIRROR);
      expect(without(m, MIRROR), mirrored).toEqual(record({ facing: drawn }));
    }
  });

  it('las vistas de 3/4 no son ni la de frente, ni la de lado, ni la de espalda', () => {
    expect(record({ facing: 'SE' })).not.toEqual(record({ facing: 'S' }));
    expect(record({ facing: 'SE' })).not.toEqual(record({ facing: 'E' }));
    expect(record({ facing: 'NE' })).not.toEqual(record({ facing: 'N' }));
    expect(record({ facing: 'NE' })).not.toEqual(record({ facing: 'E' }));
  });
});

describe('trepar y caer', () => {
  it('la caída acaba en la postura de caído', () => {
    expect(record({ dead: true, fall: 1, moving: false })).toEqual(record({ dead: true, moving: false }));
  });

  it('la caída empieza de pie', () => {
    expect(record({ dead: true, fall: 0, moving: false })).toEqual(record({ dead: false, moving: false }));
  });

  it('a mitad de la caída no está ni de pie ni caído', () => {
    const half = record({ dead: true, fall: 0.5, moving: false });
    expect(half).not.toEqual(record({ dead: false, moving: false }));
    expect(half).not.toEqual(record({ dead: true, moving: false }));
  });

  it('los caídos se dibujan en gris sin filtro del lienzo (en Chrome sin GPU, el filtro costaba unos 30 ms por figura)', () => {
    const dead = record({ dead: true, moving: false });
    expect(dead.filter((c) => c.startsWith('filter=') && c !== 'filter=none')).toEqual([]);
    for (const c of colors(dead)) expect(chroma(c), c).toBeLessThanOrEqual(40);
    expect(maxChroma(record({ moving: false }))).toBeGreaterThan(80);
  });

  it('a mitad de la caída, el gris va a medias', () => {
    const half = maxChroma(record({ dead: true, fall: 0.5, moving: false }));
    expect(half).toBeLessThan(maxChroma(record({ moving: false })));
    expect(half).toBeGreaterThan(maxChroma(record({ dead: true, moving: false })));
  });

  it('trepar no es andar, en ninguna vista', () => {
    for (const facing of ['S', 'SE', 'E', 'NE', 'N'] as Facing[]) expect(record({ facing, climbing: true }), facing).not.toEqual(record({ facing }));
  });
});
