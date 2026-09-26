import { round } from './money';
import type { Alcohol, BarData } from './types';

// Stock alerts on the first screen need only current quantities. Keeping them apart from `model.ts`
// (which re-exports them) keeps the ledger's command validation out of the workspace entry chunk.

/** Bottles and pieces are priced per unit; millilitres and grams per 1,000. */
export const unitBasis = (unit?: Alcohol['unit']) => (unit === 'bottle' || unit === 'pcs' ? 1 : 1000);
export const priceBasis = (data: BarData, id: string) =>
  unitBasis(data.alcohol.find((a) => a.id === id)?.unit);
export const quantityRound = (data: BarData, id: string, n: number) =>
  priceBasis(data, id) === 1 ? (Math.abs(n) < 1e-7 ? 0 : Math.round(n * 1e8) / 1e8) : round(n);
export const stockResets = (data: BarData) => data.stockResets || [];
export const retiredStock = (data: BarData) => data.archived?.ingredients || [];

// Build one immutable view of current quantities instead of rescanning history per card.
export function stockTotals(data: BarData): Map<string, number> {
  const purchased = new Map<string, number>();
  const consumed = new Map<string, number>();
  const removed = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, quantity: number) =>
    map.set(id, (map.get(id) || 0) + quantity);
  for (const i of data.opening?.ingredients || []) add(purchased, i.alcoholId, i.ml);
  for (const p of data.purchases) add(purchased, p.alcoholId, p.ml);
  for (const m of data.stockMovements || []) for (const i of m.lines) add(purchased, i.alcoholId, i.ml);
  for (const s of data.sales) if (!s.voided) for (const i of s.ingredients) add(consumed, i.alcoholId, i.ml);
  for (const i of [...retiredStock(data), ...stockResets(data)]) add(removed, i.alcoholId, i.ml);
  return new Map(
    data.alcohol.map((a) => [
      a.id,
      quantityRound(
        data,
        a.id,
        (purchased.get(a.id) || 0) - (consumed.get(a.id) || 0) - (removed.get(a.id) || 0),
      ),
    ]),
  );
}
