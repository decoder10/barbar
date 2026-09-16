import { publicCatalog, publicCatalogPart } from '../barbar-sync';
import { json, type Role } from '../barbar-auth';
import type { Repository } from '../barbar-repository';

export const catalogRoute = (pathname: string) =>
  pathname.match(/^\/api\/barbar\/catalog(?:\/(alcohol|cocktails))?$/);

/** The reference catalog, one resource or both, conditional on the client's known revision. */
export async function handleCatalog(
  request: Request,
  repository: Repository,
  role: Role,
  resource: 'alcohol' | 'cocktails' | undefined,
) {
  if (request.method !== 'GET' || !repository.readCatalog)
    return json({ error: 'Метод не поддерживается.' }, 405);
  const known =
    request.headers.get('X-Barbar-Role') === role
      ? request.headers.get('X-Barbar-Catalog-Revision') || undefined
      : undefined;
  const snapshot = await repository.readCatalog(known, resource);
  return json(resource ? publicCatalogPart(snapshot, role, resource) : publicCatalog(snapshot, role));
}
