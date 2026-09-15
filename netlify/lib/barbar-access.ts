import { goodsSaleUnit, stockTotals } from '../../src/barbar/domain/model';
import { isGlassServing } from '../../src/barbar/domain/serving';
import { expandRecipe } from '../../src/barbar/domain/catalog/sets';
import type { BarData, Role, StaffData } from '../../src/barbar/domain/types';

export function staffData(data: BarData): StaffData {
  const quantities = stockTotals(data);
  const remaining = (id: string) => quantities.get(id) || 0;
  const alcohol = new Map(data.alcohol.map((a) => [a.id, a]));
  return {
    ...(data.opening ? { paged: true } : {}),
    recipes: data.cocktails.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category || 'cocktail',
      image: c.image,
      notes: c.notes || '',
      ingredients: c.ingredients.map((i) => ({ alcoholId: i.alcoholId, ml: i.ml })),
      editable: !c.stockAlcoholId,
      ...(c.noIngredients ? { noIngredients: true } : {}),
      ...(c.components?.length
        ? { components: c.components.map(({ cocktailId, quantity }) => ({ cocktailId, quantity })) }
        : {}),
      managedIngredientIds: (c.extraCosts || []).map((i) => i.alcoholId),
    })),
    ingredients: data.alcohol.map(
      ({ id, name, unit, category, bottleSizeMl, glassSizeMl, color, menuCategory, group }) => ({
        id,
        name,
        unit: unit || 'ml',
        category,
        color,
        available: remaining(id),
        ...(bottleSizeMl ? { bottleSizeMl } : {}),
        ...(glassSizeMl ? { glassSizeMl } : {}),
        ...(menuCategory ? { menuCategory } : {}),
        ...(group ? { group } : {}),
      }),
    ),
    products: [
      ...data.cocktails.map((c) => ({
        id: c.id,
        kind: 'cocktail' as const,
        price: c.price,
        ...(c.stockAlcoholId ? { stockAlcoholId: c.stockAlcoholId } : {}),
        name: c.name,
        category: c.category || ('cocktail' as const),
        image: c.image,
        ...(c.serving ? { serving: c.serving } : {}),
        ...(isGlassServing(c)
          ? { unit: 'glass' as const }
          : c.stockAlcoholId
            ? (() => {
                const unit = c.serving || goodsSaleUnit(alcohol.get(c.stockAlcoholId));
                return unit ? { unit } : {};
              })()
            : {}),
        ...(c.stockAlcoholId && c.serving === 'glass'
          ? {
              glassSizeMl: alcohol.get(c.stockAlcoholId)?.glassSizeMl,
              bottleSizeMl: alcohol.get(c.stockAlcoholId)?.bottleSizeMl,
              availableMl: remaining(c.stockAlcoholId) * (alcohol.get(c.stockAlcoholId)?.bottleSizeMl || 0),
            }
          : {}),
        available: expandRecipe(c, data.cocktails).length
          ? Math.max(
              0,
              Math.floor(
                Math.min(
                  ...expandRecipe(c, data.cocktails).map((i) => (remaining(i.alcoholId) + 1e-7) / i.ml),
                ),
              ),
            )
          : null,
        ready:
          (!isGlassServing(c) || !!c.stockAlcoholId) &&
          c.price > 0 &&
          (c.ingredients.length > 0 || !!c.extraCosts?.length || !!c.noIngredients || !!c.components?.length),
      })),
      ...data.alcohol
        .filter((a) => a.category === 'alcohol')
        .map((a) => ({
          id: a.id,
          kind: 'alcohol' as const,
          price: a.pricePerLiter / 1000,
          name: a.name,
          category: 'alcohol' as const,
          available: remaining(a.id),
          ready: a.pricePerLiter > 0,
        })),
    ],
    sales: data.sales.map(
      ({
        id,
        date,
        createdAt,
        kind,
        productId,
        name,
        quantity,
        voided,
        unit,
        category,
        servingMl,
        revenue,
      }) => ({
        id,
        date,
        createdAt,
        kind,
        productId,
        name,
        quantity,
        revenue,
        voided,
        ...(unit ? { unit } : {}),
        ...(category ? { category } : {}),
        ...(servingMl ? { servingMl } : {}),
      }),
    ),
    ...(data.archived?.before || data.historyBefore
      ? { archivedBefore: data.archived?.before || data.historyBefore }
      : {}),
  };
}
export const publicSnapshot = (data: BarData, revision: string | null | undefined, role: Role) =>
  role === 'admin'
    ? { data: { ...data, operations: [] }, revision, role }
    : { staffData: staffData(data), revision, role };
