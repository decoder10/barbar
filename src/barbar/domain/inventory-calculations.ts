import { round, stockTotals, unitBasis } from './model';
import type { BarData, Ingredient, PortionExpense } from './types';

/** Derived read model. Rebuild after a ledger revision; never used while applying a mutation. */
export function inventoryCalculations(data: BarData) {
  const quantities = stockTotals(data);
  const products = new Map(data.alcohol.map((a) => [a.id, a]));
  const basis = (id: string) => unitBasis(products.get(id)?.unit);
  const values = new Map<string, number>();
  const add = (id: string, amount: number) => values.set(id, (values.get(id) || 0) + amount);
  for (const i of data.opening?.ingredients || []) add(i.alcoholId, i.cost);
  for (const m of data.stockMovements || []) for (const i of m.lines) add(i.alcoholId, i.cost);
  for (const p of data.purchases) add(p.alcoholId, (p.ml * p.costPerLiter) / basis(p.alcoholId));
  for (const s of data.sales) if (!s.voided) for (const i of s.ingredients) add(i.alcoholId, -i.cost);
  for (const i of [...(data.archived?.ingredients || []), ...(data.stockResets || [])])
    add(i.alcoholId, -i.cost);
  const stock = (id: string) => quantities.get(id) || 0;
  const averageCost = (id: string) =>
    stock(id) > 0
      ? Math.max(0, ((values.get(id) || 0) / stock(id)) * basis(id))
      : products.get(id)?.costPerLiter || 0;
  const recipeCost = (recipe: Ingredient[], extras: PortionExpense[] = []) =>
    round(
      recipe.reduce((sum, i) => sum + (averageCost(i.alcoholId) * i.ml) / basis(i.alcoholId), 0) +
        extras.reduce((sum, i) => sum + i.cost, 0),
    );
  const recipeReady = (recipe: Ingredient[], extras: PortionExpense[] = []) =>
    recipe.length + extras.length > 0 &&
    recipe.every((i) => averageCost(i.alcoholId) > 0) &&
    extras.every((i) => i.cost > 0);
  const portions = (recipe: Ingredient[]) =>
    recipe.length
      ? Math.max(0, Math.floor(Math.min(...recipe.map((i) => (stock(i.alcoholId) + 1e-7) / i.ml))))
      : 0;
  return {
    quantities,
    stock,
    averageCost,
    recipeCost,
    recipeReady,
    portions,
    stockValue: (id: string) => values.get(id) || 0,
  };
}
