import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCommand, initialData, validateData } from '../model';
import { paidOrderTotals, shiftPreview } from '../shifts';
import { businessToday } from '../business-day';
import type { BarData, Command } from '../types';
function fixture() {
  let data = initialData();
  data = applyCommand(data, {
    id: 'plain',
    type: 'cocktail',
    value: { id: 'plain', name: 'Tea', ingredients: [], price: 100, image: 0, noIngredients: true },
  });
  data = applyCommand(data, { id: 'order', type: 'openOrder' });
  return applyCommand(data, {
    id: 'sale',
    type: 'sale',
    value: { kind: 'cocktail', productId: 'plain', quantity: 2, orderId: 'order', date: businessToday() },
  });
}
const pay = (data: BarData) =>
  applyCommand(data, {
    id: 'pay',
    type: 'payOrder',
    orderId: 'order',
    expectedTotal: 200,
    payments: [
      { method: 'cash', amount: 80, receivedCash: 100 },
      { method: 'card', amount: 120 },
    ],
  });
const closing = (data: BarData, day = businessToday()): Command => ({
  id: 'close',
  type: 'closeShift',
  businessDay: day,
  expected: shiftPreview(data.orders || [], day).expected,
  countedCash: 75,
});
afterEach(() => vi.useRealTimers());
describe('shifts', () => {
  it('blocks open orders and stale previews, counts split receipts once and freezes cash differences', () => {
    const open = fixture();
    expect(() => applyCommand(open, closing(open))).toThrow(/открытые заказы/);
    const paid = pay(open);
    expect(() => applyCommand(paid, closing(open))).toThrow(/изменились/);
    expect(paidOrderTotals(paid.orders!)).toEqual({
      count: 1,
      revenue: 200,
      average: 200,
      payments: { cash: 80, card: 120, transfer: 0, idram: 0 },
    });
    const command = closing(paid);
    const closed = applyCommand(paid, command);
    expect(closed.shifts![0]).toMatchObject({ count: 1, countedCash: 75, difference: -5 });
    expect(applyCommand(closed, command)).toBe(closed);
    expect(() => applyCommand(closed, { ...command, id: 'other' })).toThrow(/уже закрыта/);
    expect(() => applyCommand(closed, { id: 'new', type: 'openOrder' })).toThrow(/Смена закрыта/);
    expect(() => applyCommand(closed, { id: 'void', type: 'void', saleId: 'sale' })).toThrow(/Смена закрыта/);
    expect(validateData(closed).shifts).toEqual(closed.shifts);
    expect(validateData(initialData()).shifts).toBeUndefined();
    expect(() => validateData({ ...closed, shifts: [...closed.shifts!, ...closed.shifts!] })).toThrow(
      /смены/,
    );
  });
  it('keeps payments after 06:00 in the opening day and leaves sale dates intact', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T01:59:00Z'));
    const open = fixture();
    expect(open.orders![0].businessDay).toBe('2026-09-20');
    vi.setSystemTime(new Date('2026-09-21T02:01:00Z'));
    const paid = pay(open);
    const closed = applyCommand(paid, closing(paid, '2026-09-20'));
    expect(closed.sales[0].date).toBe(open.sales[0].date);
    expect(closed.shifts![0].businessDay).toBe('2026-09-20');
    expect(shiftPreview(paid.orders!, businessToday()).count).toBe(0);
    expect(() =>
      applyCommand(closed, {
        id: 'backdated',
        type: 'sale',
        value: {
          kind: 'cocktail',
          productId: 'plain',
          quantity: 1,
          date: '2026-09-20',
          businessDay: 'yes' as unknown as boolean,
        },
      }),
    ).toThrow(/Смена закрыта/);
  });
  it('excludes standalone sales, rejects paid-order cancellation and malformed backup shifts', () => {
    const data = pay(fixture());
    expect(() => applyCommand(data, { id: 'void', type: 'void', saleId: 'sale' })).toThrow(
      /Оплаченный заказ/,
    );
    data.sales.push({ ...data.sales[0], id: 'standalone', orderId: undefined });
    expect(paidOrderTotals(data.orders!).count).toBe(1);
    const closed = applyCommand(data, closing(data));
    expect(() => validateData({ ...closed, shifts: [{ ...closed.shifts![0], difference: 999 }] })).toThrow(
      /смены/,
    );
  });
});
