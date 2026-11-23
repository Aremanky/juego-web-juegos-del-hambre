/**
 * Hoja de contacto de retratos generados, a tamaño grande y a tamaño de tablero.
 * Uso: npx tsx tools/avatar-sheet.ts <salida.png> [semilla-base]
 */
import sharp from 'sharp';
import { avatarSvg, CAMEO_HAIR_STYLES } from '../packages/shared/src/game/avatar.js';
import { Rng } from '../packages/shared/src/util/rng.js';
import { PLAYER_COLORS } from '../packages/shared/src/game/cosmetics.js';

const out = process.argv[2] ?? '/tmp/avatar-sheet.png';
const base = process.argv[3] ?? 'hoja';
const N = 18;
const COLS = 6;
const BIG = 128;
const SMALL = 38;
const PAD = 14;
const BG = { r: 16, g: 23, b: 25, alpha: 1 };

const tiles: sharp.OverlayOptions[] = [];
const rowsBig = Math.ceil(N / COLS);
const smallTop = PAD + rowsBig * (BIG + PAD) + PAD;
const width = PAD + COLS * (BIG + PAD);
const height = smallTop + 2 * (SMALL + PAD) + PAD;

// Semillas que cubren todos los peinados primero, después cualquiera.
const seeds: string[] = [];
for (const style of CAMEO_HAIR_STYLES) {
  for (let k = 0; k < 500; k++) {
    const s = `${base}-${style}-${k}`;
    if (new Rng('camafeo:' + s).pick(CAMEO_HAIR_STYLES) === style) { seeds.push(s); break; }
  }
}
for (let k = 0; seeds.length < N; k++) seeds.push(`${base}-libre-${k}`);

for (let i = 0; i < N; i++) {
  const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
  const svg = Buffer.from(avatarSvg(seeds[i], color));
  const big = await sharp(svg, { density: 72 * 2 }).resize(BIG, BIG).png().toBuffer();
  const small = await sharp(svg, { density: 72 }).resize(SMALL, SMALL).png().toBuffer();
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  tiles.push({ input: big, left: PAD + col * (BIG + PAD), top: PAD + row * (BIG + PAD) });
  const sCol = i % 9;
  const sRow = Math.floor(i / 9);
  tiles.push({ input: small, left: PAD + sCol * (SMALL + 18), top: smallTop + sRow * (SMALL + PAD) });
}

await sharp({ create: { width, height, channels: 4, background: BG } }).composite(tiles).png().toFile(out);
console.log(out, width + 'x' + height);
