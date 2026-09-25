import { createHash } from 'node:crypto';
import {
  uploadedPhotoFile,
  uploadedPhotoMaxWidth,
  uploadedPhotoMinWidth,
  uploadedPhotoWidths,
} from '../../../src/barbar/domain/catalog/uploaded-photos';
import { authenticated, json, sameOrigin } from '../barbar-auth';
import type { IdentityStore } from '../barbar-users';
import type { PhotoFiles } from './store';

/** Netlify accepts about 6 MB per request; the browser shrinks phone photos well below this first. */
export const maxUploadBytes = 4 * 1024 * 1024;
// A decoded image larger than this is refused before it can exhaust the function's memory.
const maxPixels = 40_000_000;

/** Only formats a browser also shows; anything else is refused before decoding. */
function imageType(bytes: Uint8Array) {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'avif';
  return undefined;
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxUploadBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxUploadBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * `POST /api/barbar/photos`: the owner's photo for a menu or stock item. It is re-encoded as WebP in
 * the card widths, which drops EXIF, GPS and any hidden payload; only the returned name is stored.
 */
export async function handlePhotoUpload(request: Request, users: IdentityStore, files: PhotoFiles) {
  const user = await authenticated(request, users);
  if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  if (user.role !== 'owner') return json({ error: 'Загружать фото может только владелец.' }, 403);
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается.' }, 405, { Allow: 'POST' });
  if (!sameOrigin(request)) return json({ error: 'Недопустимый источник запроса.' }, 403);
  const bytes = await readBody(request);
  if (!bytes) return json({ error: 'Фото слишком большое (максимум 4 МБ).' }, 413);
  if (!imageType(bytes)) return json({ error: 'Поддерживаются фото JPEG, PNG, WebP и AVIF.' }, 415);
  // A native module: loaded on upload only, so a missing binary is a clear answer, not a broken function.
  let sharp: typeof import('sharp').default;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    return json({ error: 'Обработка фото на сервере недоступна.' }, 503);
  }
  const options = { limitInputPixels: maxPixels, failOn: 'error' as const };
  let source: { width: number; height: number };
  try {
    const meta = await sharp(bytes, options).metadata();
    if (!meta.width || !meta.height) throw new Error('No size');
    // EXIF orientations 5–8 turn the picture a quarter: the shown width is the stored height.
    const turned = (meta.orientation || 1) >= 5;
    source = turned ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
    if (source.width * source.height > maxPixels) throw new Error('Too many pixels');
  } catch (error) {
    return /pixel/i.test(String(error))
      ? json({ error: 'Фото слишком большое по размеру в пикселях.' }, 413)
      : json({ error: 'Не удалось прочитать изображение.' }, 415);
  }
  if (source.width < uploadedPhotoMinWidth)
    return json(
      { error: `Фото слишком маленькое: нужно не меньше ${uploadedPhotoMinWidth} px по ширине.` },
      400,
    );
  const width = Math.min(uploadedPhotoMaxWidth, source.width);
  const height = Math.max(1, Math.round((source.height * width) / source.width));
  const name = `u-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}-${width}x${height}`;
  try {
    for (const size of uploadedPhotoWidths(width)) {
      const output = await sharp(bytes, options)
        .rotate()
        .resize({ width: size, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();
      await files.put(uploadedPhotoFile(name, size), new Uint8Array(output));
    }
  } catch {
    return json({ error: 'Не удалось обработать изображение.' }, 415);
  }
  return json({ photo: name }, 201);
}
