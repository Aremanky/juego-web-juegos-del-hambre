import { Rng } from '../util/rng.js';

/**
 * Retratos procedurales para bots y participantes sin foto: camafeos de perfil.
 *
 * Dirección de arte (ver GDD §1): un relieve tallado en hueso sobre una concha del
 * color del jugador, como los camafeos con los que la Ciudadela registra a los
 * participantes. Todos miran a la derecha y la luz llega de arriba a la derecha.
 * La identidad la lleva la silueta (peinado, nariz, mentón, cuello), que es lo
 * único que sobrevive a 30–40 px; ojo, oreja y pliegues son detalle para tamaños
 * grandes. Determinista por semilla. Se usa como data URI para aislar los ids.
 */

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function darken(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r * (1 - amt), g * (1 - amt), b * (1 - amt)]);
}
export function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt]);
}
function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

const SOOT = '#17130f';
/** Tonos del relieve: piel, ropa y tres tallas de pelo. */
const SKIN = ['#f3ebdd', '#d9ccb5'] as const;
const CLOTH = ['#ddd0b9', '#bfae91'] as const;
const HAIR_TONES = [
  ['#bcaa89', '#998769'],
  ['#a3906f', '#7f6e52'],
  ['#cbbd9e', '#ab9b7c'],
] as const;
const LINE = '#8f7f66';

export const CAMEO_HAIR_STYLES = ['corto', 'melena', 'mono', 'trenza', 'rizos', 'cresta', 'rapado', 'capucha', 'coleta'] as const;
export type HairStyle = (typeof CAMEO_HAIR_STYLES)[number];

const f = (n: number) => (Math.round(n * 10) / 10).toString();

interface Face {
  nose: 0 | 1 | 2 | 3;
  chin: 0 | 1 | 2;
  fullLips: boolean;
  strongBrow: boolean;
  thickNeck: boolean;
}

/** Silueta de cabeza y cuello, mirando a la derecha. */
function headPath(p: Face): string {
  const browX = 88.4 + (p.strongBrow ? 1.6 : 0);
  const chinX = p.chin === 1 ? 90.2 : p.chin === 2 ? 86.2 : 88.6;
  const lip = p.fullLips ? 1.3 : 0;
  const nk = p.thickNeck ? 3.2 : 0;
  const noses = [
    // recta
    'C 90 57, 94 60.5, 97 63.6 C 97.6 64.4, 96.8 65.9, 95.2 66.1 C 93.4 66.4, 91 66.5, 89.6 67.2',
    // aguileña
    'C 89.5 55, 92.5 55.8, 93.6 58.2 C 94.6 60.3, 96.6 62.6, 96.6 64.6 C 96.6 66, 94.6 66.4, 92.8 66.5 C 91.3 66.6, 90.3 66.8, 89.6 67.2',
    // respingona
    'C 88.5 57, 90 60, 92.6 61.6 C 94.4 62.6, 95 63.8, 94 64.8 C 92.8 66, 90.8 66.2, 89.6 66.8',
    // larga
    'C 90.5 57.5, 95 61.5, 98.8 65.2 C 99.4 66, 98.4 67.4, 96.6 67.4 C 94.4 67.5, 91.6 67.4, 89.9 67.8',
  ];
  return [
    `M ${f(43 - nk)} 116`,
    `C ${f(43 - nk)} 102, 44 93, 45.5 86`,
    'C 38 78, 33 66, 33 52',
    'C 33 32, 46 19, 61 19',
    'C 74 19, 83 25, 86 36',
    `C 87.5 41, ${f(browX)} 45, ${f(browX)} 49`,
    `C ${f(browX)} 51, 87.5 52, 87.5 53.5`,
    noses[p.nose],
    `C 90.4 68.6, ${f(90.6 + lip)} 70, ${f(90.6 + lip)} 71`,
    `C ${f(90.6 + lip)} 72.4, 88.4 73, 87.6 73.4`,
    `C 88.8 74, ${f(89.8 + lip * 0.8)} 75, ${f(89.6 + lip * 0.8)} 76.4`,
    'C 89.4 77.8, 87 78.4, 86.6 79.2',
    `C ${f(chinX - 0.6)} 80.5, ${f(chinX)} 82, ${f(chinX)} 84`,
    `C ${f(chinX)} 87, 86.5 89.2, 83.5 89.6`,
    'C 80 90, 76 89.5, 73 89',
    `C 72.4 92, ${f(72.6 + nk * 0.3)} 96, ${f(74 + nk)} 104`,
    `L ${f(75 + nk)} 116 Z`,
  ].join(' ');
}

/** Peinados: [relleno, mechones, ¿oreja visible?]. Se dibujan sobre cabeza y ropa. */
function hairShape(style: HairStyle, r: Rng): { fill: string; strands: string; ear: boolean; hood?: string } {
  // Contorno base del pelo corto, compartido por varios peinados.
  const cap =
    'M 84.5 33 C 82 21, 68 14, 55 15 C 41 16, 30 27, 30 44 C 30 57, 34 67, 41 76 L 47.5 75 ' +
    'C 47.5 68, 50.5 62, 55 58 C 57.5 54.5, 62 51.5, 66.5 52 L 68.5 58.5 L 71.5 57.5 C 71.5 48, 76 38.5, 84.5 33 Z';
  const capStrands = 'M 80 30 C 70 23, 56 22, 44 28 M 76 36 C 66 31, 54 32, 42 40 M 40 52 C 41 60, 43 66, 46 71';
  switch (style) {
    case 'corto':
      return { fill: cap, strands: capStrands, ear: true };
    case 'melena':
      return {
        fill:
          'M 86 33 C 84 19, 70 12, 56 13 C 40 14, 28 26, 28 44 C 27 60, 30 78, 26 96 C 25 101, 27 106, 31 107 ' +
          'C 36 108, 41 106, 45 108 C 49 109, 52 106, 51 101 C 49 90, 50 78, 54 68 C 57 61, 62 56, 68 56 ' +
          'L 71.5 61 L 73 58.5 C 73 48, 77 39, 86 33 Z',
        strands: 'M 80 28 C 68 20, 52 21, 40 32 M 74 34 C 64 30, 54 33, 47 41 M 38 44 C 36 62, 37 80, 34 100 M 46 52 C 44 66, 44 82, 44 102',
        ear: false,
      };
    case 'mono': {
      const bx = 32 + r.int(-2, 2);
      const by = 37 + r.int(-3, 3);
      return {
        fill:
          'M 84.5 33 C 82 22, 69 15.5, 56 16 C 43 16.5, 32 26, 31.5 42 C 31 56, 35 66, 41.5 75 L 47.5 74.5 ' +
          'C 47.5 68, 50.5 62, 55 58 C 57.5 54.5, 62 51.5, 66.5 52 L 68.5 58.5 L 71.5 57.5 C 71.5 48, 76 38.5, 84.5 33 Z ' +
          `M ${bx + 12.5} ${by} a 12.5 12 0 1 1 -25 0 a 12.5 12 0 1 1 25 0 Z`,
        strands: `M 80 30 C 66 22, 50 24, 38 34 M 74 38 C 62 33, 50 36, 40 46 M ${bx - 7} ${by - 3} C ${bx - 2} ${by - 9}, ${bx + 6} ${by - 7}, ${bx + 8} ${by}`,
        ear: true,
      };
    }
    case 'trenza': {
      const links = [0, 1, 2, 3, 4]
        .map((i) => {
          const cx = 42 - i * 2.3;
          const cy = 81 + i * 9.2;
          return `M ${f(cx + 5.6)} ${f(cy)} a 5.6 6.2 0 1 1 -11.2 0 a 5.6 6.2 0 1 1 11.2 0 Z`;
        })
        .join(' ');
      return {
        fill: `${cap} ${links}`,
        strands: `${capStrands} M 38 84 L 46 80 M 36 93 L 44 89 M 33.5 102 L 41.5 98 M 31 111 L 39 107`,
        ear: true,
      };
    }
    case 'rizos': {
      const anchors: [number, number][] = [
        [86, 32], [85, 22], [79, 13], [70, 7], [59, 4.5], [48, 5], [38, 9], [29, 16], [23, 25], [20, 36], [20, 47], [23, 58], [28, 67], [35, 74], [41, 77],
      ];
      let d = `M ${anchors[0][0]} ${anchors[0][1]}`;
      for (let i = 1; i < anchors.length; i++) {
        const [ax, ay] = anchors[i - 1];
        const [bx, by] = anchors[i];
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const len = Math.hypot(mx - 52, my - 40) || 1;
        d += ` Q ${f(mx + ((mx - 52) / len) * 4.2)} ${f(my + ((my - 40) / len) * 4.2)} ${bx} ${by}`;
      }
      d += ' L 47.5 75 C 47.5 68, 50.5 62, 55 58 C 57.5 54.5, 62 51.5, 66.5 52 L 68.5 58.5 L 71.5 57.5 C 71.5 48, 76 38.5, 86 32 Z';
      const marks: [number, number][] = [[72, 16], [60, 11], [47, 12], [36, 19], [28, 30], [26, 43], [29, 55], [35, 64], [44, 22], [54, 20], [64, 22], [38, 34], [36, 47], [44, 30]];
      return {
        fill: d,
        strands: marks.map(([x, y]) => `M ${f(x - 3)} ${f(y + 1.5)} C ${f(x - 2)} ${f(y - 2.2)}, ${f(x + 2.2)} ${f(y - 2.2)}, ${f(x + 3)} ${f(y + 1)}`).join(' '),
        ear: true,
      };
    }
    case 'cresta':
      return {
        fill:
          'M 85 33 C 90 24, 86 13, 75 9.5 C 62 6, 46 10, 37 22 C 32 29, 31 37, 32.5 45 L 40 47 ' +
          'C 41 40, 47 34.5, 55 33 C 63 31.5, 73 32, 85 33 Z',
        strands: 'M 83 27 C 76 16, 62 12, 48 17 M 79 31 C 70 23, 58 21, 45 27 M 38 34 C 40 29, 44 25, 49 23',
        ear: true,
      };
    case 'rapado':
      return {
        fill:
          'M 84 33.5 C 81.5 23, 68 17.5, 56 18 C 43.5 18.5, 33 27.5, 32.5 43 C 32.5 54, 35.5 63, 40.5 71 L 44 70.5 ' +
          'C 41 63, 39.5 55, 40 47 C 41 35, 50 27.5, 60 26.5 C 70 25.5, 79 28.5, 84 33.5 Z',
        strands: '',
        ear: true,
      };
    case 'capucha':
      return {
        fill:
          'M 89 34 C 88 16, 72 5, 54 6 C 34 7, 21 23, 21 46 C 21 70, 26 92, 20 128 L 60 128 ' +
          'C 61 118, 64 100, 66.5 92 C 69 84, 70 74, 70.5 64 C 71 52, 77 40, 89 34 Z',
        strands: 'M 84 28 C 74 16, 56 13, 42 22 M 32 40 C 29 62, 31 86, 28 112 M 44 60 C 41 80, 42 100, 40 124',
        ear: false,
        hood: 'M 88 35 C 77 41, 71.5 52, 71 64 C 70.5 74, 69.5 84, 67 92 C 64.5 100, 62 114, 60.5 140',
      };
    case 'coleta':
    default:
      return {
        fill:
          'M 84.5 33 C 82 22, 69 15.5, 56 16 C 43 16.5, 32 26, 31.5 42 C 31 56, 35 66, 41.5 75 L 47.5 74.5 ' +
          'C 47.5 68, 50.5 62, 55 58 C 57.5 54.5, 62 51.5, 66.5 52 L 68.5 58.5 L 71.5 57.5 C 71.5 48, 76 38.5, 84.5 33 Z ' +
          'M 39 28 C 25 28, 16 42, 18 60 C 19 70, 22.5 77, 20.5 86 C 29 80, 31.5 68, 32.5 57 C 33.5 47, 37 39, 43 34 Z',
        strands: 'M 80 30 C 66 22, 50 24, 38 34 M 33 34 C 25 40, 22 52, 23 64 M 37 37 C 31 46, 29 58, 28 72',
        ear: true,
      };
  }
}

export function avatarSvg(seed: string, accent = '#e0662f'): string {
  const r = new Rng('camafeo:' + seed);
  const style = r.pick(CAMEO_HAIR_STYLES);
  const face: Face = {
    nose: r.int(0, 3) as Face['nose'],
    chin: r.int(0, 2) as Face['chin'],
    fullLips: r.chance(0.5),
    strongBrow: r.chance(0.4),
    thickNeck: r.chance(0.35),
  };
  const [hairA, hairB] = r.pick(HAIR_TONES);
  const extra = r.pick(['ninguno', 'ninguno', 'pendiente', 'cicatriz'] as const);
  const tilt = f(r.int(-40, 25) / 10);
  const hair = hairShape(style, r);
  const head = headPath(face);

  const ground = mix(accent, SOOT, 0.5);
  const shadow = mix(ground, '#000000', 0.45);
  const p: string[] = [];

  p.push(
    '<defs>' +
      '<clipPath id="c"><circle cx="64" cy="64" r="64"/></clipPath>' +
      // Luz de arriba a la derecha: el relieve se oscurece hacia abajo a la izquierda.
      `<linearGradient id="s" x1="1" y1="0" x2="0" y2="1"><stop offset=".15" stop-color="${SKIN[0]}"/><stop offset="1" stop-color="${SKIN[1]}"/></linearGradient>` +
      `<linearGradient id="h" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hairA}"/><stop offset="1" stop-color="${hairB}"/></linearGradient>` +
      `<linearGradient id="w" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CLOTH[0]}"/><stop offset="1" stop-color="${CLOTH[1]}"/></linearGradient>` +
      `<linearGradient id="k" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(CLOTH[1], '#000000', 0.12)}"/><stop offset="1" stop-color="${mix(CLOTH[1], '#000000', 0.32)}"/></linearGradient>` +
      '</defs>',
  );
  p.push('<g clip-path="url(#c)">');
  p.push(`<rect width="128" height="128" fill="${ground}"/>`);
  p.push(`<circle cx="64" cy="64" r="58.5" fill="none" stroke="${SKIN[0]}" stroke-opacity=".2" stroke-width="1.2"/>`);

  const bust = 'M -6 156 C 0 122, 14 104, 38 99 C 52 96, 70 97, 84 102 C 102 108, 116 124, 122 156 Z';
  const cloth = 'M -6 156 C 0 124, 14 108, 31 103 C 44 109, 60 113, 79 108.5 C 95 105.5, 112 118, 122 156 Z';
  const figure = `<path d="${bust}" fill="url(#s)"/><path d="${head}" fill="url(#s)"/><path d="${cloth}" fill="url(#w)"/><path d="${hair.fill}" fill="url(#${hair.hood ? 'k' : 'h'})" stroke="${mix(hair.hood ? CLOTH[1] : hairB, '#000000', 0.3)}" stroke-width=".9" stroke-linejoin="round"/>` +
    (hair.hood ? `<path d="${hair.hood}" fill="none" stroke="${CLOTH[0]}" stroke-width="2.6" stroke-linecap="round" opacity=".9"/>` : '');

  // La figura se talla a escala 0,84 con el centro en (60, 68): deja aire delante del perfil.
  const place = `rotate(${tilt} 60 68) translate(60 68) scale(.84) translate(-64 -64)`;
  // Sombra que el relieve proyecta sobre la concha.
  p.push(`<g transform="translate(-1.6 2.2) ${place}" fill="${shadow}" opacity=".75"><path d="${bust}"/><path d="${head}"/><path d="${hair.fill}"/></g>`);

  p.push(`<g transform="${place}">`);
  p.push(figure);
  // Talla: pliegues, mechones, oreja, ojo, ceja, aleta, boca y mandíbula.
  const lines: string[] = [
    'M 28 110 C 40 116, 56 120, 70 119.5',
    'M 60 124.5 C 72 121.5, 86 118.5, 98 121.5',
    'M 77.5 55.4 C 79.2 54.1, 82.2 54.3, 84 56 M 78.4 57.3 C 80.3 57.9, 82.4 57.5, 84 56',
    'M 91.4 65.7 C 92.5 64.5, 94 64.6, 94.5 65.6',
    'M 87.6 73.4 L 85 73.9',
  ];
  if (hair.ear) {
    p.push(`<path d="M 61.5 54.5 C 66 53.5, 68.5 57.5, 67.4 61.6 C 66.6 64.6, 64.8 66.4, 62.6 68.4 C 61.4 69.4, 60 69.4, 59.4 68.2 C 59 64, 59.2 58, 61.5 54.5 Z" fill="${SKIN[1]}" opacity=".55"/>`);
    lines.push('M 61.5 54.5 C 66 53.5, 68.5 57.5, 67.4 61.6 C 66.6 64.6, 64.8 66.4, 62.6 68.4 C 61.4 69.4, 60 69.4, 59.4 68.2', 'M 63 58.2 C 65.2 58.4, 65.6 61.2, 63.9 62.8');
  }
  if (hair.strands) p.push(`<path d="${hair.strands}" fill="none" stroke="${hair.hood ? mix(CLOTH[1], '#000000', 0.4) : hairB}" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>`);
  p.push(`<path d="${lines.join(' ')}" fill="none" stroke="${LINE}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`);
  p.push(`<path d="M 76.6 50.9 C 79.6 49.3, 83.6 48.9, 86.9 49.9" fill="none" stroke="${hairB}" stroke-width="${face.strongBrow ? 2.2 : 1.6}" stroke-linecap="round"/>`);
  if (extra === 'pendiente' && hair.ear) {
    p.push(`<circle cx="61.2" cy="71.4" r="2.1" fill="none" stroke="${LINE}" stroke-width="1.2"/><circle cx="61.2" cy="75.2" r="1.5" fill="${SKIN[1]}" stroke="${LINE}" stroke-width=".9"/>`);
  }
  if (extra === 'cicatriz') p.push(`<path d="M 74.5 61.5 L 79.5 70.5" stroke="${LINE}" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>`);
  p.push('</g></g>');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${p.join('')}</svg>`;
}

export function avatarDataUri(seed: string, accent?: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSvg(seed, accent));
}
