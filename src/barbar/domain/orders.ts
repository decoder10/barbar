import { barConfig } from '../config';
import { round } from './money';
import type { BarTable, Order, OrderPayment, Sale } from './types';

export const paymentMethods = barConfig.payments.methods;
const methodById = new Map(paymentMethods.map((m) => [m.id, m]));
export const paymentMethod = (id: unknown) => (typeof id === 'string' ? methodById.get(id) : undefined);
export const cashQuickAmounts = barConfig.payments.cashQuickAmounts;
export const maxSplitParts = barConfig.payments.maxSplitParts;

type Line = Pick<Sale, 'id' | 'orderId' | 'voided' | 'revenue' | 'createdAt'>;
/** Active lines of one order (or of every order when `orderId` is omitted), in the order they were added. */
export const orderLines = <T extends Line>(sales: T[], orderId: string | undefined) =>
  sales
    .filter((s) => !!s.orderId && (orderId === undefined || s.orderId === orderId) && !s.voided)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
export const orderTotal = (lines: Pick<Sale, 'revenue'>[]) =>
  round(lines.reduce((sum, line) => sum + (line.revenue || 0), 0));
/** How many things are on the receipt: menu portions count each, a poured volume counts once. */
export const receiptCount = (lines: Pick<Sale, 'kind' | 'quantity'>[]) =>
  lines.reduce((sum, line) => sum + (line.kind === 'cocktail' ? line.quantity : 1), 0);
export const openOrders = (orders: Order[] | undefined) => (orders || []).filter((o) => o.status === 'open');
export const openOrderAt = (orders: Order[] | undefined, tableId: string) =>
  openOrders(orders).find((o) => o.tableId === tableId);
/** The tables board from a ledger or a board response: every table, the open receipts and their active lines. */
export function ordersSnapshot<S extends Pick<Sale, 'id' | 'orderId' | 'voided'>>(data: {
  tables?: BarTable[];
  orders?: Order[];
  sales: S[];
}) {
  const orders = openOrders(data.orders);
  const ids = new Set(orders.map((o) => o.id));
  return {
    tables: [...(data.tables || [])].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    orders,
    sales: data.sales.filter((s) => s.orderId && ids.has(s.orderId) && !s.voided),
  };
}

/** Anything the receipt can group: a sale, a worker's sale projection or a server sales group. */
export interface ReceiptRow {
  kind: Sale['kind'];
  productId: string;
  name: string;
  quantity: number;
  revenue?: number;
  unit?: Sale['unit'];
  category?: Sale['category'];
  servingMl?: number;
}
/** Lines grouped by what was poured: the receipt shows «Негрони × 3», not three rows. */
export interface ReceiptGroup<T extends ReceiptRow = ReceiptRow> {
  key: string;
  name: string;
  quantity: number;
  revenue: number;
  unit?: Sale['unit'];
  category?: Sale['category'];
  kind: Sale['kind'];
  servingMl?: number;
  /** The most recently added row of the group: «−» removes it first. */
  latest: T;
}
export function groupReceipt<T extends ReceiptRow>(lines: T[]): ReceiptGroup<T>[] {
  const groups = new Map<string, ReceiptGroup<T>>();
  for (const row of lines) {
    const key = `${row.kind}:${row.productId}:${row.unit || ''}:${row.servingMl || ''}`;
    const group = groups.get(key) || {
      key,
      name: row.name,
      quantity: 0,
      revenue: 0,
      unit: row.unit,
      category: row.category,
      kind: row.kind,
      servingMl: row.servingMl,
      latest: row,
    };
    group.quantity += row.quantity;
    group.revenue = round(group.revenue + (row.revenue || 0));
    group.latest = row;
    groups.set(key, group);
  }
  return [...groups.values()];
}

export const paymentsTotal = (payments: Pick<OrderPayment, 'amount'>[]) =>
  round(payments.reduce((sum, p) => sum + p.amount, 0));
/** Change due for a cash-like payment, never negative. */
export const changeDue = (payment: Pick<OrderPayment, 'amount' | 'receivedCash'>) =>
  payment.receivedCash === undefined ? 0 : Math.max(0, round(payment.receivedCash - payment.amount));

/** Equal parts that add up exactly to the total: the last part absorbs the rounding. */
export function splitEvenly(total: number, parts: number) {
  const share = Math.floor((total / parts) * 100) / 100;
  const amounts = Array.from({ length: parts }, () => share);
  amounts[parts - 1] = round(total - share * (parts - 1));
  return amounts;
}
