import {
  uploadedPhotoFile,
  uploadedPhotoPattern,
  uploadedPhotoWidths,
} from '../../../src/barbar/domain/catalog/uploaded-photos';
import { json } from '../barbar-auth';
import type { PhotoFiles } from './store';

const fileName = /^\/api\/photos\/(u-[0-9a-f]{12}-\d{1,5}x\d{1,5})-(\d{1,5})\.webp$/;

/** `GET /api/photos/<name>-<width>.webp`: public and immutable, because the name holds the content hash. */
export async function handlePhotoFile(request: Request, files: PhotoFiles) {
  if (!['GET', 'HEAD'].includes(request.method))
    return json({ error: 'Метод не поддерживается.' }, 405, { Allow: 'GET, HEAD' });
  const match = fileName.exec(new URL(request.url).pathname);
  const width = Number(match?.[2]);
  const size = match && uploadedPhotoPattern.exec(match[1]);
  if (!match || !size || !uploadedPhotoWidths(Number(size[1])).includes(width))
    return json({ error: 'Фото не найдено.' }, 404);
  const bytes = await files.get(uploadedPhotoFile(match[1], width));
  if (!bytes) return json({ error: 'Фото не найдено.' }, 404);
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes).buffer, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable, durable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
