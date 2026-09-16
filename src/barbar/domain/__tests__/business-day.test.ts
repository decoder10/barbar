import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureData } from '../../../../tests/fixtures';
import { businessDaysBefore, businessToday } from '../business-day';
import { applyCommand } from '../model';
afterEach(() => vi.useRealTimers());
describe('Yerevan business date starts at 06:00', () => {
  it.each([
    ['2026-09-13T19:59:59Z', '2026-09-13'],
    ['2026-09-13T20:00:00Z', '2026-09-13'],
    ['2026-09-13T23:00:00Z', '2026-09-13'],
    ['2026-09-14T01:59:59Z', '2026-09-13'],
    ['2026-09-14T02:00:00Z', '2026-09-14'],
    ['2027-01-01T01:59:59Z', '2026-12-31'],
    ['2028-03-01T01:59:59Z', '2028-02-29'],
  ])('%s belongs to %s', (instant, expected) => expect(businessToday(new Date(instant))).toBe(expected));
  it.each([
    ['2026-09-16', 29, '2026-08-18'],
    ['2026-03-01', 1, '2026-02-28'],
    ['2028-03-01', 1, '2028-02-29'],
    ['2027-01-01', 29, '2026-12-03'],
    ['2026-09-16', 0, '2026-09-16'],
  ])('the window ending on %s spans %i days back to %s', (date, days, expected) =>
    expect(businessDaysBefore(date, days)).toBe(expected),
  );
  it('uses server time for live sales, preserves explicit historical dates and idempotent retries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T01:59:00Z'));
    const data = fixtureData();
    data.purchases = data.purchases.map((p) => ({ ...p, date: '2026-09-01' }));
    const command = {
      type: 'sale' as const,
      id: 'night-sale',
      value: {
        kind: 'cocktail' as const,
        productId: data.cocktails[0].id,
        quantity: 1,
        date: '2026-09-14',
        businessDay: true,
      },
    };
    const saved = applyCommand(data, command);
    expect(saved.sales.at(-1)).toMatchObject({ date: '2026-09-13', createdAt: '2026-09-14T01:59:00.000Z' });
    vi.setSystemTime(new Date('2026-09-14T02:00:01Z'));
    expect(applyCommand(saved, command)).toBe(saved);
    const newShift = applyCommand(saved, { ...command, id: 'next-shift' });
    expect(newShift.sales.at(-1)?.date).toBe('2026-09-14');
    const historical = applyCommand(newShift, {
      ...command,
      id: 'historical',
      value: { ...command.value, date: '2026-09-12', businessDay: false },
    });
    expect(historical.sales.at(-1)?.date).toBe('2026-09-12');
  });
});
