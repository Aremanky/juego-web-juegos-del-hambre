import sharp from 'sharp';
import type { Crop } from '@ceniza/shared';
import { AppError } from '../../lib/errors';

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'heif', 'tiff']);
const LIMIT_PIXELS = 60_000_000; // protección contra "bombas" de descompresión
const MAX_SIDE = 2048;

sharp.cache(false);
sharp.concurrency(2);

export interface NormalizedImage {
  data: Buffer;
  width: number;
  height: number;
}

/** Valida y normaliza: orientación EXIF aplicada, metadatos eliminados, ≤2048 px, WebP. */
export async function normalizeUpload(buf: Buffer): Promise<NormalizedImage> {
  let format: string | undefined;
  try {
    format = (await sharp(buf, { limitInputPixels: LIMIT_PIXELS }).metadata()).format;
  } catch {
    throw new AppError('unsupported_media', 'El archivo no es una imagen válida');
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new AppError('unsupported_media', 'Formato no admitido (usa JPG, PNG, WebP, AVIF o GIF)');
  }
  try {
    const { data, info } = await sharp(buf, { limitInputPixels: LIMIT_PIXELS })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new AppError('unsupported_media', 'No se pudo procesar la imagen. Si es HEIC, súbela desde el móvil como JPG.');
  }
}

export function defaultCrop(width: number, height: number): Crop {
  const s = Math.min(width, height);
  return { x: (width - s) / 2 / width, y: (height - s) / 2 / height, w: s / width, h: s / height };
}

/** Recorte cuadrado no destructivo a partir del original guardado. */
export async function renderCrops(original: Buffer | string, width: number, height: number, crop: Crop) {
  const left = Math.max(0, Math.min(width - 1, Math.round(crop.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(crop.y * height)));
  let side = Math.round(Math.min(crop.w * width, crop.h * height));
  side = Math.max(1, Math.min(side, width - left, height - top));
  const base = sharp(original).extract({ left, top, width: side, height: side });
  const [avatar, marker] = await Promise.all([
    base.clone().resize(512, 512).webp({ quality: 86 }).toBuffer(),
    base.clone().resize(160, 160).webp({ quality: 82 }).toBuffer(),
  ]);
  return { avatar, marker };
}

export async function renderThumb(original: Buffer | string): Promise<Buffer> {
  return sharp(original).resize({ width: 400, height: 400, fit: 'inside' }).webp({ quality: 78 }).toBuffer();
}
