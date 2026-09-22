import { round } from './money';
import { businessToday } from './business-day';
import { paymentMethods } from './orders';
import type { BarData, CommandContext, Order, Shift } from './types';

/** Payment statistics count receipts, including split payments, by their opening business day. */
export function paidOrderTotals(orders: Order[]) {
  const paid = orders.filter((o) => o.status === 'paid');
  const payments = Object.fromEntries(paymentMethods.map((m) => [m.id, 0]));
  for (const order of paid)
    for (const p of order.payments || []) payments[p.method] = round((payments[p.method] || 0) + p.amount);
  const revenue = round(paid.reduce((sum, o) => sum + (o.total || 0), 0));
  return { count: paid.length, revenue, average: paid.length ? round(revenue / paid.length) : 0, payments };
}

/** Includes receipt identity and payment composition, so equal totals cannot conceal a stale screen. */
export function shiftPreview(orders: Order[], businessDay: string) {
  const dayOrders = orders.filter((o) => o.businessDay === businessDay);
  return {
    businessDay,
    ...paidOrderTotals(dayOrders),
    openCount: dayOrders.filter((o) => o.status === 'open').length,
    openOrders: dayOrders.filter((o) => o.status === 'open').map((o) => ({ id: o.id, tableId: o.tableId })),
    expected: JSON.stringify(
      dayOrders
        .map((o) => [o.id, o.status, o.total, o.payments])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ),
  };
}
export type ShiftPreview = ReturnType<typeof shiftPreview>;
export function closeShift(
  data: BarData,
  input: { id: string; businessDay: string; expected: string; countedCash: number },
  context: CommandContext,
): Shift {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.businessDay) ||
    !Number.isFinite(Date.parse(input.businessDay)) ||
    new Date(input.businessDay).toISOString().slice(0, 10) !== input.businessDay ||
    input.businessDay > businessToday()
  )
    throw new Error('Проверьте день смены.');
  if (data.shifts?.some((s) => s.businessDay === input.businessDay)) throw new Error('Смена уже закрыта.');
  const preview = shiftPreview(data.orders || [], input.businessDay);
  if (preview.openCount) throw new Error('Сначала закройте открытые заказы смены.');
  if (preview.expected !== input.expected) throw new Error('Итоги смены изменились. Обновите экран.');
  if (
    !Number.isFinite(input.countedCash) ||
    input.countedCash < 0 ||
    input.countedCash > 1e12 ||
    round(input.countedCash) !== input.countedCash
  )
    throw new Error('Проверьте сумму наличных.');
  return {
    id: input.id,
    businessDay: input.businessDay,
    closedAt: new Date().toISOString(),
    ...(context.actor ? { closedBy: { id: context.actor.id, fullName: context.actor.fullName } } : {}),
    count: preview.count,
    revenue: preview.revenue,
    payments: preview.payments,
    countedCash: input.countedCash,
    difference: round(input.countedCash - (preview.payments.cash || 0)),
  };
}
export function validShifts(shifts: unknown): shifts is Shift[] {
  if (!Array.isArray(shifts)) return false;
  const amount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e12;
  return (
    new Set(shifts.map((s) => s?.businessDay)).size === shifts.length &&
    new Set(shifts.map((s) => s?.id)).size === shifts.length &&
    shifts.every(
      (s) =>
        s &&
        typeof s.id === 'string' &&
        /^[a-zA-Z0-9_-]{1,80}$/.test(s.id) &&
        typeof s.businessDay === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(s.businessDay) &&
        Number.isFinite(Date.parse(s.businessDay)) &&
        new Date(s.businessDay).toISOString().slice(0, 10) === s.businessDay &&
        typeof s.closedAt === 'string' &&
        Number.isFinite(Date.parse(s.closedAt)) &&
        (!s.closedBy || (typeof s.closedBy.id === 'string' && typeof s.closedBy.fullName === 'string')) &&
        Number.isSafeInteger(s.count) &&
        s.count >= 0 &&
        amount(s.revenue) &&
        amount(s.countedCash) &&
        s.payments &&
        typeof s.payments === 'object' &&
        !Array.isArray(s.payments) &&
        Object.entries(s.payments).every(([k, v]) => paymentMethods.some((m) => m.id === k) && amount(v)) &&
        round(Object.values(s.payments as Record<string, number>).reduce((sum, n) => sum + n, 0)) ===
          s.revenue &&
        s.difference === round(s.countedCash - (s.payments.cash || 0)),
    )
  );
}
