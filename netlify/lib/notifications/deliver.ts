import webpush from 'web-push';
import type { Db } from 'mongodb';
import type { AlertEvent } from './events';
import { ensurePushIndexes, pushConfig, validateSubscription, type Device } from './subscriptions';
import { alertMessage } from '../../../src/barbar/domain/notifications/message';

/** Leased outbox; failures cannot undo a sale. Stable notification tags collapse rare retries. */
export async function deliverStockAlerts(db: Db) {
  const config = pushConfig();
  if (!config) return;
  await ensurePushIndexes(db);
  const events = db.collection<AlertEvent>('stockAlertEvents');
  const now = new Date();
  const event = await events.findOneAndUpdate(
    { done: false, nextAttempt: { $lte: now }, expiresAt: { $gt: now }, attempts: { $lt: 5 } },
    { $set: { nextAttempt: new Date(+now + 120000) }, $inc: { attempts: 1 } },
    { sort: { nextAttempt: 1 }, returnDocument: 'after' },
  );
  if (!event) return;
  // Do not send old stock warnings when keys are configured later.
  if (+now - +event.createdAt > 600000) {
    await events.updateOne({ _id: event._id }, { $set: { done: true } });
    return;
  }
  const devices = db.collection<Device>('pushDevices');
  const targets = await devices
    .find({ expiresAt: { $gt: now }, updatedAt: { $lte: now } })
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
          const user =
            session &&
            (await db
              .collection<{ _id: string; active: boolean; authVersion?: number }>('users')
              .findOne({ _id: device.userId, active: true }));
          if (!session || !user || (user.authVersion || 0) !== (session.authVersion || 0)) {
            await devices.deleteOne({ _id: device._id });
          } else if (device.foregroundUntil <= now) {
            const body = event.alerts
              .slice(0, 4)
              .map((a) => alertMessage(a, device.language))
              .join('\n');
            await webpush.sendNotification(
              validateSubscription(device),
              JSON.stringify({
                title:
                  'Barbar · ' +
                  (device.language === 'en' ? 'Stock' : device.language === 'hy' ? 'Պահեստ' : 'Склад'),
                body,
                tag: `stock-${event._id}`,
                url: '/inventory',
              }),
              { vapidDetails: config, TTL: 300, urgency: 'high', timeout: 3000 },
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
export async function safelyDeliverStockAlerts(db: Db) {
  try {
    await deliverStockAlerts(db);
  } catch {
    console.error('Stock push delivery deferred');
  }
}
