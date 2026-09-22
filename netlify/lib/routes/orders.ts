import { shiftPreview, paidOrderTotals } from '../../../src/barbar/domain/shifts';
import { businessToday } from '../../../src/barbar/domain/business-day';
import { HttpError } from '../http';
import { ordersSnapshot } from '../../../src/barbar/domain/orders';
import { staffSale } from '../barbar-access';
import { json, type Role } from '../barbar-auth';
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
