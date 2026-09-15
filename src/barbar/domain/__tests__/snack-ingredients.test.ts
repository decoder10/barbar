import { describe, expect, it } from 'vitest';
import { businessToday } from '../business-day';
import { applyCommand, initialData, stock, unitLabel } from '../model';
import { defaultIngredientAmount, ingredientFits, ingredientGroups } from '../recipe-ingredients';
import { inventoryGroup } from '../inventory-groups';
import { foodDefaults, missingFoodDefaults } from '../../../../netlify/lib/database/food-catalog';

const snack = () => {
  const data = initialData();
  return applyCommand(
    applyCommand(
      applyCommand(data, {
        id: 'bread-in',
        type: 'purchase',
        value: { id: 'bread-in', alcoholId: 'food-bread', date: businessToday(), ml: 10, costPerLiter: 200 },
      }),
      {
        id: 'cheese-in',
        type: 'purchase',
        value: {
          id: 'cheese-in',
          alcoholId: 'food-cheese',
          date: businessToday(),
          ml: 1000,
          costPerLiter: 6000,
        },
      },
    ),
    {
      id: 'recipe',
      type: 'cocktail',
      value: {
        ...data.cocktails.find((c) => c.name === 'BarBar sandwich')!,
        ingredients: [
          { alcoholId: 'food-bread', ml: 0.5 },
          { alcoholId: 'food-cheese', ml: 80 },
        ],
      },
    },
  );
};

describe('snack recipes', () => {
  it('offers snack products instead of the cocktail ingredient list', () => {
    const groups = ingredientGroups(initialData().alcohol, 'snack');
    expect(groups[0].label).toBe('Мясо, колбасы и сыр');
    expect(groups.map((g) => g.label)).toContain('Хлеб и выпечка');
    expect(groups.flatMap((g) => g.items).some((a) => a.id === 'vodka')).toBe(false);
    expect(groups.flatMap((g) => g.items).map((a) => a.id)).toEqual(
      expect.arrayContaining(['food-bread', 'food-cheese']),
    );
    const drinkItems = ingredientGroups(initialData().alcohol, 'cocktail').flatMap((g) => g.items);
    // Drink recipes never offer meat, bread or snacks; dairy such as butter may stay.
    expect(drinkItems.some((a) => ['meat', 'bakery', 'snacks'].includes(inventoryGroup(a)))).toBe(false);
    expect(ingredientFits({ id: 'vodka', name: 'Vodka', category: 'alcohol' }, 'snack')).toBe(false);
  });

  it('never pre-fills a drink volume for snack weights', () => {
    expect(defaultIngredientAmount('g', 'snack', 30)).toBe(0);
    expect(defaultIngredientAmount('pcs', 'snack', 30)).toBe(1);
    expect(defaultIngredientAmount('ml', 'cocktail', 30)).toBe(30);
    expect(unitLabel('pcs')).toBe('шт.');
  });

  it('costs and consumes pieces and grams in their own units', () => {
    const data = snack();
    const sandwich = data.cocktails.find((c) => c.name === 'BarBar sandwich')!;
    const sold = applyCommand(data, {
      id: 'sale',
      type: 'sale',
      value: { kind: 'cocktail', productId: sandwich.id, quantity: 2, date: businessToday() },
    });
    const sale = sold.sales.at(-1)!;
    expect(sale.ingredients).toEqual([
      { alcoholId: 'food-bread', ml: 1, cost: 200 },
      { alcoholId: 'food-cheese', ml: 160, cost: 960 },
    ]);
    expect(sale.cost).toBe(1160);
    expect(stock(sold, 'food-bread')).toBe(9);
    expect(stock(sold, 'food-cheese')).toBe(840);
  });

  it('keeps purchases in whole pieces and pieces out of poured alcohol', () => {
    expect(() =>
      applyCommand(initialData(), {
        id: 'half',
        type: 'purchase',
        value: { id: 'half', alcoholId: 'food-bread', date: businessToday(), ml: 1.5, costPerLiter: 200 },
      }),
    ).toThrow();
    const vodka = initialData().alcohol.find((a) => a.id === 'vodka')!;
    expect(() =>
      applyCommand(initialData(), { id: 'bad-unit', type: 'alcohol', value: { ...vodka, unit: 'pcs' } }),
    ).toThrow();
  });

  it('does not rewrite a saved snack recipe that still uses a drink ingredient', () => {
    const data = initialData();
    const sandwich = data.cocktails.find((c) => c.name === 'BarBar sandwich')!;
    const saved = applyCommand(data, {
      id: 'legacy',
      type: 'cocktail',
      value: { ...sandwich, ingredients: [{ alcoholId: 'vodka', ml: 50 }] },
    });
    expect(saved.cocktails.find((c) => c.id === sandwich.id)!.ingredients).toEqual([
      { alcoholId: 'vodka', ml: 50 },
    ]);
  });

  it('adds only missing default snack products', () => {
    const existing = [
      { id: 'food-bread', name: 'Хлеб домашний' },
      { id: 'custom', name: 'СЫР' },
    ];
    expect(foodDefaults.some((a) => /чипсы|орехи|суджук/i.test(a.name))).toBe(false);
    const missing = missingFoodDefaults(existing);
    expect(missing.some((a) => a.id === 'food-bread' || a.name === 'Сыр')).toBe(false);
    expect(missing).toHaveLength(foodDefaults.length - 2);
  });
});
