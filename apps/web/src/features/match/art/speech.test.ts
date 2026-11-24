import { describe, expect, it } from 'vitest';
import { wrapLines } from './speech';

/** Medidor de mentira: 6 px por carácter. */
const mono = { measureText: (s: string) => ({ width: s.length * 6 }) } as Pick<CanvasRenderingContext2D, 'measureText'>;
const width = (l: string) => l.length * 6;

describe('líneas del bocadillo', () => {
  it('si cabe en una línea, va en una sola', () => {
    expect(wrapLines(mono, 'Ahí va.', 170)).toEqual(['Ahí va.']);
  });

  it('cabe en el ancho y, si no cabe en tres líneas, la última acaba en «…»', () => {
    const lines = wrapLines(mono, 'No quiero hacerte daño, Bartolomé de las Cumbres, ni que me lo hagas tú a mí tampoco hoy', 100);
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(width(l)).toBeLessThanOrEqual(100);
    expect(lines[2].endsWith('…')).toBe(true);
  });

  it('reparte las líneas como un rotulista, sin dejar una palabra sola al final', () => {
    const lines = wrapLines(mono, 'A oscuras todos parecemos de fiar.', 170);
    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).toBe('A oscuras todos parecemos de fiar.');
    expect(lines[1].includes(' ')).toBe(true);
    expect(Math.max(...lines.map(width))).toBeLessThan(width('A oscuras todos parecemos de'));
  });
});
