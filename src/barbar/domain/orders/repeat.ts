import { round } from '../money';
import { cocktailPortions, cocktailReady } from '../catalog/cards';
import type { BarData, Sale, StaffProduct } from '../types';

/** What the catalog says about an item right now: its price, how much is left and whether it is on sale. */
export interface CatalogEntry {
  /** AMD per portion, or per ml for poured alcohol. */
  price: number;
  /** Portions (ml for poured alcohol) in stock; null when stock does not limit it. */
  available: number | null;
  ready: boolean;
}
export type CatalogLookup = (
  kind: Sale['kind'],
  productId: string,
  servingMl?: number,
) => CatalogEntry | undefined;

/** A line of a past receipt: a sale, a worker's sale or a receipt group. */
export interface PastLine {
  kind: Sale['kind'];
  productId: string;
  name: string;
  quantity: number;
  servingMl?: number;
}
/** A paid receipt offered for repeating, with its active lines. */
export interface RecentOrder {
  id: string;
  tableId?: string;
  businessDay: string;
  openedAt: string;
  closedAt?: string;
  total?: number;
  lines: PastLine[];
}
export type RepeatStatus = 'ok' | 'reduced' | 'unavailable' | 'removed';
export interface RepeatLine {
  key: string;
  kind: Sale['kind'];
  productId: string;
  servingMl?: number;
  name: string;
  /** What the guest had before. */
  wanted: number;
  /** What would be added now; zero for unavailable and removed lines. */
  quantity: number;
  unitPrice: number;
  status: RepeatStatus;
}

const lineKey = (line: Pick<PastLine, 'kind' | 'productId' | 'servingMl'>) =>
  `${line.kind}:${line.productId}:${line.servingMl || ''}`;
const whole = (kind: Sale['kind'], n: number) => (kind === 'cocktail' ? Math.floor(n + 1e-7) : n);

/**
 * The previous set with today's prices and stock. Lines are grouped by item and serving; an item that
 * is off sale or out of stock is marked and excluded, a partly available one is reduced to what is left.
 */
export function repeatDraft(past: PastLine[], lookup: CatalogLookup): RepeatLine[] {
  const groups = new Map<string, PastLine>();
  for (const line of past) {
    const key = lineKey(line);
    const known = groups.get(key);
    groups.set(key, known ? { ...known, quantity: known.quantity + line.quantity } : { ...line });
  }
  return [...groups].map(([key, line]) => {
    const base = {
      key,
      kind: line.kind,
      productId: line.productId,
      ...(line.servingMl ? { servingMl: line.servingMl } : {}),
      name: line.name,
      wanted: line.quantity,
    };
    const entry = lookup(line.kind, line.productId, line.servingMl);
    if (!entry || !entry.ready || entry.price <= 0)
      return { ...base, quantity: 0, unitPrice: entry?.price || 0, status: 'removed' as const };
    const left = entry.available === null ? Infinity : whole(line.kind, entry.available);
    if (left <= 0) return { ...base, quantity: 0, unitPrice: entry.price, status: 'unavailable' as const };
    const quantity = Math.min(line.quantity, left);
    return {
      ...base,
      quantity,
      unitPrice: entry.price,
      status: quantity < line.quantity ? ('reduced' as const) : ('ok' as const),
    };
  });
}
/** The value of a line at today's price: the same rounding as the sale that will be written. */
export const draftLineTotal = (line: Pick<RepeatLine, 'quantity' | 'unitPrice'>) =>
  round(line.unitPrice * line.quantity);
export const draftTotal = (lines: RepeatLine[]) =>
  round(lines.reduce((sum, line) => sum + draftLineTotal(line), 0));
/** The lines that will be sent, without the ones set to zero. */
export const draftCommandLines = (lines: RepeatLine[]) =>
  lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      kind: line.kind,
      productId: line.productId,
      quantity: line.quantity,
      ...(line.servingMl ? { servingMl: line.servingMl } : {}),
    }));

/** The owner's lookup over the ledger's catalog and current stock. */
export function ownerCatalog(
  data: Pick<BarData, 'alcohol' | 'cocktails'>,
  stock: Map<string, number>,
): CatalogLookup {
  const cocktails = new Map(data.cocktails.map((c) => [c.id, c]));
  const alcohol = new Map(data.alcohol.map((a) => [a.id, a]));
  return (kind, productId, servingMl) => {
    if (kind === 'alcohol') {
      const a = alcohol.get(productId);
      return a && a.category === 'alcohol'
        ? { price: a.pricePerLiter / 1000, available: stock.get(a.id) || 0, ready: a.pricePerLiter > 0 }
        : undefined;
    }
    const c = cocktails.get(productId);
    if (!c) return undefined;
    const bottle = c.serving === 'glass' && c.stockAlcoholId ? alcohol.get(c.stockAlcoholId) : undefined;
    if (bottle?.glassSizeMl && bottle.bottleSizeMl) {
      const size = servingMl || bottle.glassSizeMl;
      return {
        price: (c.price * size) / bottle.glassSizeMl,
        available: ((stock.get(bottle.id) || 0) * bottle.bottleSizeMl) / size,
        ready: cocktailReady(c),
      };
    }
    return { price: c.price, available: cocktailPortions(c, stock, data.cocktails), ready: cocktailReady(c) };
  };
}
/** The worker's lookup over the allowlisted products. */
export function staffCatalog(products: StaffProduct[]): CatalogLookup {
  const byKey = new Map(products.map((p) => [`${p.kind}:${p.id}`, p]));
  return (kind, productId, servingMl) => {
    const p = byKey.get(`${kind}:${productId}`);
    if (!p) return undefined;
    const price = p.price || 0;
    if (p.unit === 'glass' && p.glassSizeMl) {
      const size = servingMl || p.glassSizeMl;
      return {
        price: (price * size) / p.glassSizeMl,
        available: p.availableMl === undefined ? null : p.availableMl / size,
        ready: p.ready,
      };
    }
    return { price, available: p.available, ready: p.ready };
  };
}
