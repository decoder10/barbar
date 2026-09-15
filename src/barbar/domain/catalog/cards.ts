import { barConfig } from '../../config';
import { isGlassServing } from '../serving';
import type { BarData, Cocktail } from '../types';
import { compareCatalog, type CatalogSort } from './sort';
import { expandRecipe } from './sets';

export type CardResource = 'cocktails' | 'alcohol';
export interface CardQuery {
  resource: CardResource;
  /** `all`, a menu category or `alcohol` for poured drinks. */
  category: string;
  search: string;
  sort: CatalogSort;
  offset: number;
  limit: number;
}
export interface CardPage {
  resource: CardResource;
  /** Ordered IDs of this page; card content comes from the full reference catalog. */
  ids: string[];
  /** Portions or ml in stock; null means not limited by stock. */
  available: Record<string, number | null>;
  total: number;
  nextOffset: number | null;
}
export const cardSorts: CatalogSort[] = [
  'original',
  'popular',
  'available',
  'missing',
  'recipe',
  'name',
  'name-desc',
  'price',
  'price-desc',
];

const portions = (c: Cocktail, stock: Map<string, number>, cocktails: Cocktail[]) => {
  const recipe = expandRecipe(c, cocktails);
  return recipe.length
    ? Math.max(0, Math.floor(Math.min(...recipe.map((i) => ((stock.get(i.alcoholId) || 0) + 1e-7) / i.ml))))
    : c.extraCosts?.length || c.noIngredients
      ? null
      : 0;
};
const ready = (c: Cocktail) =>
  c.price > 0 &&
  (!isGlassServing(c) || !!c.stockAlcoholId) &&
  (c.ingredients.length > 0 || !!c.extraCosts?.length || !!c.noIngredients || !!c.components?.length);

/** Search, filter and sort the whole catalog, then return one page. Used by the server and legacy clients. */
export function cardPage(
  data: Pick<BarData, 'alcohol' | 'cocktails'>,
  stock: Map<string, number>,
  query: CardQuery,
  popularity = new Map<string, number>(),
): CardPage {
  const search = query.search.trim().toLocaleLowerCase();
  const rows =
    query.resource === 'cocktails'
      ? query.category === 'alcohol'
        ? []
        : data.cocktails
            .filter(
              (c) =>
                (query.category === 'all' || (c.category || 'cocktail') === query.category) &&
                c.name.toLocaleLowerCase().includes(search),
            )
            .map((c) => ({
              id: c.id,
              name: c.name,
              price: c.price,
              stock: portions(c, stock, data.cocktails),
              ready: ready(c),
              recipeMissing: !c.ingredients.length && !c.noIngredients && !c.components?.length,
              popularity: popularity.get(`cocktail:${c.id}`),
            }))
      : ['all', 'alcohol'].includes(query.category)
        ? data.alcohol
            .filter((a) => a.category === 'alcohol' && a.name.toLocaleLowerCase().includes(search))
            .map((a) => ({
              id: a.id,
              name: a.name,
              price: a.pricePerLiter,
              stock: stock.get(a.id) || 0,
              ready: a.pricePerLiter > 0,
              recipeMissing: false,
              popularity: popularity.get(`alcohol:${a.id}`),
            }))
        : [];
  const sortable = (row: (typeof rows)[number]) => ({
    ...row,
    // Items that cannot be sold yet sort with unavailable ones.
    available: row.ready ? (row.stock ?? Infinity) : 0,
  });
  const sorted =
    query.sort === 'original'
      ? rows
      : [...rows].sort((a, b) => compareCatalog(sortable(a), sortable(b), query.sort));
  const page = sorted.slice(query.offset, query.offset + query.limit);
  return {
    resource: query.resource,
    ids: page.map((row) => row.id),
    available: Object.fromEntries(page.map((row) => [row.id, row.stock])),
    total: sorted.length,
    nextOffset: query.offset + page.length < sorted.length ? query.offset + page.length : null,
  };
}

export function parseCardQuery(params: URLSearchParams): CardQuery & { date?: string } {
  const resource = params.get('resource');
  const sort = (params.get('sort') || 'original') as CatalogSort;
  const offset = Number(params.get('offset') || 0);
  const limit = Number(params.get('limit') || barConfig.presets.cardPageSize);
  const search = params.get('q') || '';
  const category = params.get('category') || 'all';
  const date = params.get('date') || undefined;
  if (
    (resource !== 'cocktails' && resource !== 'alcohol') ||
    !cardSorts.includes(sort) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 200 ||
    search.length > 80 ||
    !/^[a-z]{2,12}$/.test(category) ||
    (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date))
  )
    throw new Error('Некорректный запрос каталога.');
  return { resource, sort, offset, limit, search, category, ...(date ? { date } : {}) };
}

/** The same page for a worker's allowlisted products when the server read model is not in use. */
export function staffCardPage(
  products: {
    id: string;
    kind: 'cocktail' | 'alcohol';
    name: string;
    category: string;
    price?: number;
    available: number | null;
    ready: boolean;
  }[],
  query: CardQuery,
  popularity = new Map<string, number>(),
): CardPage {
  const search = query.search.trim().toLocaleLowerCase();
  const kind = query.resource === 'cocktails' ? 'cocktail' : 'alcohol';
  const rows = products
    .filter(
      (p) =>
        p.kind === kind &&
        (query.category === 'all' || p.category === query.category) &&
        p.name.toLocaleLowerCase().includes(search),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      stock: p.available,
      available: p.ready ? (p.available ?? Infinity) : 0,
      popularity: popularity.get(`${p.kind}:${p.id}`),
    }));
  const sorted =
    query.sort === 'original' ? rows : [...rows].sort((a, b) => compareCatalog(a, b, query.sort));
  const page = sorted.slice(query.offset, query.offset + query.limit);
  return {
    resource: query.resource,
    ids: page.map((row) => row.id),
    available: Object.fromEntries(page.map((row) => [row.id, row.stock])),
    total: sorted.length,
    nextOffset: query.offset + page.length < sorted.length ? query.offset + page.length : null,
  };
}
