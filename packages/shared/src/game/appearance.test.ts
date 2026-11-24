import { describe, expect, it } from 'vitest';
import { appearanceOf, HAIR_COLORS, SKIN_TONES } from './appearance.js';
import { avatarSvg } from './avatar.js';
import { LookSchema } from '../schemas/character.js';

const base = { portrait: { kind: 'generated' as const, seed: 'semilla' }, color: '#3b4f7a', district: 7, gender: 'F' as const, name: 'Iria' };

describe('apariencia del personaje', () => {
  it('sin elegir nada se deriva del retrato y es siempre la misma', () => {
    expect(appearanceOf(base)).toEqual(appearanceOf(base));
    expect(appearanceOf(base).outfit).toBe('#3b4f7a');
  });

  it('lo elegido en el editor manda sobre lo derivado', () => {
    const a = appearanceOf({ ...base, look: { skin: 0, hairColor: 9, hairStyle: 'trenza', outfitStyle: 'capa', accessory: 'carcaj', outfit: '#8c3b2e', build: 'robusta', height: 2 } });
    expect(a.skin).toBe(SKIN_TONES[0][0]);
    expect(a.hair).toBe(HAIR_COLORS[9][0]);
    expect(a.hairStyle).toBe('trenza');
    expect(a.outfitStyle).toBe('capa');
    expect(a.accessory).toBe('carcaj');
    expect(a.outfit).toBe('#8c3b2e');
    expect(a.build).toBeGreaterThan(appearanceOf(base).build);
    expect(a.height).toBeCloseTo(1.06);
  });

  it('el esquema rechaza valores fuera de las listas', () => {
    expect(LookSchema.safeParse({ skin: 3, hairStyle: 'rizos' }).success).toBe(true);
    expect(LookSchema.safeParse({ skin: 99 }).success).toBe(false);
    expect(LookSchema.safeParse({ outfit: 'rojo' }).success).toBe(false);
    expect(LookSchema.safeParse({ accessory: 'corona' }).success).toBe(false);
  });

  it('el camafeo toma peinado, colores y complementos sin cambiar el resto del retrato', () => {
    const plain = avatarSvg('semilla', '#3b4f7a');
    expect(avatarSvg('semilla', '#3b4f7a', null)).toBe(plain);
    const painted = avatarSvg('semilla', '#3b4f7a', { hairStyle: 'melena', hair: HAIR_COLORS[8][0], hairShade: HAIR_COLORS[8][1], accessory: 'bufanda', trim: '#c49a3a' });
    expect(painted).not.toBe(plain);
    expect(painted).toBe(avatarSvg('semilla', '#3b4f7a', { hairStyle: 'melena', hair: HAIR_COLORS[8][0], hairShade: HAIR_COLORS[8][1], accessory: 'bufanda', trim: '#c49a3a' }));
  });
});
