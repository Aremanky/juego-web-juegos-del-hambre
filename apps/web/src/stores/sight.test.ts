import { describe, expect, it } from 'vitest';
import type { ActorView } from '@ceniza/shared';
import { actorView as actor, byId } from '../test/fixtures';
import { trackFalls, trackSight, type LastSeen } from './sight';

const pos = (a: ActorView) => ({ x: a.x + 0.5, y: a.y });

describe('visto por última vez', () => {
  it('al dejar de verlo guarda dónde estaba y cuándo', () => {
    const next = trackSight({}, byId(actor('b')), byId(actor('b', { seen: false, x: -1, y: -1 })), 5000, pos);
    expect(next).toEqual({ b: { x: 10.5, y: 12, at: 5000 } });
  });

  it('al volver a verlo, al caer o si ya lo ve todo, se borra', () => {
    const prev: Record<string, LastSeen> = { b: { x: 1, y: 2, at: 100 }, c: { x: 3, y: 4, at: 100 } };
    const before = byId(actor('b', { seen: false }), actor('c', { seen: false }));
    expect(trackSight(prev, before, byId(actor('b'), actor('c', { seen: false })), 900, pos)).toEqual({ c: { x: 3, y: 4, at: 100 } });
    expect(trackSight(prev, before, byId(actor('b', { seen: false, alive: false }), actor('c', { seen: false })), 900, pos)).toEqual({ c: { x: 3, y: 4, at: 100 } });
    // El propio jugador cae: con niebla, desde ese momento lo ve todo.
    expect(trackSight(prev, before, byId(actor('b'), actor('c')), 900, pos)).toEqual({});
  });

  it('sin cambios conserva las marcas, en el mismo objeto', () => {
    const prev = { b: { x: 1, y: 2, at: 100 } };
    expect(trackSight(prev, byId(actor('b', { seen: false })), byId(actor('b', { seen: false })), 900, pos)).toBe(prev);
  });

  it('quien no se había visto no deja marca', () => {
    expect(trackSight({}, {}, byId(actor('b', { seen: false })), 900, pos)).toEqual({});
  });
});

describe('caídas', () => {
  it('vivo → caído guarda la hora; caído → caído la conserva', () => {
    const f = trackFalls({}, byId(actor('b')), byId(actor('b', { alive: false })), 7000);
    expect(f).toEqual({ b: 7000 });
    expect(trackFalls(f, byId(actor('b', { alive: false })), byId(actor('b', { alive: false })), 9000)).toBe(f);
  });

  it('quien llega ya caído no se anima', () => {
    expect(trackFalls({}, {}, byId(actor('b', { alive: false })), 7000)).toEqual({});
  });
});
