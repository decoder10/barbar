import { describe, expect, it } from 'vitest';
import { staffData } from '../../../../../netlify/lib/barbar-access';
import { migrateBottleCatalog } from '../bottles';
import {
  applyCommand,
  averageCost,
  initialData,
  portions,
  recipeCost,
  stock,
  today,
  validateData,
} from '../../model';
import type { Alcohol, BarData } from '../../types';

const add = (data: BarData, value: Alcohol) =>
  applyCommand(data, { id: crypto.randomUUID(), type: 'alcohol', value });
const purchase = (data: BarData, alcoholId: string, ml: number, costPerLiter: number) =>
  applyCommand(data, {
    id: crypto.randomUUID(),
    type: 'purchase',
    value: { id: crypto.randomUUID(), alcoholId, ml, costPerLiter, date: today() },
  });
const sell = (data: BarData, productId: string, quantity = 1) =>
  applyCommand(data, {
    id: crypto.randomUUID(),
    type: 'sale',
    value: { kind: 'cocktail', productId, quantity, date: today() },
  });
const beer: Alcohol = {
  id: 'test-beer',
  name: 'Test lager 330',
  category: 'beer',
  unit: 'bottle',
  bottleSizeMl: 330,
  costPerLiter: 500,
  pricePerLiter: 1200,
  color: '#b58636',
};

describe('bottle stock and brand pricing', () => {
  it('migrates unused menu brands once, preserves menu prices, and never invents purchases', () => {
    const old = initialData();
    const next = migrateBottleCatalog(old);
    expect(next.alcohol.filter((a) => a.category === 'beer')).toHaveLength(15);
    expect(next.alcohol.filter((a) => a.category === 'wine')).toHaveLength(23);
    expect(next.alcohol.filter((a) => a.category === 'cognac')).toHaveLength(4);
    expect(next.alcohol.find((a) => a.id === 'bacardi-white')?.unit).toBe('ml');
    expect(next.alcohol.find((a) => a.id === 'bacardi-dark')?.unit).toBe('ml');
    expect(next.cocktails.find((c) => c.id === 'menu-074')?.price).toBe(2000);
    expect(next.cocktails.find((c) => c.id === 'menu-129')?.ingredients).toEqual([
      { alcoholId: 'stock-menu-129', ml: 1 },
    ]);
    expect(next.cocktails.find((c) => c.id === 'menu-128')?.ingredients).toEqual([]);
    const newBeers = next.alcohol.filter((a) => a.id.startsWith('beer-379-'));
    expect(newBeers).toHaveLength(5);
    for (const beer of newBeers) {
      expect(beer).toMatchObject({ unit: 'bottle', costPerLiter: 0, pricePerLiter: 0 });
      expect(stock(next, beer.id)).toBe(0);
      expect(next.cocktails.find((c) => c.stockAlcoholId === beer.id)?.ingredients).toEqual([
        { alcoholId: beer.id, ml: 1 },
      ]);
    }
    expect(next.purchases).toEqual(old.purchases);
    expect(next.sales).toEqual(old.sales);
    expect(migrateBottleCatalog(next)).toBe(next);
    expect(validateData(next)).toEqual(next);
  });
  it('retains historically used millilitre items and recipes without converting their amounts or costs', () => {
    let old = purchase(initialData(), 'beer', 500, 1200);
    old = purchase(old, 'cognac', 700, 40000);
    const next = migrateBottleCatalog(old);
    expect(next.alcohol.find((a) => a.id === 'beer')).toEqual(old.alcohol.find((a) => a.id === 'beer'));
    expect(next.alcohol.find((a) => a.id === 'cognac')).toEqual(old.alcohol.find((a) => a.id === 'cognac'));
    expect(stock(next, 'beer')).toBe(500);
    expect(stock(next, 'cognac')).toBe(700);
    expect(next.purchases).toEqual(old.purchases);
    expect(next.alcohol.find((a) => a.id === 'bottled-cognac')?.unit).toBe('bottle');
    expect(validateData(next)).toEqual(next);
  });
  it('prices each brand independently and accounts for purchases, sales, cancellation and corrections per bottle', () => {
    let data = add(initialData(), beer);
    data = add(data, { ...beer, id: 'other-beer', name: 'Other brand', pricePerLiter: 2000 });
    data = purchase(data, beer.id, 6, 500);
    data = purchase(data, beer.id, 6, 700);
    data = purchase(data, 'other-beer', 2, 900);
    expect(stock(data, beer.id)).toBe(12);
    expect(averageCost(data, beer.id)).toBe(600);
    expect(recipeCost(data, [{ alcoholId: beer.id, ml: 1 }])).toBe(600);
    data = sell(data, 'bottle-test-beer', 2);
    expect(stock(data, beer.id)).toBe(10);
    expect(stock(data, 'other-beer')).toBe(2);
    expect(data.sales.at(-1)).toMatchObject({ quantity: 2, revenue: 2400, cost: 1200, unit: 'bottle' });
    const originalSale = structuredClone(data.sales[0]);
    data = add(data, { ...beer, pricePerLiter: 1500 });
    expect(data.cocktails.find((c) => c.id === 'bottle-test-beer')?.price).toBe(1500);
    expect(data.sales[0]).toEqual(originalSale);
    data = applyCommand(data, { id: 'cancel', type: 'void', saleId: data.sales[0].id });
    expect(stock(data, beer.id)).toBe(12);
    const p = data.purchases[0];
    data = applyCommand(data, {
      id: 'correct',
      type: 'correctPurchase',
      purchaseId: p.id,
      expectedMl: 6,
      ml: 4,
    });
    expect(stock(data, beer.id)).toBe(10);
    expect(validateData(data)).toEqual(data);
  });
  it.each(['wine', 'cognac'] as const)(
    'supports selected bottle and serving volumes for %s without rounding away portions',
    (category) => {
      let data = add(initialData(), {
        ...beer,
        id: 'pourable',
        name: 'Test pourable',
        category,
        bottleSizeMl: 750,
        glassSizeMl: 125,
        glassPrice: 1200,
        costPerLiter: 3000,
        pricePerLiter: 9000,
      });
      data = purchase(data, 'pourable', 1, 3000);
      const menu = data.cocktails.find((c) => c.id === 'glass-pourable')!;
      for (let i = 0; i < 6; i++) {
        expect(portions(data, menu.ingredients)).toBe(6 - i);
        data = sell(data, menu.id);
      }
      expect(stock(data, 'pourable')).toBe(0);
      expect(data.sales.reduce((n, s) => n + s.cost, 0)).toBe(3000);
      expect(data.sales.reduce((n, s) => n + s.revenue, 0)).toBe(7200);
      expect(() => sell(data, menu.id)).toThrow('Недостаточно');
      expect(() =>
        add(data, { ...data.alcohol.find((a) => a.id === 'pourable')!, bottleSizeMl: 700 }),
      ).toThrow('Объём');
      const restored = validateData(JSON.parse(JSON.stringify(data)));
      expect(stock(restored, 'pourable')).toBe(0);
      data = applyCommand(data, { id: 'undo-glass', type: 'void', saleId: data.sales[0].id });
      expect(portions(data, menu.ingredients)).toBe(1);
      data = applyCommand(data, {
        id: 'reset',
        type: 'resetStock',
        alcoholId: 'pourable',
        expectedMl: stock(data, 'pourable'),
        expectedCost: 500,
      });
      expect(stock(data, 'pourable')).toBe(0);
      expect(validateData(data)).toEqual(data);
    },
  );
  it('rejects fractional bottle purchases, beer portions and overselling, including imported backups', () => {
    let data = add(initialData(), beer);
    expect(() => purchase(data, beer.id, 0.5, 500)).toThrow();
    data = purchase(data, beer.id, 1, 500);
    expect(() => sell(data, 'bottle-test-beer', 0.5)).toThrow();
    expect(() => sell(data, 'bottle-test-beer', 2)).toThrow();
    const backup = structuredClone(data);
    backup.purchases[0].ml = 1.5;
    expect(() => validateData(backup)).toThrow();
  });
  it('exposes bottle and glass quantities to staff with selling prices but without costs', () => {
    let data = add(initialData(), beer);
    data = purchase(data, beer.id, 2, 500);
    data = sell(data, 'bottle-test-beer');
    const staff = staffData(data);
    expect(staff.products.find((p) => p.id === 'bottle-test-beer')).toMatchObject({
      unit: 'bottle',
      available: 1,
    });
    expect(staff.sales[0]).toMatchObject({ quantity: 1, unit: 'bottle' });
    expect(JSON.stringify(staff)).not.toMatch(/"(?:cost|costPerLiter|pricePerLiter|glassPrice|purchases)"/);
  });
});
