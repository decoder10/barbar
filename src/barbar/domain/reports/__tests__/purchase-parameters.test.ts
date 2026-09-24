import { describe, expect, it } from 'vitest';
import { initialData } from '../../model';
import { explainForecast } from '../forecast-explanation';
import { forecastFromUsage } from '../purchasing';
import type { Availability } from '../availability';
import type { BarData } from '../../types';

/** A 10-day period, the bar open 8 days, `ml` used while the item was in stock 8 days. */
const setup = (
  extra: Partial<BarData['alcohol'][number]>,
  suppliers = [{ id: 's1', name: 'Опт', leadDays: 5 }],
) => {
  const data: BarData = { ...initialData(), sales: [], suppliers };
  data.alcohol = [
    {
      ...data.alcohol.find((a) => a.unit !== 'bottle')!,
      id: 'gin',
      name: 'Джин',
      unit: 'ml',
      category: 'alcohol',
      ...extra,
    },
  ];
  const availability = new Map<string, Availability>([
    ['gin', { workedDays: 8, availableDays: 8, stockoutDays: 0 }],
  ]);
  const rows = forecastFromUsage(
    data,
    '2026-09-01',
    '2026-09-10',
    3,
    4,
    new Map([['gin', 8000]]),
    new Set(),
    availability,
  );
  return rows[0];
};

describe('purchase parameters', () => {
  it('uses the general values and marks them as defaults', () => {
    const row = setup({}, []);
    // 1000 ml per open day × (8 open of 10 days) = 800 ml per calendar day; (3 + 4) days.
    expect(row).toMatchObject({
      daily: 1000,
      workShare: 0.8,
      expectedDaily: 800,
      leadDays: 3,
      leadSource: 'default',
      safetyDays: 4,
      safetySource: 'default',
      target: 5600,
    });
    expect(row.suggested).toBe(5600 - row.available);
  });

  it('prefers the item, then the supplier, then the general lead time', () => {
    expect(setup({ supplierId: 's1' })).toMatchObject({
      leadDays: 5,
      leadSource: 'supplier',
      supplierName: 'Опт',
    });
    expect(setup({ supplierId: 's1', leadDays: 1 })).toMatchObject({ leadDays: 1, leadSource: 'item' });
    expect(setup({ supplierId: 'gone' })).toMatchObject({
      leadDays: 3,
      leadSource: 'default',
      supplierName: null,
    });
  });

  it("adds the fixed safety stock and the item's own safety days", () => {
    const row = setup({ leadDays: 2, safetyDays: 1, safetyStock: 300 });
    expect(row).toMatchObject({ safetySource: 'item', safetyDays: 1, safetyStock: 300 });
    // 800 × 2 + 300 + 800 × 1 = 2700
    expect(row.target).toBe(2700);
  });

  it('does not inflate demand for closed days or stock-outs', () => {
    const data: BarData = { ...initialData(), sales: [] };
    data.alcohol = [{ ...data.alcohol[0], id: 'gin', name: 'Джин', unit: 'ml', category: 'alcohol' }];
    const availability = new Map<string, Availability>([
      ['gin', { workedDays: 4, availableDays: 2, stockoutDays: 2 }],
    ]);
    const [row] = forecastFromUsage(
      data,
      '2026-09-01',
      '2026-09-10',
      0,
      0,
      new Map([['gin', 1000]]),
      new Set(),
      availability,
    );
    // 1000 over 2 days with stock = 500 per open day; the bar was open 4 of 10 days.
    expect(row).toMatchObject({ daily: 500, workShare: 0.4, expectedDaily: 200, target: 0 });
  });
});

describe('forecast explanation', () => {
  it('writes the calculation with the parameters and where they came from', () => {
    const row = setup({ supplierId: 's1', safetyDays: 1, safetyStock: 300 });
    const text = explainForecast(row, 'мл');
    // 1000 per worked day × 0.8 × (5 + 1) days + 300 − stock
    expect(text.formula.startsWith('1000 мл/раб. день × 0.8 × (5 + 1) дн. + 300 мл − ')).toBe(true);
    expect(text.facts.find((f) => f.label === 'Срок поставки')!.value).toBe('5 дн. (у поставщика)');
    expect(text.facts.find((f) => f.label === 'Страховой запас')!.value).toContain('(у позиции)');
  });
});
