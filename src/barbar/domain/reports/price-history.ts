import { businessDaysBefore } from '../business-day';
import { round } from '../money';

/** Longest window before and after a price change. */
export const priceWindowDays = 14;
export interface DaySales {
  date: string;
  operations: number;
  units: number;
  revenue: number;
  cost: number;
}
export interface PriceWindow {
  from: string;
  to: string;
}
export interface WindowStats extends PriceWindow {
  days: number;
  /** Days of the window with a sale of this item. */
  salesDays: number;
  /** Days the bar was open (any sale). */
  workedDays: number | null;
  /** Worked days with every ingredient in stock; null when the item has no ingredients to check. */
  availableDays: number | null;
  operations: number;
  units: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  /** Average price actually charged; null without sales. */
  averagePrice: number | null;
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const addDays = (date: string, n: number) => businessDaysBefore(date, -n);

/**
 * Equal windows around a change: the days before and after it, without the change day (both prices were
 * in force). They stop short of the previous and next change of the same item and of today.
 * Null when there is no full day on either side.
 */
export function priceWindows(
  changeDate: string,
  otherChangeDates: string[],
  today: string,
  maximum = priceWindowDays,
): { length: number; before: PriceWindow; after: PriceWindow } | null {
  const before = otherChangeDates.filter((d) => d <= changeDate);
  const after = otherChangeDates.filter((d) => d > changeDate);
  const gaps = [
    ...before.map((d) => daysBetween(d, changeDate) - 1),
    ...after.map((d) => daysBetween(changeDate, d) - 1),
  ];
  const length = Math.min(maximum, daysBetween(changeDate, today), ...gaps);
  if (length < 1) return null;
  return {
    length,
    before: { from: addDays(changeDate, -length), to: addDays(changeDate, -1) },
    after: { from: addDays(changeDate, 1), to: addDays(changeDate, length) },
  };
}

/** Totals of one window from the item's daily sales; `workedDates` are the days the bar sold anything. */
export function windowStats(
  window: PriceWindow,
  sales: DaySales[],
  workedDates: Iterable<string>,
  availableDays: number | null,
): WindowStats {
  const inside = sales.filter((d) => d.date >= window.from && d.date <= window.to);
  const revenue = round(inside.reduce((s, d) => s + d.revenue, 0));
  const cost = round(inside.reduce((s, d) => s + d.cost, 0));
  const units = round(inside.reduce((s, d) => s + d.units, 0));
  const worked = [...new Set(workedDates)].filter((d) => d >= window.from && d <= window.to);
  return {
    ...window,
    days: daysBetween(window.from, window.to) + 1,
    salesDays: new Set(inside.map((d) => d.date)).size,
    workedDays: worked.length,
    availableDays,
    operations: inside.reduce((s, d) => s + d.operations, 0),
    units,
    revenue,
    cost,
    grossProfit: round(revenue - cost),
    averagePrice: units > 0 ? round(revenue / units) : null,
  };
}
