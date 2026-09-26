import { stockTotals } from '../stock-totals';
import type { BarData, StaffData, Ingredient } from '../types';
export interface StockLevel {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  threshold: number;
}
export interface StockAlert extends StockLevel {
  severity: 'empty' | 'low';
}
export function levels(
  items: { id: string; name: string; unit?: string; available: number }[],
  recipes: { ingredients: Ingredient[] }[],
): StockLevel[] {
  const portions = new Map<string, number>();
  for (const recipe of recipes)
    for (const i of recipe.ingredients)
      portions.set(i.alcoholId, Math.max(portions.get(i.alcoholId) || 0, i.ml * 3));
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    unit: item.unit || 'ml',
    quantity: item.available,
    threshold: item.unit === 'bottle' ? 3 : portions.get(item.id) || 0,
  }));
}
export function stockLevels(data: BarData): StockLevel[] {
  const quantities = stockTotals(data);
  return levels(
    data.alcohol.map((a) => ({ ...a, available: quantities.get(a.id) || 0 })),
    data.cocktails,
  );
}
export const staffLevels = (data: StaffData) => levels(data.ingredients, data.recipes);
export const severity = (item: StockLevel) =>
  item.quantity <= 1e-7 ? 'empty' : item.quantity <= item.threshold + 1e-7 ? 'low' : 'ok';
export function stockTransitions(before: StockLevel[], after: StockLevel[]): StockAlert[] {
  const previous = new Map(before.map((item) => [item.id, item]));
  return after.flatMap((item) => {
    const old = previous.get(item.id),
      next = severity(item);
    if (!old || item.quantity >= old.quantity - 1e-7 || next === 'ok' || severity(old) === next) return [];
    return [{ ...item, severity: next }];
  });
}
