import type { Db } from 'mongodb';
import { authenticated, json } from '../barbar-auth';
import type { IdentityStore } from '../barbar-users';
import type { StockAlert } from '../../../src/barbar/domain/notifications/stock-alerts';
import type { PurchaseNotice } from '../../../src/barbar/domain/notifications/message';
import type { FeedItem } from '../../../src/barbar/domain/notifications/feed';

/**
 * What was actually queued for delivery, newest first. Both collections are TTL-bound
 * (stock warnings a day, purchases a week), so this is a recent feed, not a full history.
 * Purchases carry money, so a worker receives stock warnings only — the same rule as delivery.
 */
export async function handleNotificationsFeed(request: Request, db: Db, users: IdentityStore) {
  const user = await authenticated(request, users);
  if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  const limit = 50;
  const options = { maxTimeMS: 5000 };
  const stock = (await db
    .collection('stockAlertEvents')
    .find({}, { ...options, projection: { alerts: 1, createdAt: 1, done: 1 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()) as unknown as { _id: string; alerts: StockAlert[]; createdAt: Date; done: boolean }[];
  const purchases =
    user.role === 'owner'
      ? ((await db
          .collection('purchaseEvents')
          .find({}, { ...options, projection: { purchase: 1, createdAt: 1, done: 1 } })
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray()) as unknown as {
          _id: string;
          purchase: PurchaseNotice;
          createdAt: Date;
          done: boolean;
        }[])
      : [];
  const guests = await db
    .collection('guestEvents')
    .find(
      { expiresAt: { $gt: new Date() } },
      { ...options, projection: { tableName: 1, createdAt: 1, done: 1 } },
    )
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  const items: FeedItem[] = [
    ...guests.map((event) => ({
      id: `guest:${event._id}`,
      kind: 'guest' as const,
      tableName: String(event.tableName),
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
