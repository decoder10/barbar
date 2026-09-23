import { guestMenu } from '../../src/barbar/domain/guest-menu';
import { json } from './barbar-auth';
import type { Repository } from './barbar-repository';

/**
 * Public, unauthenticated menu. Built from the live catalog; only the guest allowlist leaves the server.
 * Stock balances only decide whether each price is available: quantities and costs are never serialized.
 */
export async function handleGuestMenu(request: Request, repository: Repository) {
  if (!['GET', 'HEAD'].includes(request.method))
    return json({ error: 'Метод не поддерживается.' }, 405, { Allow: 'GET, HEAD' });
  if (!repository.readCatalog) return json({ error: 'Меню временно недоступно.' }, 503);
  const snapshot = await repository.readCatalog();
  const stock = repository.readStock ? await repository.readStock() : undefined;
  // Every sale changes the ledger revision, so availability is part of the validator.
  // A built read model has a row per product; an empty one means stock is not known yet, not sold out.
  const known = stock?.stock?.length ? stock : undefined;
  const etag = `"guest-menu-v3-${snapshot.catalogRevision}${known ? `-${known.revision}` : ''}"`;
  const headers = {
    // Short browser cache; price edits change catalogRevision and appear within a minute.
    'Cache-Control': 'public, max-age=30, must-revalidate',
    // Netlify's CDN answers guests at once and refreshes in the background: prices and availability
    // are at most a couple of minutes old.
    'Netlify-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60, durable',
    ETag: etag,
    'X-Robots-Tag': 'noindex',
  };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  if (!snapshot.data) return json({ error: 'Меню временно недоступно.' }, 503);
  const balances = known && new Map(known.stock!.map((b) => [b.alcoholId, b.ml]));
  return json(guestMenu(snapshot.data, snapshot.catalogRevision, balances), 200, headers);
}
