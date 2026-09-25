import { describe, expect, it } from 'vitest';
import {
  basePeriod,
  changePct,
  compare,
  decompose,
  periodFromSales,
  saleHour,
  weekdayOf,
  type Bucket,
} from '../compare';
import { groupSales } from '../totals';
import type { Sale } from '../../types';

const bucket = (key: string, units: number, revenue: number, cost = 0): Bucket => ({
  key,
  label: key,
  units,
  operations: units,
  revenue,
  cost,
});
const sale = (
  id: string,
  date: string,
  createdAt: string,
  productId: string,
  quantity: number,
  revenue: number,
  cost = 0,
  extra: Partial<Sale> = {},
): Sale => ({
  id,
  date,
  createdAt,
  kind: 'cocktail',
  productId,
  name: productId,
  quantity,
  revenue,
  cost,
  ingredients: [{ alcoholId: 'x', ml: 1, cost: cost || 1 }],
  voided: false,
  ...extra,
});

describe('revenue change decomposition', () => {
  it('adds volume, mix, price and range up to the change', () => {
    const base = [bucket('a', 10, 1000), bucket('b', 10, 3000), bucket('gone', 5, 500)];
    const current = [bucket('a', 20, 2400), bucket('b', 8, 2800), bucket('new', 4, 1200)];
    const d = decompose(current, base);
    expect(d.delta).toBe(6400 - 4500);
    expect(d.range).toBe(1200 - 500);
    // Common items: 20 + 8 = 28 portions against 20, at the base average of 200.
    expect(d.volume).toBe(1600);
    expect(d.price).toBe(2400 - 20 * 100 + (2800 - 8 * 300));
    expect(round(d.volume + d.mix + d.price + d.range)).toBe(d.delta);
  });

  it('shows no price effect when prices did not change, and no mix for a pure volume change', () => {
    const d = decompose(
      [bucket('a', 20, 2000), bucket('b', 20, 6000)],
      [bucket('a', 10, 1000), bucket('b', 10, 3000)],
    );
    expect(d).toMatchObject({ delta: 4000, volume: 4000, mix: 0, price: 0, range: 0 });
  });

  it('separates a shift toward the dearer item as mix', () => {
    const d = decompose(
      [bucket('a', 5, 500), bucket('b', 15, 4500)],
      [bucket('a', 10, 1000), bucket('b', 10, 3000)],
    );
    expect(d.volume).toBe(0);
    expect(d.mix).toBe(1000);
    expect(d.price).toBe(0);
  });
});
const round = (n: number) => Math.round(n * 100) / 100;

describe('period comparison', () => {
  // 2026-09-14 is a Monday.
  const sales = [
    sale('1', '2026-09-14', '2026-09-14T15:00:00.000Z', 'a', 2, 2000, 600),
    sale('2', '2026-09-14', '2026-09-14T17:30:00.000Z', 'b', 1, 1500, 500),
    sale('3', '2026-09-21', '2026-09-21T15:10:00.000Z', 'a', 3, 3300, 900),
    // Entered later for the day before: the hour is unknown.
    sale('4', '2026-09-20', '2026-09-22T10:00:00.000Z', 'a', 1, 1000, 300),
    sale('5', '2026-09-21', '2026-09-21T16:00:00.000Z', 'a', 1, 1100, 300, { voided: true }),
    sale('6', '2026-09-21', '2026-09-21T16:30:00.000Z', 'vodka', 100, 900, 200, {
      kind: 'alcohol',
      productId: 'vodka',
    }),
  ];
  const base = periodFromSales(sales, '2026-09-14', '2026-09-20');
  const current = periodFromSales(sales, '2026-09-21', '2026-09-27');

  it('matches the report totals of each period', () => {
    const result = compare(current, base);
    for (const [totals, [from, to]] of [
      [result.current, ['2026-09-21', '2026-09-27']],
      [result.base, ['2026-09-14', '2026-09-20']],
    ] as const) {
      const rows = groupSales(sales.filter((s) => !s.voided && s.date >= from && s.date <= to));
      expect(totals.revenue).toBe(round(rows.reduce((n, r) => n + r.revenue, 0)));
      expect(totals.cost).toBe(round(rows.reduce((n, r) => n + r.cost, 0)));
    }
    expect(result.current.revenue).toBe(4200);
    expect(result.base.revenue).toBe(4500);
    expect(
      round(
        result.decomposition.volume +
          result.decomposition.mix +
          result.decomposition.price +
          result.decomposition.range,
      ),
    ).toBe(-300);
  });

  it('adds every dimension up to the totals', () => {
    const result = compare(current, base);
    for (const dimension of [result.weekdays, result.hours, result.categories]) {
      expect(round(dimension.reduce((n, r) => n + r.current.revenue, 0))).toBe(result.current.revenue);
      expect(round(dimension.reduce((n, r) => n + r.base.revenue, 0))).toBe(result.base.revenue);
    }
    // Yerevan is UTC+4: 15:00Z is 19:00, and a late entry has no hour.
    expect(result.hours.map((r) => r.key)).toEqual(['19', '20', '21', 'unknown']);
    expect(result.weekdays.map((r) => [r.key, r.current.workedDays, r.base.workedDays])).toEqual([
      ['1', 1, 1],
      ['7', 0, 1],
    ]);
    expect(result.categories.map((r) => r.key).sort()).toEqual(['alcohol', 'cocktail']);
  });

  it('counts poured alcohol in standard portions and business days from 06:00', () => {
    expect(current.products.find((p) => p.key === 'alcohol:vodka')!.units).toBe(2);
    expect(weekdayOf('2026-09-20')).toBe(7);
    expect(saleHour(sales[3])).toBe('unknown');
    expect(saleHour(sales[0])).toBe('19');
  });
});

describe('change in percent', () => {
  it('rounds to one decimal and has no percent against an empty base', () => {
    expect(changePct(6600, 4400)).toBe(50);
    expect(changePct(3000, 4000)).toBe(-25);
    expect(changePct(1000, 3000)).toBe(-66.7);
    expect(changePct(500, 500)).toBe(0);
    expect(changePct(500, 0)).toBeNull();
  });
});

describe('base period', () => {
  const period = { from: '2026-09-08', to: '2026-09-14' };
  it('offers the previous period of the same length, a week or a year earlier, or the chosen dates', () => {
    expect(basePeriod('previous', period)).toEqual({ from: '2026-09-01', to: '2026-09-07' });
    expect(basePeriod('week', period)).toEqual({ from: '2026-09-01', to: '2026-09-07' });
    expect(basePeriod('year', period)).toEqual({ from: '2025-09-08', to: '2025-09-14' });
    expect(basePeriod('custom', period, { from: '2026-01-01', to: '2026-01-31' })).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(basePeriod('previous', { from: '2026-09-01', to: '2026-09-30' })).toEqual({
      from: '2026-08-02',
      to: '2026-08-31',
    });
  });
});
