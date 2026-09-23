import webpush from 'web-push';
import type { Db } from 'mongodb';
import type { AlertEvent, PurchaseEvent } from './events';
import { ensurePushIndexes, pushConfig, validateSubscription, type Device } from './subscriptions';
import {
  alertMessage,
  guestMessage,
  guestTitle,
  purchaseMessage,
  purchaseTitle,
  type GuestNotice,
} from '../../../src/barbar/domain/notifications/message';

type Queued = Omit<AlertEvent, 'alerts'>;
interface Channel {
  collection: 'stockAlertEvents' | 'purchaseEvents' | 'guestEvents';
  /** Older events are closed without sending. */
  maxAge: number;
  ttl: number;
  ownersOnly: boolean;
  /** Stock warnings are already visible in an open app; purchases have no in-app feed. */
  foreground: boolean;
  payload: (event: Queued, device: Device) => { title: string; body: string; tag: string; url: string };
}
const stock: Channel = {
  collection: 'stockAlertEvents',
  maxAge: 600000,
  ttl: 300,
  ownersOnly: false,
  foreground: false,
  payload: (event, device) => ({
    title: 'Barbar · ' + (device.language === 'en' ? 'Stock' : device.language === 'hy' ? 'Պահեստ' : 'Склад'),
    body: (event as AlertEvent).alerts
      .slice(0, 4)
      .map((a) => alertMessage(a, device.language))
      .join('\n'),
    tag: `stock-${event._id}`,
    url: '/inventory',
  }),
};
const purchases: Channel = {
  collection: 'purchaseEvents',
  maxAge: 6 * 3600000,
  ttl: 6 * 3600,
  ownersOnly: true,
  foreground: true,
  payload: (event, device) => ({
    title: purchaseTitle(device.language),
    body: purchaseMessage((event as PurchaseEvent).purchase, device.language),
    tag: `purchase-${event._id}`,
    url: '/inventory',
  }),
};

const guests: Channel = {
  collection: 'guestEvents',
  maxAge: 15 * 60000,
  ttl: 300,
  ownersOnly: false,
  foreground: true,
  payload: (event, device) => ({
    title: guestTitle((event as Queued & GuestNotice).tableName, device.language),
    body: guestMessage(event as Queued & GuestNotice, device.language),
    tag: `guest-${event._id}`,
    url: '/',
  }),
};
/** Leased outbox; failures cannot undo the saved operation. Stable notification tags collapse rare retries. */
async function deliver(db: Db, channel: Channel) {
  const config = pushConfig();
  if (!config) return;
  await ensurePushIndexes(db);
  const events = db.collection<Queued>(channel.collection);
  const now = new Date();
  const event = await events.findOneAndUpdate(
    { done: false, nextAttempt: { $lte: now }, expiresAt: { $gt: now }, attempts: { $lt: 5 } },
    { $set: { nextAttempt: new Date(+now + 120000) }, $inc: { attempts: 1 } },
    { sort: { nextAttempt: 1 }, returnDocument: 'after' },
  );
  if (!event) return;
  // Do not send stale events, e.g. when keys are configured later.
  if (+now - +event.createdAt > channel.maxAge) {
    await events.updateOne({ _id: event._id }, { $set: { done: true } });
    return;
  }
  const users = db.collection<{ _id: string; active: boolean; role?: string; authVersion?: number }>('users');
  const owners = channel.ownersOnly
    ? (await users.find({ role: 'owner', active: true }, { projection: { _id: 1 } }).toArray()).map(
        (u) => u._id,
      )
    : undefined;
  const devices = db.collection<Device>('pushDevices');
  const targets = await devices
    .find({
      expiresAt: { $gt: now },
      updatedAt: { $lte: now },
      ...(owners ? { userId: { $in: owners } } : {}),
    })
    .limit(100)
    .toArray();
  let failed = false;
  const deadline = Date.now() + 6000;
  for (let start = 0; start < targets.length; start += 5) {
    if (Date.now() >= deadline) {
      failed = true;
      break;
    }
    await Promise.all(
      targets.slice(start, start + 5).map(async (device) => {
        if (event.delivered.includes(device._id)) return;
        try {
          const session = await db
            .collection<{ _id: string; userId: string; expiresAt: Date; authVersion?: number }>('sessions')
            .findOne({ _id: device.sessionId, userId: device.userId, expiresAt: { $gt: new Date() } });
          const user = session && (await users.findOne({ _id: device.userId, active: true }));
          if (!session || !user || (user.authVersion || 0) !== (session.authVersion || 0)) {
            await devices.deleteOne({ _id: device._id });
          } else if (channel.ownersOnly && user.role !== 'owner') {
            // Role changed after the target query: skip, keep the device.
          } else if (channel.foreground || device.foregroundUntil <= now) {
            await webpush.sendNotification(
              validateSubscription(device),
              JSON.stringify(channel.payload(event, device)),
              { vapidDetails: config, TTL: channel.ttl, urgency: 'high', timeout: 3000 },
            );
          }
          await events.updateOne({ _id: event._id }, { $addToSet: { delivered: device._id } });
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await devices.deleteOne({ _id: device._id });
            await events.updateOne({ _id: event._id }, { $addToSet: { delivered: device._id } });
          } else failed = true;
        }
      }),
    );
  }
  await events.updateOne({ _id: event._id }, { $set: { done: !failed || event.attempts >= 5 } });
}
export const deliverStockAlerts = (db: Db) => deliver(db, stock);
export const deliverPurchaseNotices = (db: Db) => deliver(db, purchases);
export const deliverGuestRequests = (db: Db) => deliver(db, guests);
export async function safelyDeliverNotifications(db: Db) {
  for (const [channel, run] of [
    ['guest', deliverGuestRequests],
    ['stock', deliverStockAlerts],
    ['purchase', deliverPurchaseNotices],
  ] as const) {
    try {
      await run(db);
    } catch {
      console.error(`Push delivery deferred: ${channel}`);
    }
  }
}
