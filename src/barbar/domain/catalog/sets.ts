import { barConfig } from '../../config';
import type { Cocktail, Ingredient, PortionExpense } from '../types';

type RecipeSource = Pick<Cocktail, 'id' | 'ingredients'> & {
  extraCosts?: PortionExpense[];
  category?: string;
};

/** One portion of a menu item: its own recipe, or for a set the tincture recipes multiplied by shots. */
export function expandRecipe(
  item: Pick<Cocktail, 'ingredients'> & { components?: Cocktail['components'] },
  cocktails: RecipeSource[],
): Ingredient[] {
  if (!item.components?.length) return item.ingredients;
  const byId = new Map(cocktails.map((c) => [c.id, c]));
  const total = new Map<string, number>();
  for (const part of item.components)
    for (const i of byId.get(part.cocktailId)?.ingredients || [])
      total.set(i.alcoholId, (total.get(i.alcoholId) || 0) + i.ml * part.quantity);
  return [...total].map(([alcoholId, ml]) => ({ alcoholId, ml: Math.round(ml * 1e8) / 1e8 }));
}

/** Per-portion product costs of the tinctures in a set, multiplied by shots. */
export function expandExtraCosts(
  item: Pick<Cocktail, 'extraCosts'> & { components?: Cocktail['components'] },
  cocktails: RecipeSource[],
): PortionExpense[] {
  if (!item.components?.length) return item.extraCosts || [];
  const byId = new Map(cocktails.map((c) => [c.id, c]));
  const total = new Map<string, number>();
  for (const part of item.components)
    for (const e of byId.get(part.cocktailId)?.extraCosts || [])
      total.set(e.alcoholId, (total.get(e.alcoholId) || 0) + e.cost * part.quantity);
  return [...total].map(([alcoholId, cost]) => ({ alcoholId, cost: Math.round(cost * 100) / 100 }));
}

export const shotsInSet = (item: { components?: Cocktail['components'] }) =>
  (item.components || []).reduce((sum, part) => sum + part.quantity, 0);

/** Sets reference tinctures only, whole shots, no duplicates; a set with components has no own recipe. */
export function componentsValid(item: Cocktail, cocktails: Pick<Cocktail, 'id' | 'category'>[]) {
  const parts = item.components;
  if (parts === undefined) return true;
  return (
    Array.isArray(parts) &&
    parts.length <= barConfig.menu.sets.maxComponents &&
    (parts.length === 0 ||
      (item.category === barConfig.menu.sets.category &&
        !item.ingredients?.length &&
        !item.extraCosts?.length &&
        !item.noIngredients &&
        !item.stockAlcoholId)) &&
    new Set(parts.map((p) => p?.cocktailId)).size === parts.length &&
    parts.every(
      (p) =>
        p &&
        typeof p.cocktailId === 'string' &&
        Number.isInteger(p.quantity) &&
        p.quantity >= 1 &&
        p.quantity <= barConfig.menu.sets.maxShots &&
        cocktails.some((c) => c.id === p.cocktailId && c.category === barConfig.menu.sets.componentCategory),
    )
  );
}
