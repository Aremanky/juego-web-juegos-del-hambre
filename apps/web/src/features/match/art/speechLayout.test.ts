import { describe, expect, it } from 'vitest';
import { layoutSpeech, type Box, type SpeechBubbleIn, type SpeechSpot } from './speechLayout';

const DESK = { w: 1280, h: 720 };
const PHONE = { w: 390, h: 844 };
const say = (id: string, hx: number, hy: number, at = 0, w = 190, h = 40): SpeechBubbleIn => ({ id, hx, hy, hr: 8, w, h, at });

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (p: { x: number; y: number }, b: Box) => p.x > b.x + 1 && p.x < b.x + b.w - 1 && p.y > b.y + 1 && p.y < b.y + b.h - 1;
/** La cabeza y la cara: lo que no se puede tapar para saber quién es quién. */
const head = (c: { hx: number; hy: number; hr: number }): Box => ({ x: c.hx - c.hr, y: c.hy, w: c.hr * 2, h: c.hr * 2 });

/** Puntos del pico, desde su base en el borde de la cartela hasta la punta. */
function tail(s: SpeechSpot) {
  const { box, edge, base, tip } = s;
  const from = edge === 'abajo' ? { x: base, y: box.y + box.h } : edge === 'izq' ? { x: box.x, y: base } : { x: box.x + box.w, y: base };
  return Array.from({ length: 41 }, (_, i) => ({ x: from.x + ((tip.x - from.x) * i) / 40, y: from.y + ((tip.y - from.y) * i) / 40 }));
}

/** Lo que tiene que cumplir siempre que haya sitio: nada se pisa, nada tapa una cara y cada pico va a su dueño. */
function expectClean(spots: SpeechSpot[], items: SpeechBubbleIn[], bounds: { w: number; h: number }) {
  expect(spots).toHaveLength(items.length);
  for (const s of spots) {
    const me = items.find((i) => i.id === s.id)!;
    expect(s.box.x, `${s.id} se sale por la izquierda`).toBeGreaterThanOrEqual(0);
    expect(s.box.y, `${s.id} se sale por arriba`).toBeGreaterThanOrEqual(0);
    expect(s.box.x + s.box.w, `${s.id} se sale por la derecha`).toBeLessThanOrEqual(bounds.w);
    expect(s.box.y + s.box.h, `${s.id} se sale por abajo`).toBeLessThanOrEqual(bounds.h);
    expect(Math.abs(s.tip.x - me.hx), `el pico de ${s.id} no va a su cabeza`).toBeLessThanOrEqual(me.hr + 3);
    expect(s.tip.y, `el pico de ${s.id} no va a su cabeza`).toBeGreaterThanOrEqual(me.hy - 3);
    expect(s.tip.y, `el pico de ${s.id} no va a su cabeza`).toBeLessThanOrEqual(me.hy + me.hr * 2 + 2);
    for (const c of items) expect(overlap(s.box, head(c)), `${s.id} tapa la cara de ${c.id}`).toBe(false);
    for (const o of spots) {
      if (o === s) continue;
      expect(overlap(s.box, o.box), `${s.id} pisa a ${o.id}`).toBe(false);
      expect(tail(s).some((p) => inside(p, o.box)), `el pico de ${s.id} atraviesa a ${o.id}`).toBe(false);
    }
  }
}

describe('colocación de los bocadillos', () => {
  it('uno solo va centrado encima de la cabeza', () => {
    const items = [say('a', 640, 300)];
    const [s] = layoutSpeech(items, { bounds: DESK });
    expect(s.kind).toBe('arriba');
    expect(s.box.x + s.box.w / 2).toBeCloseTo(640, 0);
    expect(s.box.y + s.box.h).toBeLessThanOrEqual(300 - 4);
    expectClean([s], items, DESK);
  });

  it('dos que hablan juntos no se pisan ni se tapan la cara', () => {
    const items = [say('a', 600, 300, 0), say('b', 640, 308, 1)];
    expectClean(layoutSpeech(items, { bounds: DESK }), items, DESK);
  });

  it('pegados al borde de un móvil tampoco, y ningún pico atraviesa al otro bocadillo', () => {
    for (const items of [
      [say('a', 60, 357, 0, 186), say('b', 95, 387, 1, 186)],
      [say('a', 330, 357, 0, 186), say('b', 295, 387, 1, 186)],
      [say('a', 95, 387, 0, 186), say('b', 60, 357, 1, 186)],
    ]) {
      expectClean(layoutSpeech(items, { bounds: PHONE }), items, PHONE);
    }
  });

  it('pegado al borde de arriba se pone al lado sin taparse la cara', () => {
    // Con 186 px de ancho, en un móvil de 390 solo cabe al lado si hay 202 px libres a un lado de la cabeza.
    for (const x of [120, 12, 380]) {
      const items = [say('a', x, 14, 0, 186)];
      expectClean(layoutSpeech(items, { bounds: PHONE }), items, PHONE);
    }
  });

  it('no tapa la cara de quien está al lado aunque no hable', () => {
    const items = [say('a', 600, 300)];
    const [s] = layoutSpeech(items, { bounds: DESK, heads: [{ id: 'n', x: 560, y: 268, r: 8 }] });
    expect(overlap(s.box, head({ hx: 560, hy: 268, hr: 8 }))).toBe(false);
    expectClean([s], items, DESK);
  });

  it('entre dos sitios igual de buenos se queda donde estaba', () => {
    // Alguien callado justo encima: arriba no cabe sin taparle la cara, y a izquierda y derecha hay el mismo hueco.
    const items = [say('a', 640, 300)];
    const heads = [{ id: 'n', x: 640, y: 262, r: 8 }];
    const [first] = layoutSpeech(items, { bounds: DESK, heads });
    expect(['lado-der', 'lado-izq']).toContain(first.kind);
    const flipped = first.kind === 'lado-der' ? 'lado-izq' : 'lado-der';
    const [again] = layoutSpeech(items, { bounds: DESK, heads, prev: new Map([['a', { kind: flipped, lift: 0 }]]) });
    expect(again.kind).toBe(flipped);
  });

  it('cuatro a la vez en un móvil: todos dentro de la pantalla, en orden de antigüedad y con el pico hacia su dueño', () => {
    const items = [say('c', 268, 434, 2, 186), say('a', 121, 357, 0, 186), say('b', 156, 387, 1, 186), say('d', 329, 272, 3, 186)];
    const spots = layoutSpeech(items, { bounds: PHONE });
    expect(spots.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    for (const s of spots) {
      const me = items.find((i) => i.id === s.id)!;
      expect(s.box.x).toBeGreaterThanOrEqual(0);
      expect(s.box.x + s.box.w).toBeLessThanOrEqual(PHONE.w);
      expect(s.box.y).toBeGreaterThanOrEqual(0);
      expect(Math.abs(s.tip.x - me.hx)).toBeLessThanOrEqual(me.hr + 3);
    }
  });
});
