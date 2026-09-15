import { round } from './model';
import type { Ingredient } from './types';

export interface RecipeShortage {
  id: string;
  name: string;
  required: number;
  missing: number;
}

/** Stock items that cannot cover one portion of a saved recipe, with the recipes affected. */
export function recipeShortages(
  recipes: { id: string; name: string; ingredients: Ingredient[] }[],
  remaining: (id: string) => number,
) {
  const shortages = new Map<string, RecipeShortage[]>();
  for (const recipe of recipes)
    for (const ingredient of recipe.ingredients) {
      const missing = round(ingredient.ml - remaining(ingredient.alcoholId));
      if (missing > 0)
        shortages.set(ingredient.alcoholId, [
          ...(shortages.get(ingredient.alcoholId) || []),
          { id: recipe.id, name: recipe.name, required: ingredient.ml, missing },
        ]);
    }
  return shortages;
}
