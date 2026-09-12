import { fixtureData } from '../../tests/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCommand, averageCost, initialData, recipeCost, stock, validateData } from './model';
import type { BarData, Command } from './types';
let counter = 0;
const command = (action: Omit<Command, 'id'>) => ({ ...action, id: `op-${++counter}` }) as Command;
const buy = (data: BarData, ml = 1000, cost = 4000, date = '2026-09-01', alcoholId = 'vodka') =>
  applyCommand(
    data,
    command({
      type: 'purchase',
      value: { id: `purchase-${++counter}`, alcoholId, ml, costPerLiter: cost, date },
    } as Command),
  );
const sell = (data: BarData, quantity = 50, date = '2026-09-10') =>
  applyCommand(
    data,
    command({ type: 'sale', value: { kind: 'alcohol', productId: 'vodka', quantity, date } } as Command),
  );
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());
describe('Barbar accounting', () => {
  it('preloads actual menu prices without inventing recipes or stock', () => {
    const data = initialData();
    expect(data.cocktails).toHaveLength(167);
    expect(data.cocktails.every((c) => !c.ingredients.length)).toBe(true);
    expect(data.cocktails.find((c) => c.name === 'Aperol Spritz')?.price).toBe(2900);
    expect(data.cocktails.find((c) => c.name === 'Слива')?.price).toBe(1000);
    expect(data.purchases).toHaveLength(0);
    expect(validateData(data)).toEqual(data);
  });
  it('sums repeated purchases and calculates their weighted cost', () => {
    const data = buy(buy(initialData(), 1000, 4000), 1000, 6000);
    expect(stock(data, 'vodka')).toBe(2000);
    expect(averageCost(data, 'vodka')).toBe(5000);
  });
  it('sells millilitres at the sale price, not at purchase cost', () => {
    const data = sell(buy(initialData()), 50);
    expect(stock(data, 'vodka')).toBe(950);
    expect(data.sales[0].revenue).toBe(900);
    expect(data.sales[0].cost).toBe(200);
  });
  it('deducts every recipe ingredient and uses separate cocktail sale price', () => {
    let data = buy(buy(initialData()), 1000, 1000, '2026-09-01', 'sugar');
    const cocktail = {
      id: 'test-cocktail',
      name: 'Тест',
      category: 'tincture' as const,
      price: 1500,
      image: 4,
      ingredients: [
        { alcoholId: 'vodka', ml: 40 },
        { alcoholId: 'sugar', ml: 10 },
      ],
    };
    expect(recipeCost(data, cocktail.ingredients)).toBe(170);
    data = applyCommand(data, { type: 'cocktail', value: cocktail, id: 'recipe' });
    data = applyCommand(data, {
      type: 'sale',
      id: 'tincture-sale',
      value: { kind: 'cocktail', productId: cocktail.id, quantity: 3, date: '2026-09-10' },
    });
    expect(stock(data, 'vodka')).toBe(880);
    expect(stock(data, 'sugar')).toBe(970);
    expect(data.sales[0].cost).toBe(510);
    expect(data.sales[0].revenue).toBe(4500);
    expect(data.sales[0].category).toBe('tincture');
  });
  it('rejects overselling atomically', () => {
    const data = buy(initialData(), 100);
    expect(() => sell(data, 101)).toThrow('Недостаточно');
    expect(data.sales).toHaveLength(0);
    expect(stock(data, 'vodka')).toBe(100);
  });
  it('rejects a sale before the purchase date', () => {
    const data = buy(initialData(), 1000, 4000, '2026-09-09');
    expect(() => sell(data, 50, '2026-09-08')).toThrow('Недостаточно');
  });
  it('preserves sale snapshots after recipe and price edits', () => {
    const data = sell(buy(initialData()));
    const original = structuredClone(data.sales[0]);
    const edited = applyCommand(data, {
      id: 'edit-price',
      type: 'alcohol',
      value: { ...data.alcohol.find((a) => a.id === 'vodka')!, pricePerLiter: 99999, costPerLiter: 99999 },
    });
    expect(edited.sales[0]).toEqual(original);
    expect(averageCost(edited, 'vodka')).toBe(4000);
  });
  it('returns stock and cost when a sale is voided', () => {
    const data = sell(buy(initialData()));
    const next = applyCommand(data, { type: 'void', saleId: data.sales[0].id, id: 'void-sale' });
    expect(stock(next, 'vodka')).toBe(1000);
    expect(averageCost(next, 'vodka')).toBe(4000);
    expect(next.sales[0].voided).toBe(true);
  });
  it('makes retries idempotent', () => {
    const data = buy(initialData());
    const c: Command = {
      type: 'sale',
      id: 'same-operation',
      value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-10' },
    };
    const saved = applyCommand(data, c);
    expect(applyCommand(saved, c)).toBe(saved);
    expect(stock(saved, 'vodka')).toBe(950);
  });
  it('keeps stock and cost identical after deleting old history', () => {
    let data = buy(initialData(), 1000, 4000);
    data = sell(data, 100, '2026-09-02');
    data = buy(data, 1000, 6000, '2026-09-03');
    data = sell(data, 50, '2026-09-10');
    const amount = stock(data, 'vodka');
    const cost = averageCost(data, 'vodka');
    const next = applyCommand(data, { id: 'purge', type: 'purge', before: '2026-09-05' });
    expect(next.sales).toHaveLength(1);
    expect(next.archived?.count).toBe(1);
    expect(stock(next, 'vodka')).toBe(amount);
    expect(averageCost(next, 'vodka')).toBeCloseTo(cost, 8);
    expect(validateData(next)).toEqual(next);
    expect(() => sell(next, 50, '2026-09-02')).toThrow('удалена');
  });
  it('does not deduct cancelled sales during history cleanup', () => {
    let data = sell(buy(initialData()), 100, '2026-09-02');
    data = applyCommand(data, { id: 'void', type: 'void', saleId: data.sales[0].id });
    const next = applyCommand(data, { id: 'purge', type: 'purge', before: '2026-09-05' });
    expect(stock(next, 'vodka')).toBe(1000);
    expect(next.archived?.ingredients).toEqual([]);
  });
  it('rejects invalid amounts, future dates and blank recipes at sale time', () => {
    const data = buy(initialData());
    for (const quantity of [0, -5, NaN, Infinity]) {
      expect(() => sell(data, quantity)).toThrow();
    }
    expect(() => sell(data, 50, '2026-09-13')).toThrow();
    expect(() =>
      applyCommand(data, {
        id: 'blank-sale',
        type: 'sale',
        value: { kind: 'cocktail', productId: 'menu-001', quantity: 1, date: '2026-09-10' },
      }),
    ).toThrow('состав');
  });
  it('validates backups and blocks unknown or duplicate ingredients', () => {
    expect(() => validateData({ version: 99 })).toThrow();
    const d = fixtureData();
    expect(validateData(d)).toEqual(d);
    const invalid = {
      ...d.cocktails[0],
      ingredients: [
        { alcoholId: 'vodka', ml: 20 },
        { alcoholId: 'vodka', ml: 30 },
      ],
    };
    expect(() => applyCommand(d, { id: 'bad-recipe', type: 'cocktail', value: invalid })).toThrow();
  });
});

describe('individual stock reset', () => {
  const reset = (data: BarData, alcoholId = 'vodka', id = 'reset'): Command => ({
    type: 'resetStock',
    id,
    alcoholId,
    expectedMl: stock(data, alcoholId),
    expectedCost: Math.round((averageCost(data, alcoholId) * stock(data, alcoholId)) / 10) / 100,
  });
  it('zeros only the selected drink, preserves history, and values the next purchase correctly', () => {
    const original = sell(buy(buy(initialData()), 500, 1000, '2026-09-01', 'sugar'), 100);
    const action = reset(original);
    const data = applyCommand(original, action);
    expect(stock(data, 'vodka')).toBe(0);
    expect(stock(data, 'sugar')).toBe(500);
    expect(data.sales).toEqual(original.sales);
    expect(data.purchases).toEqual(original.purchases);
    expect(data.cocktails).toEqual(original.cocktails);
    expect(data.stockResets?.[0]).toMatchObject({ ml: 900, cost: 3600 });
    expect(applyCommand(data, action)).toBe(data);
    expect(validateData(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(() => sell(data, 1, '2026-09-12')).toThrow('Недостаточно');
    const replenished = buy(data, 1000, 6000, '2026-09-12');
    expect(stock(replenished, 'vodka')).toBe(1000);
    expect(averageCost(replenished, 'vodka')).toBe(6000);
    expect(applyCommand(replenished, action)).toBe(replenished);
  });
  it('rejects stale confirmation, missing products and zero stock', () => {
    const data = buy(initialData());
    const action = reset(data);
    expect(() => applyCommand(sell(data), action)).toThrow('изменились');
    expect(() => applyCommand(initialData(), reset(initialData()))).toThrow('ненулевым');
    expect(() => applyCommand(data, { ...action, alcoholId: 'missing' } as Command)).toThrow();
    expect(data.stockResets).toBeUndefined();
  });
  it('supports grams and preserves reset deductions after history cleanup and restore', () => {
    vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
    let data = sell(buy(buy(initialData()), 300, 2000, '2026-09-01', 'sugar'), 100, '2026-09-02');
    data = applyCommand(data, reset(data));
    data = applyCommand(data, reset(data, 'sugar', 'reset-sugar'));
    vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
    data = buy(data, 1000, 7000, '2026-09-06');
    data = applyCommand(data, { id: 'purge-reset-history', type: 'purge', before: '2026-09-05' });
    expect(stock(data, 'vodka')).toBe(1000);
    expect(averageCost(data, 'vodka')).toBe(7000);
    expect(stock(data, 'sugar')).toBe(0);
    expect(validateData(data)).toEqual(data);
    const restored = applyCommand(initialData(), { id: 'restore-reset', type: 'restore', value: data });
    expect(stock(restored, 'vodka')).toBe(1000);
    const invalid = structuredClone(data);
    invalid.stockResets![0].ml = -1;
    expect(() => validateData(invalid)).toThrow('списания');
  });
});
