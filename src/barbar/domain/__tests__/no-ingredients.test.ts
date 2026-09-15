import { describe, expect, it } from 'vitest';
import { staffData } from '../../../../netlify/lib/barbar-access';
import { businessToday } from '../business-day';
import { applyCommand, initialData, stockTotals, validateData } from '../model';

const tea = () => {
  const data = initialData();
  const item = data.cocktails.find((c) => c.name === 'Hibiscus tea')!;
  return {
    item,
    data: applyCommand(data, {
      id: 'tea-plain',
      type: 'cocktail',
      value: { ...item, noIngredients: true, portionCost: 60 },
    }),
  };
};

describe('menu items sold without ingredients', () => {
  it('sells without a recipe, keeps stock and records the portion cost', () => {
    const { data, item } = tea();
    const before = stockTotals(data);
    const sold = applyCommand(data, {
      id: 'tea-sale',
      type: 'sale',
      value: { kind: 'cocktail', productId: item.id, quantity: 2, date: businessToday() },
    });
    expect(sold.sales.at(-1)).toMatchObject({
      ingredients: [],
      withoutIngredients: true,
      cost: 120,
      revenue: 2600,
    });
    expect(stockTotals(sold)).toEqual(before);
    expect(validateData(sold).sales.at(-1)?.withoutIngredients).toBe(true);
  });

  it('rejects ingredients on an item marked as having none', () => {
    const { data, item } = tea();
    expect(() =>
      applyCommand(data, {
        id: 'mixed',
        type: 'cocktail',
        value: { ...item, noIngredients: true, ingredients: [{ alcoholId: 'sugar', ml: 5 }] },
      }),
    ).toThrow();
  });

  it('is ready and unlimited for workers without exposing its cost', () => {
    const { data, item } = tea();
    const staff = staffData(data);
    expect(staff.products.find((p) => p.id === item.id)).toMatchObject({ ready: true, available: null });
    expect(staff.recipes.find((r) => r.id === item.id)).toMatchObject({ noIngredients: true });
    expect(JSON.stringify(staff)).not.toContain('portionCost');
  });
});
