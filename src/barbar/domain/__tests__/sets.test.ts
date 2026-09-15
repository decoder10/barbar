import { describe, expect, it } from 'vitest';
import { staffData } from '../../../../netlify/lib/barbar-access';
import { businessToday } from '../business-day';
import { cardPage } from '../catalog/cards';
import { applyCommand, initialData, stock, stockTotals, validateData } from '../model';
import type { BarData } from '../types';

const ready = (): BarData => {
  let data = initialData();
  const plum = data.cocktails.find((c) => c.name === 'Слива')!;
  const cherry = data.cocktails.find((c) => c.name === 'Вишня')!;
  data = applyCommand(data, {
    id: 'vodka-in',
    type: 'purchase',
    value: { id: 'vodka-in', alcoholId: 'vodka', date: businessToday(), ml: 1000, costPerLiter: 4000 },
  });
  data = applyCommand(data, {
    id: 'plum',
    type: 'cocktail',
    value: {
      ...plum,
      ingredients: [{ alcoholId: 'vodka', ml: 40 }],
      extraCosts: [{ alcoholId: 'plum', cost: 20 }],
    },
  });
  data = applyCommand(data, {
    id: 'cherry',
    type: 'cocktail',
    value: { ...cherry, ingredients: [{ alcoholId: 'vodka', ml: 50 }] },
  });
  const set = data.cocktails.find((c) => c.name === 'BarBar set (6 shots)')!;
  return applyCommand(data, {
    id: 'set',
    type: 'cocktail',
    value: {
      ...set,
      components: [
        { cocktailId: plum.id, quantity: 2 },
        { cocktailId: cherry.id, quantity: 4 },
      ],
    },
  });
};

describe('tincture sets', () => {
  it('sells a set by deducting the recipes of its tinctures', () => {
    const data = ready();
    const set = data.cocktails.find((c) => c.name === 'BarBar set (6 shots)')!;
    const sold = applyCommand(data, {
      id: 'set-sale',
      type: 'sale',
      value: { kind: 'cocktail', productId: set.id, quantity: 1, date: businessToday() },
    });
    const sale = sold.sales.at(-1)!;
    expect(sale.ingredients).toEqual([{ alcoholId: 'vodka', ml: 280, cost: 1120 }]);
    expect(sale.extraCosts).toEqual([{ alcoholId: 'plum', name: 'Слива', cost: 40 }]);
    expect(sale.cost).toBe(1160);
    expect(stock(sold, 'vodka')).toBe(720);
    expect(() => validateData(sold)).not.toThrow();
  });

  it('shows availability of a set for workers and card pages', () => {
    const data = ready();
    const set = data.cocktails.find((c) => c.name === 'BarBar set (6 shots)')!;
    expect(staffData(data).products.find((p) => p.id === set.id)).toMatchObject({
      available: 3,
      ready: true,
    });
    expect(staffData(data).recipes.find((r) => r.id === set.id)?.components).toHaveLength(2);
    const page = cardPage(data, stockTotals(data), {
      resource: 'cocktails',
      category: 'set',
      search: 'BarBar',
      sort: 'original',
      offset: 0,
      limit: 5,
    });
    expect(page.available[set.id]).toBe(3);
  });

  it('accepts only tinctures in whole shots and protects tinctures used in a set', () => {
    const data = ready();
    const set = data.cocktails.find((c) => c.name === 'BarBar set (6 shots)')!;
    const negroni = data.cocktails.find((c) => c.name === 'Negroni')!;
    const plum = data.cocktails.find((c) => c.name === 'Слива')!;
    expect(() =>
      applyCommand(data, {
        id: 'bad-1',
        type: 'cocktail',
        value: { ...set, components: [{ cocktailId: negroni.id, quantity: 1 }] },
      }),
    ).toThrow();
    expect(() =>
      applyCommand(data, {
        id: 'bad-2',
        type: 'cocktail',
        value: { ...set, components: [{ cocktailId: plum.id, quantity: 1.5 }] },
      }),
    ).toThrow();
    expect(() =>
      applyCommand(data, {
        id: 'bad-3',
        type: 'cocktail',
        value: { ...set, ingredients: [{ alcoholId: 'vodka', ml: 30 }] },
      }),
    ).toThrow();
    expect(() =>
      applyCommand(data, { id: 'bad-4', type: 'cocktail', value: { ...plum, category: 'shot' } }),
    ).toThrow('входит в сет');
  });

  it('refuses a set sale while a tincture has no recipe', () => {
    let data = initialData();
    const set = data.cocktails.find((c) => c.name === 'Art set (10 shots)')!;
    const plum = data.cocktails.find((c) => c.name === 'Слива')!;
    data = applyCommand(data, {
      id: 'set',
      type: 'cocktail',
      value: { ...set, components: [{ cocktailId: plum.id, quantity: 10 }] },
    });
    expect(() =>
      applyCommand(data, {
        id: 's',
        type: 'sale',
        value: { kind: 'cocktail', productId: set.id, quantity: 1, date: businessToday() },
      }),
    ).toThrow('Заполните состав настойки «Слива»');
  });
});
