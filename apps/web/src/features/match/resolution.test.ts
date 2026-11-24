import { describe, expect, it } from 'vitest';
import { Resolution } from './resolution';

/** Fotogramas de `ms` cada uno durante `secs` segundos; devuelve cuántas veces bajó la densidad. */
function run(r: Resolution, ms: number, secs: number, from = 0) {
  let drops = 0;
  for (let t = from; t < from + secs * 1000; t += ms) if (r.frame(t)) drops++;
  return drops;
}

describe('densidad del mapa según lo que tardan los fotogramas', () => {
  it('empieza en la de la pantalla, como mucho 2', () => {
    expect(new Resolution(3).dpr).toBe(2);
    expect(new Resolution(1).dpr).toBe(1);
    expect(new Resolution(1.25).dpr).toBe(1.25);
  });

  it('con fotogramas rápidos no cambia', () => {
    const r = new Resolution(2);
    expect(run(r, 16.7, 20)).toBe(0);
    expect(r.dpr).toBe(2);
  });

  it('si van lentos de forma sostenida, baja un paso cada vez (2, 1,5, 1) y en pantallas densas no baja de 1', () => {
    const r = new Resolution(2);
    expect(run(r, 40, 4)).toBe(1);
    expect(r.dpr).toBe(1.5);
    expect(run(r, 40, 4, 4000)).toBe(1);
    expect(r.dpr).toBe(1);
    expect(run(r, 40, 10, 8000)).toBe(0);
    expect(r.dpr).toBe(1);
  });

  it('por debajo de unos 50 fps sostenidos también baja; en pantallas de densidad 1 llega a 0,75', () => {
    const r = new Resolution(1);
    expect(run(r, 22, 4)).toBe(1);
    expect(r.dpr).toBe(0.75);
    expect(run(r, 40, 10, 4000)).toBe(0);
    expect(r.dpr).toBe(0.75);
    expect(run(new Resolution(1), 18, 10)).toBe(0);
  });

  it('con fotogramas muy lentos (más de un cuarto de segundo) también baja, no los toma por pausas', () => {
    const r = new Resolution(2);
    expect(run(r, 300, 8)).toBe(2);
    expect(r.dpr).toBe(1);
  });

  it('unos pocos fotogramas lentos (cargar bloques, una pausa) no cuentan', () => {
    const r = new Resolution(2);
    let t = 0;
    for (let i = 0; i < 600; i++) {
      t += i % 20 === 0 ? 120 : 16.7;
      r.frame(t);
    }
    r.frame(t + 5000); // pestaña oculta y vuelta
    expect(run(r, 16.7, 5, t + 5000)).toBe(0);
    expect(r.dpr).toBe(2);
  });
});
