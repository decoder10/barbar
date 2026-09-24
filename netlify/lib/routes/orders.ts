import { shiftPreview, paidOrderTotals } from '../../../src/barbar/domain/shifts';
import { businessToday } from '../../../src/barbar/domain/business-day';
import { HttpError } from '../http';
import { ordersSnapshot } from '../../../src/barbar/domain/orders';
import { staffSale } from '../barbar-access';
import { json, type Role } from '../barbar-auth';
import type { UserProfile } from '../../../src/barbar/domain/identity/user';
import type { Order, Sale } from '../../../src/barbar/domain/types';
import type { OrdersSnapshot, Repository } from '../barbar-repository';

/** The tables board: every table, every open receipt and its active lines, shaped for the role. */
export async function handleOrders(request: Request, repository: Repository, role: Role) {
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  let snapshot: OrdersSnapshot;
  if (repository.readOrders) snapshot = await repository.readOrders();
  else {
    const full = await repository.read();
    snapshot = { revision: full.revision, ...ordersSnapshot(full.data) };
  }
  return json({
    role,
    revision: snapshot.revision,
    tables: snapshot.tables,
    orders: snapshot.orders,
    // Workers read the same lines the day summary shows: no costs, no ingredients.
    sales: role === 'admin' ? snapshot.sales : snapshot.sales.map(staffSale),
  });
}

export async function handleShifts(request: Request, repository: Repository, role: Role) {
  if (request.method !== 'GET') throw new HttpError('Метод не поддерживается.', 405);
  const params = new URL(request.url).searchParams;
  const from = params.get('from') || businessToday();
  const to = params.get('to') || from;
  if (
    ![from, to].every(
      (d) =>
        /^\d{4}-\d{2}-\d{2}$/.test(d) &&
        Number.isFinite(Date.parse(d)) &&
        new Date(d).toISOString().slice(0, 10) === d,
    ) ||
    from > to ||
    to > businessToday()
  )
    throw new HttpError('Проверьте день смены.');
  if (role !== 'admin' && from !== to) throw new HttpError('Отчёты доступны только владельцу.', 403);
  if (repository.readShifts) return json(await repository.readShifts(from, to));
  const { data } = await repository.read();
  const orders = (data.orders || []).filter((o) => o.businessDay >= from && o.businessDay <= to);
  return json({
    preview: shiftPreview(orders, from),
    totals: paidOrderTotals(orders),
    shifts: (data.shifts || []).filter((s) => s.businessDay >= from && s.businessDay <= to),
  });
}
export async function handleGuestRequests(request: Request, repository: Repository) {
  if (request.method !== 'GET') throw new HttpError('Метод не поддерживается.', 405);
  if (!repository.readGuestRequests) throw new HttpError('Заявки временно недоступны.', 503);
  return json({ requests: await repository.readGuestRequests() });
}

const identifier = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s);
/**
 * Paid receipts to repeat: the asking user's own (`scope=mine`, by the session, never by a parameter) or
 * one table's. Workers get lines through `staffSale` and no payments.
 */
export async function handleRecentOrders(
  request: Request,
  repository: Repository,
  role: Role,
  user: UserProfile,
) {
  if (request.method !== 'GET') throw new HttpError('Метод не поддерживается.', 405);
  const params = new URL(request.url).searchParams;
  const scope = params.get('scope');
  const tableId = params.get('tableId') || undefined;
  const limit = Number(params.get('limit') || 20);
  if (
    (scope !== 'mine' && scope !== 'table') ||
    (scope === 'table' && !identifier(tableId)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw new HttpError('Проверьте запрос истории заказов.');
  let found: { orders: Order[]; sales: Sale[] };
  if (repository.readRecentOrders)
    found = await repository.readRecentOrders({ scope, userId: user.id, tableId, limit });
  else {
    const { data } = await repository.read();
    const orders = (data.orders || [])
      .filter(
        (o) => o.status === 'paid' && (scope === 'mine' ? o.openedBy?.id === user.id : o.tableId === tableId),
      )
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .slice(0, limit);
    const ids = new Set(orders.map((o) => o.id));
    found = { orders, sales: data.sales.filter((s) => s.orderId && ids.has(s.orderId) && !s.voided) };
  }
  const lines = new Map<string, Sale[]>();
  for (const sale of found.sales)
    if (sale.orderId) lines.set(sale.orderId, [...(lines.get(sale.orderId) || []), sale]);
  return json({
    orders: found.orders.map((o) => ({
      id: o.id,
      ...(o.tableId ? { tableId: o.tableId } : {}),
      businessDay: o.businessDay,
      openedAt: o.openedAt,
      ...(o.closedAt ? { closedAt: o.closedAt } : {}),
      ...(o.total !== undefined ? { total: o.total } : {}),
      lines: (lines.get(o.id) || [])
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map((sale) => (role === 'admin' ? sale : staffSale(sale))),
    })),
  });
}
