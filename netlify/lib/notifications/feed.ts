import type { Db, Document } from 'mongodb';
import { authenticated, json } from '../barbar-auth';
import type { IdentityStore } from '../barbar-users';
import type { StockAlert } from '../../../src/barbar/domain/notifications/stock-alerts';
import type { GuestNotice, PurchaseNotice } from '../../../src/barbar/domain/notifications/message';
import type { FeedItem } from '../../../src/barbar/domain/notifications/feed';

/**
 * What was actually queued for delivery, newest first. Both collections are TTL-bound
 * (stock warnings a day, purchases a week), so this is a recent feed, not a full history.
 * Purchases carry money, so a worker receives stock warnings only — the same rule as delivery.
 * Guest requests reach both roles with their lines and menu total, never prices per line or the table code.
 */
export async function handleNotificationsFeed(request: Request, db: Db, users: IdentityStore) {
  const user = await authenticated(request, users);
  if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  const limit = 50;
  // The newest events of each queue, read together through the createdAt indexes.
  const newest = <T>(name: string, filter: Document, projection: Document) =>
    db
      .collection(name)
      .find(filter, { maxTimeMS: 5000, projection: { ...projection, createdAt: 1, done: 1 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray() as unknown as Promise<(T & { _id: string; createdAt: Date; done: boolean })[]>;
  const [stock, purchases, guests] = await Promise.all([
    newest<{ alerts: StockAlert[] }>('stockAlertEvents', {}, { alerts: 1 }),
    user.role === 'owner' ? newest<{ purchase: PurchaseNotice }>('purchaseEvents', {}, { purchase: 1 }) : [],
    newest<GuestNotice>(
      'guestEvents',
      { expiresAt: { $gt: new Date() } },
      { tableName: 1, lines: 1, total: 1, comment: 1 },
    ),
  ]);
  const items: FeedItem[] = [
    ...guests.map((event) => ({
      id: `guest:${event._id}`,
      kind: 'guest' as const,
      tableName: String(event.tableName),
      ...(Array.isArray(event.lines)
        ? {
            lines: event.lines.map(({ name, quantity, servingMl }) => ({
              name,
              quantity,
              ...(servingMl ? { servingMl } : {}),
            })),
          }
        : {}),
      ...(typeof event.total === 'number' ? { total: event.total } : {}),
      ...(event.comment ? { comment: event.comment } : {}),
      createdAt: new Date(event.createdAt).toISOString(),
      delivered: !!event.done,
    })),
    ...stock.map((event) => ({
      id: `stock:${event._id}`,
      kind: 'stock' as const,
      createdAt: new Date(event.createdAt).toISOString(),
      delivered: !!event.done,
      alerts: event.alerts,
    })),
    ...purchases.map((event) => ({
      id: `purchase:${event._id}`,
      kind: 'purchase' as const,
      createdAt: new Date(event.createdAt).toISOString(),
      delivered: !!event.done,
      purchase: event.purchase,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
  return json({ items });
}
