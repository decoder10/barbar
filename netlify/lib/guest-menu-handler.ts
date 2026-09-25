import { guestMenu } from '../../src/barbar/domain/guest-menu';
import { json } from './barbar-auth';
import type { Repository } from './barbar-repository';

/**
 * Guests see a price change within a couple of minutes: the browser revalidates quickly and Netlify's CDN
 * answers at once, refreshing in the background. Shared by `/api/menu` and the rendered `/menu` page.
 */
export const guestCdnCache = 'public, s-maxage=60, stale-while-revalidate=60, durable';

/**
 * The public menu from the live catalog and its version. Stock balances only decide whether each price is
 * available: quantities and costs are never serialized. `menu()` is undefined while the catalog is empty.
 */
export async function readGuestMenu(repository: Repository) {
  if (!repository.readCatalog) return undefined;
  const snapshot = await repository.readCatalog();
  const stock = repository.readStock ? await repository.readStock() : undefined;
  // Every sale changes the ledger revision, so availability is part of the version.
  // A built read model has a row per product; an empty one means stock is not known yet, not sold out.
  const known = stock?.stock?.length ? stock : undefined;
  return {
    version: `${snapshot.catalogRevision}${known ? `-${known.revision}` : ''}`,
    menu: () => {
      if (!snapshot.data) return undefined;
      const balances = known && new Map(known.stock!.map((b) => [b.alcoholId, b.ml]));
      return guestMenu(snapshot.data, snapshot.catalogRevision, balances);
    },
  };
}

/** Public, unauthenticated menu. Built from the live catalog; only the guest allowlist leaves the server. */
export async function handleGuestMenu(request: Request, repository: Repository) {
  if (!['GET', 'HEAD'].includes(request.method))
    return json({ error: 'Метод не поддерживается.' }, 405, { Allow: 'GET, HEAD' });
  const current = await readGuestMenu(repository);
  if (!current) return json({ error: 'Меню временно недоступно.' }, 503);
  // v4: items may carry the owner's own photo.
  const etag = `"guest-menu-v4-${current.version}"`;
  const headers = {
    // Short browser cache; price edits change catalogRevision and appear within a minute.
    'Cache-Control': 'public, max-age=30, must-revalidate',
    'Netlify-CDN-Cache-Control': guestCdnCache,
    ETag: etag,
    'X-Robots-Tag': 'noindex',
  };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  const menu = current.menu();
  if (!menu) return json({ error: 'Меню временно недоступно.' }, 503);
  return json(menu, 200, headers);
}
