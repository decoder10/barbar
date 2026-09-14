import { expect, test } from 'vitest';
import { staffData } from '../../../../netlify/lib/barbar-access';
import { migrateBottleCatalog } from '../catalog/bottles';
import { applyCommand, initialData, stock, stockTotals, today, validateData } from '../model';
import { bottlePhoto, menuPhoto } from '../../features/catalog/media/photo-catalog';

function wine() {
  let d = applyCommand(initialData(), {
    id: 'new-wine',
    type: 'alcohol',
    value: {
      id: 'custom-wine',
      name: 'My saved wine',
      category: 'wine',
      unit: 'bottle',
      bottleSizeMl: 750,
      glassSizeMl: 150,
      glassPrice: 1500,
      costPerLiter: 3000,
      pricePerLiter: 7500,
      color: '#aa3366',
    },
  });
  d = applyCommand(d, {
    id: 'buy-wine',
    type: 'purchase',
    value: { id: 'pw', alcoholId: 'custom-wine', ml: 2, costPerLiter: 3000, date: today() },
  });
  return d;
}
const sell = (ml: number, quantity = 2) => ({
  id: 'glass-sale',
  type: 'sale' as const,
  value: {
    kind: 'cocktail' as const,
    productId: 'glass-custom-wine',
    quantity,
    date: today(),
    servingMl: ml,
  },
});
test('custom glass size scales stock, price and cost, snapshots ml, and cancels exactly', () => {
  const before = wine();
  const d = applyCommand(before, sell(100));
  expect(d.sales.at(-1)).toMatchObject({
    servingMl: 100,
    quantity: 2,
    revenue: 2000,
    cost: 800,
    unit: 'glass',
  });
  expect(stock(d, 'custom-wine')).toBeCloseTo(2 - 200 / 750, 7);
  expect(d.cocktails).toEqual(before.cocktails);
  expect(validateData(JSON.parse(JSON.stringify(d)))).toEqual(d);
  expect(staffData(d).sales.at(-1)).toMatchObject({ servingMl: 100, quantity: 2 });
  expect(staffData(d).sales.at(-1)).not.toHaveProperty('revenue');
  expect(applyCommand(d, sell(100))).toBe(d);
  const undone = applyCommand(d, { id: 'undo', type: 'void', saleId: d.sales.at(-1)!.id });
  expect(stock(undone, 'custom-wine')).toBe(2);
});
test('server rejects impossible glass sizes and stock overdraw', () => {
  for (const n of [0, -1, 0.5, 751, NaN]) expect(() => applyCommand(wine(), sell(n))).toThrow();
  expect(() => applyCommand(wine(), sell(300, 6))).toThrow();
  expect(() =>
    applyCommand(wine(), { ...sell(100), value: { ...sell(100).value, productId: 'bottle-custom-wine' } }),
  ).toThrow();
});
test('photo lookup and repeated catalog migration preserve custom alcohol and cocktail records', () => {
  let d = wine();
  d = applyCommand(d, {
    id: 'custom-cocktail-command',
    type: 'cocktail',
    value: {
      id: 'custom-cocktail',
      name: 'Saved signature cocktail',
      category: 'cocktail',
      image: 8,
      price: 3200,
      notes: 'Do not lose this recipe',
      ingredients: [{ alcoholId: 'vodka', ml: 45 }],
    },
  });
  const snapshot = structuredClone(d);
  for (const a of d.alcohol) bottlePhoto(a.name, a.category);
  for (const c of d.cocktails) menuPhoto(c.name, c.image, c.category, c.serving);
  expect(d).toEqual(snapshot);
  const migrated = migrateBottleCatalog(d);
  expect(migrated.alcohol.find((a) => a.id === 'custom-wine')).toEqual(
    snapshot.alcohol.find((a) => a.id === 'custom-wine'),
  );
  expect(migrated.cocktails.find((c) => c.id === 'custom-cocktail')).toEqual(
    snapshot.cocktails.find((c) => c.id === 'custom-cocktail'),
  );
  expect(migrated.purchases).toEqual(snapshot.purchases);
  expect(migrated.sales).toEqual(snapshot.sales);
  expect(migrateBottleCatalog(migrated)).toBe(migrated);
});
test('batched stock is identical with fractional bottles, voids and stock resets', () => {
  let d = applyCommand(wine(), sell(125, 3));
  d = applyCommand(d, {
    id: 'reset-wine',
    type: 'resetStock',
    alcoholId: 'custom-wine',
    expectedMl: stock(d, 'custom-wine'),
    expectedCost: 4500,
  });
  const totals = stockTotals(d);
  for (const a of d.alcohol) expect(totals.get(a.id)).toBeCloseTo(stock(d, a.id), 7);
  const undo = applyCommand(wine(), sell(100));
  undo.sales[0].voided = true;
  expect(stockTotals(undo).get('custom-wine')).toBe(stock(undo, 'custom-wine'));
});
