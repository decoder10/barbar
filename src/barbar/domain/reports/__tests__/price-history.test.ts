import { describe, expect, it } from 'vitest';
import { priceWindows, windowStats } from '../price-history';

describe('price change windows', () => {
  it('uses equal windows without the change day, at most 14 days', () => {
    const w = priceWindows('2026-09-01', [], '2026-09-30')!;
    expect(w.length).toBe(14);
    expect(w.before).toEqual({ from: '2026-08-18', to: '2026-08-31' });
    expect(w.after).toEqual({ from: '2026-09-02', to: '2026-09-15' });
  });
  it('stops short of today and of the neighbouring changes of the same item', () => {
    expect(priceWindows('2026-09-20', [], '2026-09-24')!.length).toBe(4);
    // Next change on the 9th: the days 2–8 are a clean «after» of 7 days.
    expect(priceWindows('2026-09-01', ['2026-09-09'], '2026-09-30')!.length).toBe(7);
    expect(priceWindows('2026-09-10', ['2026-09-08', '2026-09-30'], '2026-09-30')!.length).toBe(1);
  });
  it('has no windows without a full day on either side', () => {
    expect(priceWindows('2026-09-24', [], '2026-09-24')).toBeNull();
    expect(priceWindows('2026-09-10', ['2026-09-10'], '2026-09-24')).toBeNull();
    expect(priceWindows('2026-09-10', ['2026-09-11'], '2026-09-24')).toBeNull();
  });
});

describe('window totals', () => {
  it('sums the days inside the window and reports the price actually charged', () => {
    const days = [
      { date: '2026-08-31', operations: 2, units: 2, revenue: 2000, cost: 600 },
      { date: '2026-09-02', operations: 3, units: 3, revenue: 3600, cost: 900 },
      { date: '2026-09-20', operations: 1, units: 1, revenue: 1200, cost: 300 },
    ];
    const after = windowStats(
      { from: '2026-09-02', to: '2026-09-15' },
      days,
      ['2026-09-02', '2026-09-03', '2026-09-20'],
      1,
    );
    expect(after).toMatchObject({
      days: 14,
      salesDays: 1,
      workedDays: 2,
      availableDays: 1,
      units: 3,
      revenue: 3600,
      grossProfit: 2700,
      averagePrice: 1200,
    });
    const none = windowStats({ from: '2026-09-05', to: '2026-09-06' }, days, [], null);
    expect(none).toMatchObject({ revenue: 0, averagePrice: null, salesDays: 0 });
  });
});
