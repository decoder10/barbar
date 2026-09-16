/**
 * One definition of "recipe is not filled in" for both roles and the server card pages.
 * A menu item explains what is poured through its own ingredients, a set of tinctures,
 * admin-managed cost lines, or an explicit "sold without ingredients" mark.
 */
export function recipeMissing(item: {
  ingredients: unknown[];
  noIngredients?: boolean;
  components?: unknown[];
  /** Number of admin-managed cost lines: `extraCosts` for the owner, `managedIngredientIds` for a worker. */
  managed?: number;
}) {
  return !item.ingredients.length && !item.noIngredients && !item.components?.length && !item.managed;
}
