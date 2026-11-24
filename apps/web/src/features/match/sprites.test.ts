import { describe, expect, it } from 'vitest';
import { appearanceOf } from '@ceniza/shared';
import { BLINK_EVERY, BLINK_MS, BREATH, STRIDE, type Pose } from './figure';
import { FigureSprites, animFrame } from './sprites';

const LOOK = appearanceOf({ name: 'Ana', portrait: { kind: 'generated', seed: 'Ana' }, color: '#9a5b3c', frame: 'sencillo', look: null, district: 3, gender: 'F' } as never);
const BASE: Pose = { facing: 'S', t: 1000, moving: false, running: false, swimming: false, crouched: false, dead: false, celebrating: false, climbing: false };
const DEAD: Pose = { ...BASE, dead: true };
const WALK: Pose = { ...BASE, moving: true };
const mod = (a: number, m: number) => ((a % m) + m) % m;

describe('fotograma de la animación', () => {
  it('andando: el mismo fotograma para tiempos muy cercanos, y se dibuja en el centro exacto de su paso', () => {
    const a = animFrame({ ...WALK, t: 10_000 })!;
    const b = animFrame({ ...WALK, t: 10_004 })!;
    expect(a.key).toBe(b.key);
    // La fase del fotograma es un múltiplo exacto del paso: 24 por ciclo de capa (4π).
    const step = (4 * Math.PI) / 24;
    const k = mod(a.pose.t * STRIDE.walk, 4 * Math.PI) / step;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    // Y está a menos de medio paso de la fase de verdad.
    const d = mod(10_000 * STRIDE.walk - a.pose.t * STRIDE.walk + 2 * Math.PI, 4 * Math.PI) - 2 * Math.PI;
    expect(Math.abs(d)).toBeLessThanOrEqual(step / 2 + 1e-9);
  });

  it('andar, correr y trepar son fotogramas distintos', () => {
    const keys = [WALK, { ...WALK, running: true }, { ...WALK, climbing: true }].map((p) => animFrame({ ...p, t: 5000 })!.key);
    expect(new Set(keys).size).toBe(3);
  });

  it('en reposo conserva el parpadeo', () => {
    const blinking = animFrame({ ...BASE, t: BLINK_EVERY * 7 + 10 })!;
    expect(blinking.pose.t % BLINK_EVERY).toBeLessThan(BLINK_MS);
    const open = animFrame({ ...BASE, t: BLINK_EVERY * 7 + 2000 })!;
    expect(open.pose.t % BLINK_EVERY).toBeGreaterThanOrEqual(BLINK_MS);
    expect(blinking.key).not.toBe(open.key);
    // La respiración, a menos de medio paso (16 por ciclo).
    const step = (2 * Math.PI) / 16;
    const d = mod((BLINK_EVERY * 7 + 2000) * BREATH - open.pose.t * BREATH + Math.PI, 2 * Math.PI) - Math.PI;
    expect(Math.abs(d)).toBeLessThanOrEqual(step / 2 + 1e-9);
  });

  it('a mitad de una caída o celebrando no se guarda (se dibuja tal cual); caído del todo, sí', () => {
    expect(animFrame({ ...DEAD, fall: 0.5 })).toBeNull();
    expect(animFrame({ ...BASE, celebrating: true })).toBeNull();
    expect(animFrame(DEAD)!.key).toBe(animFrame({ ...DEAD, t: 99_999 })!.key);
  });
});

/** Contexto que solo apunta las llamadas, y lienzos falsos que cuentan cuántos se crean. */
function fakes() {
  const made: string[][] = [];
  const ctx = (calls: string[]) =>
    new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (...a: unknown[]) => void calls.push(`${String(k)}(${a.map((v) => (typeof v === 'number' ? Math.round(v) : typeof v)).join(',')})`),
      set: (_t, k, v) => (calls.push(`${String(k)}=${String(v)}`), true),
    }) as unknown as CanvasRenderingContext2D;
  const make = (w: number, h: number) => {
    const calls: string[] = [];
    made.push(calls);
    return { width: w, height: h, getContext: () => ctx(calls) } as unknown as HTMLCanvasElement;
  };
  const main: string[] = [];
  return { made, make, g: ctx(main), main };
}

describe('figuras guardadas como imagen', () => {
  it('cada fotograma se dibuja una vez y después solo se copia, sin escalar', () => {
    const f = fakes();
    const sprites = new FigureSprites(f.make);
    sprites.draw(f.g, 'a', LOOK, 100.4, 200.6, 44, DEAD, 2);
    sprites.draw(f.g, 'a', LOOK, 130, 210, 44, { ...DEAD, t: 5000 }, 2);
    expect(f.made.length).toBe(1);
    expect(f.made[0].some((c) => c.startsWith('fill('))).toBe(true);
    const copies = f.main.filter((c) => c.startsWith('drawImage('));
    expect(copies.length).toBe(2);
    for (const c of copies) expect(c.split(',').length).toBe(3);
  });

  it('otro tamaño, otra densidad, otro rumbo u otro fotograma, otra imagen', () => {
    const f = fakes();
    const sprites = new FigureSprites(f.make);
    sprites.draw(f.g, 'a', LOOK, 100, 200, 44, DEAD, 2);
    sprites.draw(f.g, 'a', LOOK, 100, 200, 48, DEAD, 2);
    sprites.draw(f.g, 'a', LOOK, 100, 200, 48, DEAD, 1);
    sprites.draw(f.g, 'a', LOOK, 100, 200, 48, { ...DEAD, facing: 'E' }, 1);
    sprites.draw(f.g, 'a', LOOK, 100, 200, 48, { ...WALK, t: 0 }, 1);
    sprites.draw(f.g, 'a', LOOK, 100, 200, 48, { ...WALK, t: 150 }, 1);
    expect(f.made.length).toBe(6);
  });

  it('mientras cambia el zoom (fuera de reposo) se dibuja directamente y no se guarda nada', () => {
    const f = fakes();
    new FigureSprites(f.make).draw(f.g, 'a', LOOK, 100, 200, 44.37, DEAD, 2, false);
    expect(f.made.length).toBe(0);
    expect(f.main.some((c) => c.startsWith('fill('))).toBe(true);
  });

  it('lo que no se guarda se dibuja directamente', () => {
    const f = fakes();
    new FigureSprites(f.make).draw(f.g, 'a', LOOK, 100, 200, 44, { ...DEAD, fall: 0.5 }, 2);
    expect(f.made.length).toBe(0);
    expect(f.main.some((c) => c.startsWith('fill('))).toBe(true);
  });

  it('cuando ya no caben (por píxeles), se olvidan las que llevan más tiempo sin dibujarse y su lienzo se reutiliza', () => {
    const f = fakes();
    // Sitio para dos caídos de 44 px a densidad 1 (imágenes de 97 × 71).
    const sprites = new FigureSprites(f.make, 2 * 97 * 71);
    for (const id of ['a', 'b', 'c', 'a']) sprites.draw(f.g, id, LOOK, 0, 0, 44, DEAD, 1);
    // «c» ocupa el lienzo de «a», y «a» vuelve con el de «b»: solo se crearon dos, y se dibujaron cuatro veces.
    expect(f.made.length).toBe(2);
    expect(f.made.flat().filter((c) => c.startsWith('clearRect(')).length).toBe(2);
  });
});
