import { describe, expect, it } from 'vitest';
import { businessToday } from '../../business-day';
import { initialData } from '../../model';
import { purchaseForecast } from '../purchasing';
import type { BarData } from '../../types';

const day = (offset: number) =>
  new Date(Date.parse(`${businessToday()}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

describe('purchase forecast with stock-outs and closed days', () => {
  it('divides use by open days with stock instead of calendar days', () => {
    const data: BarData = { ...initialData(), sales: [] };
    data.purchases = [{ id: 'gin-in', alcoholId: 'gin', date: day(-9), ml: 100, costPerLiter: 9000 }];
    const sale = (id: string, date: string, alcoholId: string, ml: number) => ({
      id,
      date,
      createdAt: `${date}T18:00:00.000Z`,
      kind: 'alcohol' as const,
      productId: alcoholId,
      name: alcoholId,
      quantity: ml,
      revenue: ml * 20,
      cost: 0,
      ingredients: [{ alcoholId, ml, cost: 0 }],
      voided: false,
    });
    // Ten calendar days, five open days. Gin sold out after the first two open days.
    data.sales = [
      sale('a', day(-9), 'gin', 50),
      sale('b', day(-8), 'gin', 50),
      sale('c', day(-5), 'vodka', 0.01),
      sale('d', day(-3), 'vodka', 0.01),
      sale('e', day(-1), 'vodka', 0.01),
    ];
    data.purchases.push({ id: 'vodka-in', alcoholId: 'vodka', date: day(-9), ml: 1, costPerLiter: 1 });
    const gin = purchaseForecast(data, day(-9), day(0), 3, 4).find((r) => r.id === 'gin')!;
    expect(gin).toMatchObject({ consumed: 100, workedDays: 5, availableDays: 2, stockoutDays: 3 });
    expect(gin.daily).toBe(50);
    expect(gin.insufficientHistory).toBe(true);
  });
});
