import { describe, expect, it } from 'vitest';
import { applyCommand, initialData, stock, averageCost, validateData } from '../model';
import { businessToday } from '../business-day';
import { inventoryCalculations } from '../inventory-calculations';
import { operatingResult, purchaseForecast } from '../reports/purchasing';
const seed = () => {
  const data = initialData();
  data.alcohol = [
    data.alcohol.find((a) => a.unit !== 'bottle')!,
    { ...data.alcohol[0], id: 'prep', name: 'Заготовка', unit: 'ml', category: 'mixer' },
  ];
  data.cocktails = [];
  data.sales = [];
  return applyCommand(data, {
    type: 'purchase',
    id: 'purchase-op',
    value: { id: 'p1', alcoholId: data.alcohol[0].id, ml: 1000, costPerLiter: 2000, date: businessToday() },
  });
};
describe('stock operations and operating expenses', () => {
  it('conserves batch cost and persists expiry without consuming ingredients twice', () => {
    const before = seed(),
      id = before.alcohol[0].id;
    const command = {
      type: 'prepare' as const,
      id: 'batch1',
      reason: 'Сироп 1',
      outputId: 'prep',
      quantity: 400,
      ingredients: [{ alcoholId: id, ml: 200 }],
      expiresOn: businessToday(),
    };
    const next = applyCommand(before, command);
    expect(stock(next, id)).toBe(800);
    expect(stock(next, 'prep')).toBe(400);
    expect(averageCost(next, 'prep')).toBe(1000);
    expect(next.stockMovements![0].lines.reduce((s, l) => s + l.cost, 0)).toBe(0);
    expect(inventoryCalculations(next).averageCost('prep')).toBe(1000);
    expect(applyCommand(next, command)).toBe(next);
    expect(validateData(next)).toBe(next);
    expect(() =>
      applyCommand(next, { ...command, id: 'batch2', ingredients: [{ alcoholId: 'prep', ml: 10 }] }),
    ).toThrow();
  });
  it('checks stale counts, values shortages at existing cost and surplus at declared cost', () => {
    const before = seed(),
      id = before.alcohol[0].id;
    const count = applyCommand(before, {
      id: 'count1',
      type: 'count',
      reason: 'Пересчёт',
      lines: [{ alcoholId: id, expected: 1000, actual: 900, costPerBasis: 99999 }],
    });
    expect(stock(count, id)).toBe(900);
    expect(averageCost(count, id)).toBe(2000);
    expect(count.stockMovements![0].lines[0].cost).toBe(-200);
    expect(() =>
      applyCommand(count, {
        id: 'stale',
        type: 'count',
        reason: 'Пересчёт',
        lines: [{ alcoholId: id, expected: 1000, actual: 800 }],
      }),
    ).toThrow(/изменился/);
    const gain = applyCommand(count, {
      id: 'count2',
      type: 'count',
      reason: 'Найдена бутылка',
      lines: [{ alcoholId: id, expected: 900, actual: 1000, costPerBasis: 1000 }],
    });
    expect(stock(gain, id)).toBe(1000);
    expect(averageCost(gain, id)).toBe(1900);
    expect(validateData(gain)).toBe(gain);
  });
  it('rejects overdrafts, invalid cost and invalid expense; excludes cancelled expenses', () => {
    const before = seed(),
      id = before.alcohol[0].id;
    expect(() =>
      applyCommand(before, {
        id: 'w1',
        type: 'writeoff',
        reason: 'Разлив',
        alcoholId: id,
        expected: 1000,
        quantity: 1001,
      }),
    ).toThrow();
    const write = applyCommand(before, {
      id: 'w2',
      type: 'writeoff',
      reason: 'Разлив',
      alcoholId: id,
      expected: 1000,
      quantity: 100,
    });
    const expense = applyCommand(write, {
      id: 'exp1',
      type: 'expense',
      value: { date: businessToday(), category: 'rent', description: 'Аренда', amount: 500 },
    });
    expect(operatingResult(expense, businessToday(), businessToday())).toMatchObject({
      expenses: 500,
      losses: 200,
      result: -700,
    });
    const cancelled = applyCommand(expense, { id: 'void1', type: 'voidExpense', expenseId: 'exp1' });
    expect(operatingResult(cancelled, businessToday(), businessToday()).expenses).toBe(0);
    expect(() =>
      applyCommand(before, {
        id: 'expbad',
        type: 'expense',
        value: { date: businessToday(), category: 'rent', description: 'Аренда', amount: -500 },
      }),
    ).toThrow();
    const forecast = purchaseForecast(write, businessToday(), businessToday(), 3, 4);
    expect(forecast.find((r) => r.id === id)?.consumed).toBe(0); // Losses are not customer demand.
  });
});
