import { expect, test } from 'vitest';
import { fixtureData } from '../../../../tests/fixtures';
import { inventoryCalculations } from '../inventory-calculations';
import { applyCommand, averageCost, stock, recipeCost, portions } from '../model';
import { businessToday } from '../business-day';
import { revenueSeries } from '../reports/period';

test('indexed inventory matches ledger accounting after a sale', () => {
  let data = fixtureData();
  data = applyCommand(data, {
    id: 'sale-test',
    type: 'sale',
    value: { kind: 'cocktail', productId: data.cocktails[0].id, quantity: 2, date: businessToday() },
  });
  const view = inventoryCalculations(data);
  for (const a of data.alcohol) {
    expect(view.stock(a.id)).toBeCloseTo(stock(data, a.id), 8);
    expect(view.averageCost(a.id)).toBeCloseTo(averageCost(data, a.id), 8);
  }
  for (const c of data.cocktails) {
    expect(view.recipeCost(c.ingredients, c.extraCosts)).toBe(recipeCost(data, c.ingredients, c.extraCosts));
    expect(view.portions(c.ingredients)).toBe(portions(data, c.ingredients));
  }
});
test('long report ranges include the last year and cap chart columns', () => {
  const bins = revenueSeries(
    [
      { date: '2024-01-01', revenue: 100 },
      { date: '2026-09-14', revenue: 300 },
    ],
    '2024-01-01',
    '2026-09-14',
  );
  expect(bins.length).toBeLessThanOrEqual(62);
  expect(bins.reduce((n, b) => n + b.amount, 0)).toBe(400);
  expect(bins.at(-1)?.end).toBe('2026-09-14');
});
