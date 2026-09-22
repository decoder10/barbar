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
