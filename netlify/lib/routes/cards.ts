import { cardPage, parseCardQueries } from '../../../src/barbar/domain/catalog/cards';
import { barConfig } from '../../../src/barbar/config';
import { businessDaysBefore } from '../../../src/barbar/domain/business-day';
import { stockTotals } from '../../../src/barbar/domain/model';
import { json, type Role } from '../barbar-auth';
import type { Repository } from '../barbar-repository';
import { HttpError } from '../http';

/** Card pages: IDs and stock in the requested order over the whole catalog, one or both resources. */
export async function handleCards(request: Request, repository: Repository, role: Role) {
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  const params = new URL(request.url).searchParams;
  // One screen asks for cocktails and poured alcohol at once: `resources` answers both in a
  // single request, so stock and the popularity window are read once instead of twice.
  const many = params.has('resources');
  let queries: ReturnType<typeof parseCardQueries>;
  try {
    queries = parseCardQueries(params);
  } catch (error) {
    throw new HttpError((error as Error).message, 400);
  }
  const catalogs = await Promise.all(
    queries.map((query) =>
      repository.readCatalog
        ? repository.readCatalog(undefined, query.resource)
        : repository.read().then((s) => ({ catalogRevision: '', data: s.data })),
    ),
  );
  const stockSnapshot = repository.readStock ? await repository.readStock() : undefined;
  const stock = stockSnapshot?.stock
    ? new Map(stockSnapshot.stock.map((b) => [b.alcoholId, b.ml]))
    : stockTotals((await repository.read()).data);
  // «Most sold first» counts a window of business days ending on the requested day.
  const first = queries[0];
  const popularity =
    first.sort === 'popular' && first.date && repository.salesPopularity
      ? await repository.salesPopularity(
          businessDaysBefore(first.date, barConfig.presets.popularityDays - 1),
          first.date,
        )
      : undefined;
  const pages = queries.map((query, index) => cardPage(catalogs[index].data!, stock, query, popularity));
  const common = {
    catalogRevision: catalogs[0].catalogRevision,
    revision: stockSnapshot?.revision || null,
    role,
  };
  return json(many ? { pages, ...common } : { ...pages[0], ...common });
}
