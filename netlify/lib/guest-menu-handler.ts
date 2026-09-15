import { guestMenu } from '../../src/barbar/domain/guest-menu';
import { json } from './barbar-auth';
import type { Repository } from './barbar-repository';

/** Public, unauthenticated menu. Built from the live catalog; only the guest allowlist leaves the server. */
export async function handleGuestMenu(request: Request, repository: Repository) {
  if (!['GET', 'HEAD'].includes(request.method))
    return json({ error: 'Метод не поддерживается.' }, 405, { Allow: 'GET, HEAD' });
  if (!repository.readCatalog) return json({ error: 'Меню временно недоступно.' }, 503);
  const snapshot = await repository.readCatalog();
  const etag = `"guest-menu-v1-${snapshot.catalogRevision}"`;
  const headers = {
    // Short browser cache; price edits change catalogRevision and appear within a minute.
    'Cache-Control': 'public, max-age=30, must-revalidate',
    ETag: etag,
    'X-Robots-Tag': 'noindex',
  };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  if (!snapshot.data) return json({ error: 'Меню временно недоступно.' }, 503);
  return json(guestMenu(snapshot.data, snapshot.catalogRevision), 200, headers);
}
