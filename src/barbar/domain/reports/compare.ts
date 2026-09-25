import { barConfig } from '../../config';
import { BUSINESS_DAY_START_HOUR, BUSINESS_TIME_ZONE } from '../business-day';
import { round } from '../money';
import type { Sale } from '../types';

/** Sales of a group in one period; `units` counts portions (poured alcohol in standard portions). */
export interface Bucket {
  key: string;
  label: string;
  units: number;
  operations: number;
  revenue: number;
  cost: number;
}
export interface PeriodData {
  from: string;
  to: string;
  /** Business days of the period with at least one active sale. */
  days: string[];
  /** Operations whose cost is unknown (no purchase price yet): the profit is overstated by them. */
  unknownCostOperations: number;
  products: Bucket[];
  weekdays: Bucket[];
  /** `00`–`23` in Yerevan time; `unknown` for sales entered after the day. */
  hours: Bucket[];
  categories: Bucket[];
}
export interface Totals {
  units: number;
  operations: number;
  revenue: number;
  cost: number;
  profit: number;
  workedDays: number;
  revenuePerDay: number;
}
export interface CompareRow {
  key: string;
  label: string;
  current: Totals;
  base: Totals;
  revenueDelta: number;
  profitDelta: number;
  /** Percent change of revenue; null when the base is zero. */
  revenuePct: number | null;
}
export interface Decomposition {
  /** ΔRevenue = volume + mix + price + range. */
  delta: number;
  /** More or fewer portions of the items sold in both periods, at the base average price. */
  volume: number;
  /** Shift between cheaper and dearer items sold in both periods. */
  mix: number;
  /** Price changes of the items sold in both periods, at current quantities. */
  price: number;
  /** Items sold only in the current period minus items sold only in the base. */
  range: number;
}
export interface Comparison {
  current: Totals;
  base: Totals;
  decomposition: Decomposition;
  weekdays: CompareRow[];
  hours: CompareRow[];
  categories: CompareRow[];
  unknownCostOperations: { current: number; base: number };
}

export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const empty = (): Totals => ({
  units: 0,
  operations: 0,
  revenue: 0,
  cost: 0,
  profit: 0,
  workedDays: 0,
  revenuePerDay: 0,
});
const sum = (buckets: Bucket[], workedDays: number): Totals => {
  const t = empty();
  for (const b of buckets) {
    t.units += b.units;
    t.operations += b.operations;
    t.revenue += b.revenue;
    t.cost += b.cost;
  }
  t.revenue = round(t.revenue);
  t.cost = round(t.cost);
  t.units = round(t.units);
  t.profit = round(t.revenue - t.cost);
  t.workedDays = workedDays;
  t.revenuePerDay = workedDays ? round(t.revenue / workedDays) : 0;
  return t;
};

/** Splits the revenue change into volume, mix, price and range effects that add up exactly. */
export function decompose(current: Bucket[], base: Bucket[]): Decomposition {
  const before = new Map(base.filter((b) => b.units > 0).map((b) => [b.key, b]));
  const after = new Map(current.filter((b) => b.units > 0).map((b) => [b.key, b]));
  let q0 = 0,
    q1 = 0,
    r0 = 0,
    r1 = 0,
    atOldPrice = 0,
    added = 0,
    dropped = 0;
  for (const [key, now] of after) {
    const old = before.get(key);
    if (!old) {
      added += now.revenue;
      continue;
    }
    q0 += old.units;
    q1 += now.units;
    r0 += old.revenue;
    r1 += now.revenue;
    atOldPrice += now.units * (old.revenue / old.units);
  }
  for (const [key, old] of before) if (!after.has(key)) dropped += old.revenue;
  const totalNow = current.reduce((s, b) => s + b.revenue, 0);
  const totalBefore = base.reduce((s, b) => s + b.revenue, 0);
  const delta = round(totalNow - totalBefore);
  const volume = q0 ? round((q1 - q0) * (r0 / q0)) : 0;
  const price = round(r1 - atOldPrice);
  const range = round(added - dropped);
  // Mix is what is left of the change: it makes the four effects add up to the cent.
  return { delta, volume, price, range, mix: round(delta - volume - price - range) };
}

/** Change against the base in percent to one decimal; null when the base is zero. */
export const changePct = (now: number, before: number): number | null =>
  before ? Math.round(((now - before) / before) * 1000) / 10 : null;

const row = (
  key: string,
  label: string,
  now: Bucket | undefined,
  old: Bucket | undefined,
  nowDays: number,
  oldDays: number,
): CompareRow => {
  const current = sum(now ? [now] : [], nowDays);
  const base = sum(old ? [old] : [], oldDays);
  return {
    key,
    label,
    current,
    base,
    revenueDelta: round(current.revenue - base.revenue),
    profitDelta: round(current.profit - base.profit),
    revenuePct: changePct(current.revenue, base.revenue),
  };
};
function rows(
  current: Bucket[],
  base: Bucket[],
  days: (key: string) => [number, number],
  order?: (a: string, b: string) => number,
) {
  const now = new Map(current.map((b) => [b.key, b]));
  const old = new Map(base.map((b) => [b.key, b]));
  const keys = [...new Set([...now.keys(), ...old.keys()])].sort(order);
  return keys.map((key) => {
    const [a, b] = days(key);
    return row(key, (now.get(key) || old.get(key))!.label, now.get(key), old.get(key), a, b);
  });
}
const hourOrder = (a: string, b: string) => (a === 'unknown' ? 1 : b === 'unknown' ? -1 : a.localeCompare(b));

/** Compares a period with a base period; every total is the sum of the same buckets the report groups. */
export function compare(current: PeriodData, base: PeriodData): Comparison {
  const workedOn = (period: PeriodData, weekday: string) =>
    period.days.filter((d) => String(weekdayOf(d)) === weekday).length;
  return {
    current: sum(current.products, current.days.length),
    base: sum(base.products, base.days.length),
    decomposition: decompose(current.products, base.products),
    weekdays: rows(current.weekdays, base.weekdays, (k) => [workedOn(current, k), workedOn(base, k)]),
    hours: rows(current.hours, base.hours, () => [current.days.length, base.days.length], hourOrder),
    categories: rows(current.categories, base.categories, () => [current.days.length, base.days.length]),
    unknownCostOperations: { current: current.unknownCostOperations, base: base.unknownCostOperations },
  };
}

const yerevan = new Intl.DateTimeFormat('sv-SE', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});
/** Hour (`00`–`23`, Yerevan) a sale was rung up, or `unknown` when it was entered after its business day. */
export function saleHour(sale: Pick<Sale, 'date' | 'createdAt'>) {
  const at = Date.parse(sale.createdAt);
  if (!Number.isFinite(at)) return 'unknown';
  const parts = Object.fromEntries(yerevan.formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  const day = new Date(at - BUSINESS_DAY_START_HOUR * 3600000);
  const businessDay = new Intl.DateTimeFormat('sv-SE', { timeZone: BUSINESS_TIME_ZONE }).format(day);
  return businessDay === sale.date ? String(parts.hour).padStart(2, '0') : 'unknown';
}
/** Portions of a sale: poured alcohol is counted in standard portions so units add up across items. */
export const saleUnits = (sale: Pick<Sale, 'kind' | 'quantity'>) =>
  sale.kind === 'alcohol' ? sale.quantity / barConfig.guest.pouredAlcohol.portionMl : sale.quantity;
export const saleCategory = (sale: Pick<Sale, 'kind' | 'category'>) =>
  sale.kind === 'alcohol' ? 'alcohol' : sale.category || 'cocktail';

/** The same buckets the server builds, from the sales of a complete local ledger. */
export function periodFromSales(sales: Sale[], from: string, to: string): PeriodData {
  const groups = (key: (s: Sale) => string, label: (s: Sale) => string) => {
    const map = new Map<string, Bucket>();
    for (const s of sales) {
      if (s.voided || s.date < from || s.date > to) continue;
      const k = key(s);
      const b = map.get(k) || { key: k, label: label(s), units: 0, operations: 0, revenue: 0, cost: 0 };
      b.units += saleUnits(s);
      b.operations += 1;
      b.revenue += s.revenue;
      b.cost += s.cost;
      map.set(k, b);
    }
    return [...map.values()];
  };
  const active = sales.filter((s) => !s.voided && s.date >= from && s.date <= to);
  const known = (s: Sale) =>
    s.cost > 0 && s.ingredients.every((i) => i.cost > 0) && (s.extraCosts || []).every((e) => e.cost > 0);
  return {
    from,
    to,
    days: [...new Set(active.map((s) => s.date))].sort(),
    unknownCostOperations: active.filter((s) => !known(s)).length,
    products: groups(
      (s) => `${s.kind}:${s.productId}`,
      (s) => s.name,
    ),
    weekdays: groups(
      (s) => String(weekdayOf(s.date)),
      (s) => String(weekdayOf(s.date)),
    ),
    hours: groups(saleHour, saleHour),
    categories: groups(saleCategory, saleCategory),
  };
}

export type BaseKind = 'previous' | 'week' | 'year' | 'custom';
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/**
 * The base period for a comparison: the period just before it and of the same length, the same days a week
 * or a year earlier, or the dates the user chose.
 */
export function basePeriod(
  kind: BaseKind,
  period: { from: string; to: string },
  custom?: { from: string; to: string },
) {
  const length = span(period.from, period.to);
  if (kind === 'custom' && custom) return custom;
  if (kind === 'week') return { from: addDays(period.from, -7), to: addDays(period.to, -7) };
  if (kind === 'year') {
    const back = (date: string) => {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      return d.toISOString().slice(0, 10);
    };
    return { from: back(period.from), to: back(period.to) };
  }
  return { from: addDays(period.from, -length), to: addDays(period.from, -1) };
}
const span = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
