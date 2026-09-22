import type { BarData, Role, Command } from '../../src/barbar/domain/types';
import type {
  CatalogResponse,
  StockResponse,
  CatalogResource,
  CatalogPartResponse,
} from '../../src/barbar/domain/sync/contracts';
import type { Repository, Snapshot, StockSnapshot } from './barbar-repository';
import { staffData, staffSale } from './barbar-access';
const blank = (): BarData => ({
  version: 1,
  alcohol: [],
  cocktails: [],
  purchases: [],
  sales: [],
  operations: [],
  opening: { mode: 'read-model', ingredients: [] },
});
export function publicStock(snapshot: StockSnapshot, role: Role): StockResponse {
  return {
    ...snapshot,
    role,
    ...(snapshot.stock
      ? { stock: snapshot.stock.map((b) => (role === 'admin' ? b : { alcoholId: b.alcoholId, ml: b.ml })) }
      : {}),
  };
}
export function publicCatalog(
  snapshot: Awaited<ReturnType<NonNullable<Repository['readCatalog']>>>,
  role: Role,
): CatalogResponse {
  return {
    catalogRevision: snapshot.catalogRevision,
    role,
    ...(snapshot.unchanged
      ? { unchanged: true }
      : role === 'admin'
        ? { data: snapshot.data }
        : { staffData: staffData({ ...blank(), ...snapshot.data }) }),
  };
}
export function publicCatalogPart(
  snapshot: Awaited<ReturnType<NonNullable<Repository['readCatalog']>>>,
  role: Role,
  resource: CatalogResource,
): CatalogPartResponse {
  const common = { role, resource, catalogRevision: snapshot.catalogRevision };
  if (snapshot.unchanged) return { ...common, unchanged: true };
  if (role === 'admin') return { ...common, [resource]: snapshot.data![resource] };
  const safe = staffData({ ...blank(), [resource]: snapshot.data![resource] });
  return resource === 'alcohol'
    ? { ...common, ingredients: safe.ingredients, products: safe.products }
    : { ...common, recipes: safe.recipes, products: safe.products };
}
export async function mutationResponse(
  snapshot: Snapshot,
  role: Role,
  command: Command,
  previous: string | null,
  repository: Repository,
): Promise<StockResponse> {
  const partial = snapshot.baseRevision === previous && !!snapshot.changedStock;
  const stock = (partial ? snapshot.changedStock : snapshot.data.opening?.ingredients) || [];
  const sale =
    command.type === 'sale' ? snapshot.sale || (await repository.readSale?.(command.id)) : undefined;
  return {
    ...publicStock(
      {
        revision: snapshot.revision!,
        catalogRevision: snapshot.catalogRevision || snapshot.revision!,
        stock,
        ...(snapshot.data.historyBefore ? { historyBefore: snapshot.data.historyBefore } : {}),
      },
      role,
    ),
    ...(partial ? { partial: true, baseRevision: previous! } : {}),
    ...(sale ? { sale: role === 'admin' ? sale : staffSale(sale) } : {}),
  };
}
