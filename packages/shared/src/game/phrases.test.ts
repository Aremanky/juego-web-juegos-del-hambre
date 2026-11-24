import { describe, expect, it } from 'vitest';
import { LIVE_SITUATIONS, MAX_PHRASE_CHARS, PERSONALITY_KEYS, PHRASES, SPEECH_SITUATIONS, TARGETED, VOICE_KEYS, VOICE_OF, fillPhrase, pickPhrase } from '../index.js';

const every = (fn: (s: (typeof SPEECH_SITUATIONS)[number], v: (typeof VOICE_KEYS)[number], t: string, i: number) => void) => {
  for (const s of SPEECH_SITUATIONS) for (const v of VOICE_KEYS) PHRASES[s][v].forEach((t, i) => fn(s, v, t, i));
};

describe('frases de los bots (GDD §13)', () => {
  it('cada voz tiene frases para cada situación', () => {
    expect(SPEECH_SITUATIONS).toHaveLength(13);
    expect(LIVE_SITUATIONS).toHaveLength(8);
    for (const s of SPEECH_SITUATIONS) {
      for (const v of VOICE_KEYS) expect(PHRASES[s][v].length, `${s}.${v}`).toBeGreaterThanOrEqual(LIVE_SITUATIONS.includes(s) ? 3 : 2);
    }
  });

  it('cada personalidad habla con una voz del catálogo', () => {
    for (const p of PERSONALITY_KEYS) expect(VOICE_KEYS as readonly string[]).toContain(VOICE_OF[p]);
  });

  it('las plantillas son cortas, sin emojis y con un solo marcador {objetivo} donde toca', () => {
    every((s, _v, t) => {
      expect(t.length, t).toBeLessThanOrEqual(MAX_PHRASE_CHARS);
      expect(/\p{Extended_Pictographic}/u.test(t), t).toBe(false);
      expect(t.replace('{objetivo}', ''), t).not.toMatch(/[{}]/);
      if (!TARGETED.has(s)) expect(t, t).not.toContain('{objetivo}');
    });
    for (const s of TARGETED) for (const v of VOICE_KEYS) expect(PHRASES[s][v].some((t) => t.includes('{objetivo}')), `${s}.${v}`).toBe(true);
  });

  it('los identificadores son únicos y estables', () => {
    const ids = new Set<string>();
    let total = 0;
    every((s, v, _t, i) => {
      ids.add(`${s}.${v}.${i}`);
      total++;
    });
    expect(ids.size).toBe(total);
    expect(pickPhrase('acecho', 'agresivo', 0).id).toBe('acecho.fiero.0');
    expect(pickPhrase('acecho', 'agresivo', 0).template).toBe(PHRASES.acecho.fiero[0]);
  });

  it('pickPhrase es determinista y evita lo dicho hace poco', () => {
    const a = pickPhrase('estallido', 'cauteloso', 0.42);
    expect(pickPhrase('estallido', 'cauteloso', 0.42)).toEqual(a);
    expect(pickPhrase('estallido', 'cauteloso', 0.42, [a.id]).id).not.toBe(a.id);
    // Si ya las ha dicho todas, repite antes que callarse.
    const all = PHRASES.estallido.prudente.map((_, i) => `estallido.prudente.${i}`);
    expect(pickPhrase('estallido', 'cauteloso', 0.42, all).id).toBe(a.id);
    expect(pickPhrase('estallido', 'cauteloso', 0.9999).id).toBe(`estallido.prudente.${PHRASES.estallido.prudente.length - 1}`);
  });

  it('fillPhrase pone el nombre y cabe con los nombres más largos', () => {
    const long = 'Bartolomé de las Cumbres';
    expect(long).toHaveLength(24);
    every((_s, _v, t) => {
      const out = fillPhrase(t, { objetivo: long });
      expect(out.length, out).toBeLessThanOrEqual(90);
      expect(out).not.toContain('{objetivo}');
    });
    expect(fillPhrase('Te veo, {objetivo}.', { objetivo: 'Lía' })).toBe('Te veo, Lía.');
    expect(fillPhrase('Te veo, {objetivo}.', {})).toBe('Te veo, alguien.');
  });
});
