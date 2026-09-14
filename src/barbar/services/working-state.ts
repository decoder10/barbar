import { initialData } from '../domain/model';
import type { BarData, Role, StaffData } from '../domain/types';
import type { CatalogResponse, StockResponse, StockEntry } from '../domain/sync/contracts';
import { api } from './api-client';
import { readCatalog } from './catalog-client';
export interface WorkingState {
  role: Role;
  revision: string;
  data: BarData;
  staffData: StaffData | null;
  catalog?: CatalogResponse;
  stock?: StockEntry[];
}
const headers = (previous: WorkingState | null, conditional: boolean) => ({
  'X-Barbar-Protocol': '2',
  ...(conditional && previous
    ? { 'X-Barbar-Revision': previous.revision, 'X-Barbar-Role': previous.role }
    : {}),
});
function hydrate(catalog: CatalogResponse, response: StockResponse, stock: StockEntry[]): WorkingState {
  const common = { role: response.role, revision: response.revision, catalog, stock };
  if (response.role === 'admin') {
    if (!catalog.data) throw new Error('Не удалось загрузить каталог. Повторите обновление.');
    return {
      ...common,
      staffData: null,
      data: {
        version: 1,
        ...catalog.data,
        purchases: [],
        sales: [],
        operations: [],
        opening: { mode: 'read-model', ingredients: stock.map((b) => ({ ...b, cost: b.cost ?? 0 })) },
        ...(response.historyBefore ? { historyBefore: response.historyBefore } : {}),
      },
    };
  }
  if (!catalog.staffData) throw new Error('Не удалось загрузить каталог. Повторите обновление.');
  const template = catalog.staffData;
  const quantities = new Map(stock.map((b) => [b.alcoholId, b.ml]));
  const recipes = new Map(template.recipes.map((r) => [r.id, r]));
  const ingredients = template.ingredients.map((i) => ({ ...i, available: quantities.get(i.id) || 0 }));
  const products = template.products.map((p) => {
    const recipe = recipes.get(p.id);
    const available =
      p.kind === 'alcohol'
        ? quantities.get(p.id) || 0
        : recipe?.ingredients.length
          ? Math.max(
              0,
              Math.floor(
                Math.min(
                  ...recipe.ingredients.map((i) => ((quantities.get(i.alcoholId) || 0) + 1e-7) / i.ml),
                ),
              ),
            )
          : null;
    return {
      ...p,
      available,
      ...(p.unit === 'glass' && p.stockAlcoholId
        ? { availableMl: (quantities.get(p.stockAlcoholId) || 0) * (p.bottleSizeMl || 0) }
        : {}),
    };
  });
  return {
    ...common,
    data: initialData(),
    staffData: {
      ...template,
      ingredients,
      products,
      paged: true,
      ...(response.historyBefore
        ? { archivedBefore: response.historyBefore }
        : { archivedBefore: undefined }),
    },
  };
}
/** A role/session-scoped in-memory catalog; no persisted identity or financial cache. */
export async function loadWorking(
  previous: WorkingState | null,
  supplied?: Awaited<ReturnType<typeof readWorking>>,
): Promise<WorkingState> {
  // Start independent reads together. A legacy server may not have /catalog;
  // its speculative failure must not prevent a compatible full snapshot loading.
  const stockRead = supplied ? undefined : readWorking(previous);
  const catalogRead =
    !previous && !supplied
      ? readCatalog().then(
          (value) => ({ value }),
          (error) => ({ error }),
        )
      : undefined;
  let response = supplied || (await stockRead!);
  // Keep old deployed tabs/legacy stores and migrations compatible with full snapshots.
  if (!response.catalogRevision) {
    if (response.unchanged && previous) return previous;
    return {
      role: response.role,
      revision: response.revision,
      data: response.role === 'admin' ? response.data : initialData(),
      staffData: response.role === 'barbar' ? response.staffData : null,
    };
  }
  let catalog = previous?.role === response.role ? previous.catalog : undefined;
  if (catalogRead) {
    const result = await catalogRead;
    if ('error' in result) throw result.error;
    catalog = result.value;
  }
  if (response.unchanged && previous && catalog?.catalogRevision === response.catalogRevision)
    return previous;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (
      response.partial &&
      (!previous?.stock ||
        previous.revision !== response.baseRevision ||
        catalog?.catalogRevision !== response.catalogRevision)
    ) {
      response = await readWorking(null);
    }
    if (!catalog || catalog.role !== response.role || catalog.catalogRevision !== response.catalogRevision) {
      catalog = await readCatalog();
    }
    if (
      catalog.role === response.role &&
      catalog.catalogRevision === response.catalogRevision &&
      response.stock
    ) {
      const byId = new Map((response.partial ? previous!.stock! : []).map((b) => [b.alcoholId, b]));
      for (const balance of response.stock) byId.set(balance.alcoholId, balance);
      return hydrate(catalog, response as StockResponse, [...byId.values()]);
    }
    // A catalog edit crossed the two snapshot reads. Never combine different versions.
    response = await readWorking(null);
  }
  throw new Error('Данные меняются на другом устройстве. Повторите обновление.');
}
export const readWorking = (previous: WorkingState | null) =>
  api('/api/barbar', { headers: headers(previous, true) });
