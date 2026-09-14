import { expect, test } from 'vitest';
import { initialData } from '../../model';
import { reportAnalytics } from '../analytics';
import { priceAdvice, salesPerformance, type ProductPerformance } from '../pricing';
import { compareCatalog } from '../../../features/catalog/sort';
test('reports exclude voids, flag incomplete costs and keep glass volumes separate', () => {
  const data = initialData();
  data.sales = [100, 150].map((servingMl, index) => ({
    id: String(index),
    productId: 'wine',
    name: 'Wine',
    kind: 'cocktail',
    category: 'wine',
    unit: 'glass',
    servingMl,
    quantity: 2,
    revenue: 3000,
    cost: 500,
    ingredients: [{ alcoholId: 'wine', ml: 200, cost: 500 }],
    createdAt: '',
    date: '2026-09-12',
    voided: false,
  }));
  data.sales.push({ ...data.sales[0], id: 'void', voided: true, revenue: 99999 });
  data.sales.push({ ...data.sales[0], id: 'unknown', ingredients: [], cost: 0 });
  const stats = reportAnalytics(data, { from: '2026-09-01', to: '2026-09-30' });
  expect(stats.revenue).toBe(9000);
  expect(stats.costCoverage).toBeCloseTo(200 / 3);
  expect(stats.insights.some((i) => i.id === 'costs')).toBe(true);
  const rows = salesPerformance(data, '2026-09');
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.servingMl === 100)?.costKnown).toBe(false);
  expect(reportAnalytics(data, '2026-08').revenue).toBe(0);
});
test('price suggestions require enough cost data and avoid demand suggestions for stockouts', () => {
  const row: ProductPerformance = {
    id: '1',
    name: 'Cocktail',
    unit: 'порц.',
    quantity: 20,
    operations: 20,
    revenue: 40000,
    cost: 10000,
    costKnown: true,
    outOfStock: false,
    averagePrice: 2000,
    currentPrice: 2000,
    profit: 30000,
    margin: 75,
  };
  expect(priceAdvice([row])[0]).toMatchObject({ kind: 'raise', suggested: 2100 });
  expect(priceAdvice([{ ...row, costKnown: false }])[0].suggested).toBeNull();
  expect(priceAdvice([{ ...row, operations: 2 }])[0].kind).toBe('insufficient');
  expect(priceAdvice([{ ...row, outOfStock: true }])[0].suggested).toBeNull();
  expect(priceAdvice([{ ...row, cost: 30000 }])[0]).toMatchObject({ kind: 'review', suggested: 3000 });
});
test('worker sorting uses availability and frequency without prices', () => {
  expect(
    compareCatalog({ name: 'A', available: 0 }, { name: 'B', available: 2 }, 'available'),
  ).toBeGreaterThan(0);
  expect(compareCatalog({ name: 'A', available: 0 }, { name: 'B', available: 2 }, 'missing')).toBeLessThan(0);
  expect(compareCatalog({ name: 'A', popularity: 4 }, { name: 'B', popularity: 1 }, 'popular')).toBeLessThan(
    0,
  );
});
