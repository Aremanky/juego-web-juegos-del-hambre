import { avatarDataUri, photoUrl, type Portrait } from '@ceniza/shared';

export function portraitSrc(p: Portrait | null | undefined, color: string, size = 64): string {
  if (!p) return avatarDataUri('anonimo', color);
  if (p.kind === 'photo') return photoUrl(p.photoId, size > 120 ? 'avatar' : 'marker', p.v);
  return avatarDataUri(p.seed, color);
}

export function photoRefSrc(ref: { id: string; v: number } | null | undefined, fallbackSeed: string, size = 64): string {
  if (!ref) return avatarDataUri(fallbackSeed, '#c9a24b');
  return photoUrl(ref.id, size > 120 ? 'avatar' : 'marker', ref.v);
}

/** Normaliza una foto en el navegador: aplica la orientación EXIF, reduce a ≤2560 px y la pasa a JPEG.
 *  También convierte HEIC si el navegador sabe decodificarlo (Safari). */
export async function normalizeImageFile(file: File): Promise<{ blob: Blob; url: string; width: number; height: number }> {
  if (file.size > 40 * 1024 * 1024) throw new Error('La imagen es demasiado grande (máximo 40 MB antes de optimizar).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Tu navegador no puede abrir esta imagen. Prueba con JPG o PNG.');
  }
  const max = 2560;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen'))), 'image/jpeg', 0.92));
  return { blob, url: URL.createObjectURL(blob), width, height };
}
