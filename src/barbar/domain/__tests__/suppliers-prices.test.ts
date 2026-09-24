import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCommand, commandStockIds, initialData, validateData } from '../model';
import type { BarData } from '../types';

const owner = { actor: { id: 'o1', fullName: 'Арам' } };
const seed = (): BarData => {
  const data = initialData();
  data.alcohol = [
    {
      ...data.alcohol.find((a) => a.unit !== 'bottle')!,
      id: 'vodka',
      name: 'Водка',
      category: 'alcohol',
      pricePerLiter: 9000,
    },
  ];
  data.cocktails = [
    { id: 'mule', name: 'Мул', price: 2000, image: 0, ingredients: [{ alcoholId: 'vodka', ml: 50 }] },
  ];
  data.sales = [];
  return data;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('price history', () => {
  it('records a change of a menu price and of a poured price, with the actor', () => {
    const data = seed();
    const menu = applyCommand(
      data,
      { type: 'cocktail', id: 'c1', value: { ...data.cocktails[0], price: 2300 } },
      owner,
    );
    expect(menu.priceChanges).toEqual([
      expect.objectContaining({
        kind: 'cocktail',
        productId: 'mule',
        field: 'price',
        from: 2000,
        to: 2300,
        date: '2026-09-12',
        actor: owner.actor,
      }),
    ]);
    const poured = applyCommand(
      menu,
      { type: 'alcohol', id: 'c2', value: { ...menu.alcohol[0], pricePerLiter: 10000 } },
      owner,
    );
    expect(poured.priceChanges!.at(-1)).toMatchObject({
      kind: 'alcohol',
      field: 'pricePerLiter',
      from: 9000,
      to: 10000,
    });
    expect(validateData(poured)).toBe(poured);
  });
  it('writes nothing when the price is unchanged and never changes a price by itself', () => {
    const data = seed();
    const same = applyCommand(
      data,
      { type: 'cocktail', id: 'c3', value: { ...data.cocktails[0], notes: 'без изменений цены' } },
      owner,
    );
    expect(same.priceChanges).toBeUndefined();
    const sold = applyCommand(
      applyCommand(same, {
        type: 'purchase',
        id: 'b',
        value: { id: 'p', alcoholId: 'vodka', ml: 1000, costPerLiter: 3000, date: '2026-09-01' },
      }),
      {
        type: 'sale',
        id: 's1',
        value: { kind: 'cocktail', productId: 'mule', quantity: 1, date: '2026-09-12', businessDay: true },
      },
    );
    expect(sold.cocktails[0].price).toBe(2000);
    expect(sold.priceChanges).toBeUndefined();
  });
});

describe('suppliers', () => {
  it('saves suppliers with unique names and links them to items', () => {
    let data = applyCommand(
      seed(),
      { type: 'saveSupplier', id: 'sp1', value: { id: 'opt', name: 'Опт', leadDays: 4 } },
      owner,
    );
    expect(() =>
      applyCommand(data, { type: 'saveSupplier', id: 'sp2', value: { id: 'other', name: ' опт ' } }, owner),
    ).toThrow('уже есть');
    expect(() =>
      applyCommand(
        data,
        { type: 'alcohol', id: 'a0', value: { ...data.alcohol[0], supplierId: 'missing' } },
        owner,
      ),
    ).toThrow('поставщика');
    data = applyCommand(
      data,
      {
        type: 'alcohol',
        id: 'a1',
        value: { ...data.alcohol[0], supplierId: 'opt', safetyDays: 2, safetyStock: 500 },
      },
      owner,
    );
    expect(data.alcohol[0]).toMatchObject({ supplierId: 'opt', safetyDays: 2, safetyStock: 500 });
    expect(validateData(data)).toBe(data);
    const removed = applyCommand(data, { type: 'removeSupplier', id: 'sp3', supplierId: 'opt' }, owner);
    expect(removed.suppliers).toEqual([]);
    expect(removed.alcohol[0].supplierId).toBeUndefined();
    expect(removed.alcohol[0].safetyDays).toBe(2);
  });
  it('rejects bad values', () => {
    expect(() =>
      applyCommand(
        seed(),
        { type: 'saveSupplier', id: 's', value: { id: 'x', name: 'Опт', leadDays: -1 } },
        owner,
      ),
    ).toThrow();
    expect(() =>
      applyCommand(
        seed(),
        { type: 'alcohol', id: 'a', value: { ...seed().alcohol[0], leadDays: 1.5 } },
        owner,
      ),
    ).toThrow();
  });
});

describe('commandStockIds', () => {
  it('lists the stock items a command touches', () => {
    const data = seed();
    expect(
      commandStockIds(data, {
        type: 'sale',
        id: 'x',
        value: { kind: 'cocktail', productId: 'mule', quantity: 1, date: '2026-09-12' },
      }),
    ).toEqual(['vodka']);
    expect(
      commandStockIds(data, {
        type: 'addLines',
        id: 'y',
        lines: [{ kind: 'alcohol', productId: 'vodka', quantity: 50 }],
        expectedTotal: 1,
      }),
    ).toEqual(['vodka']);
    expect(
      commandStockIds(data, {
        type: 'prepare',
        id: 'z',
        reason: 'r',
        outputId: 'prep',
        quantity: 1,
        ingredients: [{ alcoholId: 'vodka', ml: 1 }],
      }),
    ).toEqual(['prep', 'vodka']);
  });
});
