import { oncePerDatabase } from '../database/migrations';
import { createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import type { PushSubscription } from 'web-push';
import { authenticated, json, sameOrigin, sessionToken } from '../barbar-auth';
import type { IdentityStore } from '../barbar-users';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export interface Device extends PushSubscription {
  _id: string;
  userId: string;
  sessionId: string;
  expiresAt: Date;
  updatedAt: Date;
  foregroundUntil: Date;
  language: string;
}
export function pushConfig() {
  const publicKey = process.env.BARBAR_PUSH_PUBLIC_KEY;
  const privateKey = process.env.BARBAR_PUSH_PRIVATE_KEY;
  const subject = process.env.BARBAR_PUSH_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}
export function validateSubscription(input: unknown): PushSubscription {
  const value = input as PushSubscription;
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 2048)
    throw new Error('Invalid subscription');
  const url = new URL(value.endpoint);
  const host = url.hostname;
  const allowed =
    host === 'fcm.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.apple.com');
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
    throw new Error('Invalid endpoint');
  if (
    !/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh || '') ||
    !/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth || '')
  )
    throw new Error('Invalid keys');
  return { endpoint: url.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}
const ready = new WeakMap<Db, Promise<unknown>>();
export function ensurePushIndexes(db: Db) {
  if (!ready.has(db))
    ready.set(
      db,
      oncePerDatabase(db, 'push-indexes-v2', () =>
        Promise.all([
          db.collection('pushDevices').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          db.collection('pushDevices').createIndex({ userId: 1 }),
          ...['stockAlertEvents', 'purchaseEvents'].flatMap((name) => [
            db.collection(name).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
            db.collection(name).createIndex({ done: 1, nextAttempt: 1 }),
          ]),
        ]),
      ).catch((error) => {
        ready.delete(db);
        throw error;
      }),
    );
  return ready.get(db)!;
}
export async function handlePush(request: Request, db: Db, users: IdentityStore) {
  const user = await authenticated(request, users);
  if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  if (request.method === 'GET') return json({ publicKey: pushConfig()?.publicKey || null });
  if (!['POST', 'DELETE', 'PATCH'].includes(request.method))
    return json({ error: 'Метод не поддерживается.' }, 405);
  if (!sameOrigin(request)) return json({ error: 'Недопустимый источник запроса.' }, 403);
  const body = await request.text();
  if (body.length > 4096) return json({ error: 'Слишком большой запрос.' }, 413);
  try {
    const input = JSON.parse(body);
    const subscription = validateSubscription(input.subscription);
    const _id = hash(subscription.endpoint),
      devices = db.collection<Device>('pushDevices');
    await ensurePushIndexes(db);
    if (request.method === 'DELETE') {
      await devices.deleteOne({ _id, userId: user.id });
      return json({ ok: true });
    }
    const sessionId = hash(sessionToken(request));
    const session = await db
      .collection<{ _id: string; expiresAt: Date }>('sessions')
      .findOne({ _id: sessionId });
    if (!session) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
    const fields = {
      language: user.preferences?.language || 'ru',
      foregroundUntil: new Date(Date.now() + (input.visible === true ? 90000 : 0)),
      updatedAt: new Date(),
    };
    if (request.method === 'PATCH') {
      await devices.updateOne({ _id, userId: user.id, sessionId }, { $set: fields });
    } else {
      if (!pushConfig()) return json({ error: 'Системные уведомления ещё не настроены на сервере.' }, 503);
      if ((await devices.countDocuments({ userId: user.id, _id: { $ne: _id } })) >= 10)
        return json({ error: 'Лимит устройств: 10.' }, 400);
      await devices.updateOne(
        { _id },
        {
          $set: {
            ...subscription,
            ...fields,
            userId: user.id,
            sessionId,
            expiresAt: session.expiresAt,
            language: user.preferences?.language || 'ru',
          },
        },
        { upsert: true },
      );
    }
    return json({ ok: true });
  } catch {
    return json({ error: 'Не удалось сохранить настройку уведомлений.' }, 400);
  }
}
