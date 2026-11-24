import { describe, expect, it } from 'vitest';
import { planRoute } from '@ceniza/engine';
import type { ActorView } from '@ceniza/shared';
import { actorView, flatMap } from '../../test/fixtures';
import { TAP_PREVIEW_MS, formatDuration, formatEta, previewFor, tapPreview } from './plan';

const COSTS = Array.from({ length: 14 }, () => 1);
const me = (over: Partial<ActorView> = {}) => actorView('yo', { kind: 'human', userId: 'u-yo', move: { speed: 1.5, costs: COSTS }, ...over });
const NB = ' ';

describe('tiempo en español', () => {
  it('redondea a segundos y pasa a minutos, sin partir número y unidad', () => {
    expect(formatEta(400)).toBe(`≈${NB}1${NB}s`);
    expect(formatEta(25_000)).toBe(`≈${NB}25${NB}s`);
    expect(formatEta(59_600)).toBe(`≈${NB}1${NB}min`);
    expect(formatEta(80_000)).toBe(`≈${NB}1${NB}min 20${NB}s`);
    expect(formatDuration(120_000)).toBe(`2${NB}min`);
  });
});

describe('vista previa de la ruta', () => {
  const map = flatMap(40);

  it('es la ruta de planRoute, con el tiempo hasta llegar', () => {
    const p = previewFor(map, me({ x: 5, y: 5 }), { x: 15, y: 9 }, 1000);
    const plan = planRoute(map, { x: 5, y: 5, route: null }, { x: 15, y: 9 }, 1000, 1.5, COSTS);
    if (!plan.ok) throw new Error(plan.error);
    expect(p).toEqual({ x: 15, y: 9, route: plan.route, eta: plan.arrival - 1000, cells: plan.route!.times.length - 1, error: null });
  });

  it('con los errores de siempre', () => {
    expect(previewFor(map, me(), { x: 99, y: 0 }, 0)).toEqual({ x: 99, y: 0, route: null, eta: null, cells: null, error: 'Ese destino está fuera de la arena' });
  });

  it('sin personaje propio, caído o sin datos de movimiento, no hay vista previa', () => {
    expect(previewFor(map, null, { x: 1, y: 1 }, 0)).toBeNull();
    expect(previewFor(map, me({ alive: false }), { x: 1, y: 1 }, 0)).toBeNull();
    expect(previewFor(map, me({ move: null }), { x: 1, y: 1 }, 0)).toBeNull();
  });

  it('si la ruta propia cambia, la vista previa sale de la nueva', () => {
    const quieto = previewFor(map, me({ x: 5, y: 5 }), { x: 20, y: 5 }, 1000)!;
    // Ya va hacia la derecha desde el instante 0: llega antes que si estuviera parado en el mismo sitio.
    const yendo = planRoute(map, { x: 5, y: 5, route: null }, { x: 12, y: 5 }, 0, 1.5, COSTS);
    if (!yendo.ok) throw new Error(yendo.error);
    const andando = previewFor(map, me({ x: 5, y: 5, route: yendo.route }), { x: 20, y: 5 }, 1000)!;
    expect(andando.eta).toBeLessThan(quieto.eta!);
  });
});

describe('vista previa táctil', () => {
  const c = { x: 3, y: 4 };

  it('el primer toque enseña la ruta; el segundo en la misma casilla va', () => {
    const a = tapPreview(null, { type: 'tap', cell: c, at: 0 });
    expect(a).toEqual({ state: { cell: c, at: 0 }, go: null });
    expect(tapPreview(a.state, { type: 'tap', cell: { x: 3, y: 4 }, at: 900 })).toEqual({ state: null, go: c });
  });

  it('otro toque mueve la vista previa; el botón va; cancelar la quita', () => {
    const s = { cell: c, at: 0 };
    expect(tapPreview(s, { type: 'tap', cell: { x: 5, y: 5 }, at: 500 })).toEqual({ state: { cell: { x: 5, y: 5 }, at: 500 }, go: null });
    expect(tapPreview(s, { type: 'go' })).toEqual({ state: null, go: c });
    expect(tapPreview(s, { type: 'cancel' })).toEqual({ state: null, go: null });
  });

  it('caduca sola, y tocar la misma casilla ya caducada vuelve a empezar', () => {
    const s = { cell: c, at: 0 };
    expect(tapPreview(s, { type: 'tick', at: TAP_PREVIEW_MS - 1 }).state).toBe(s);
    expect(tapPreview(s, { type: 'tick', at: TAP_PREVIEW_MS + 1 }).state).toBeNull();
    expect(tapPreview(s, { type: 'tap', cell: c, at: TAP_PREVIEW_MS + 1 })).toEqual({ state: { cell: c, at: TAP_PREVIEW_MS + 1 }, go: null });
  });
});
