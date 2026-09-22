import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { fixtureData } from '../../../tests/fixtures';
import { identity } from '../../../tests/identity-fixture';
import { mongoRepository } from '../barbar-mongo';
import { businessToday } from '../../../src/barbar/domain/business-day';
import { handlePush, hash, type Device } from './subscriptions';
import { deliverGuestRequests, deliverPurchaseNotices, deliverStockAlerts } from './deliver';
import { handleNotificationsFeed } from './feed';
import { guestOrderStore } from '../guest-order-store';
import type { FeedItem } from '../../../src/barbar/domain/notifications/feed';
import type { AlertEvent, PurchaseEvent } from './events';
vi.mock('web-push', () => ({
  default: { sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }) },
}));
const uri = process.env.BARBAR_TEST_MONGODB_URI;
describe.skipIf(!uri)('transactional alerts and push security in isolated MongoDB', () => {
  if (uri && !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(uri))
    throw new Error('Local test URI required');
  const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017');
  const db = client.db(`barbar_test_notifications_${crypto.randomUUID().replaceAll('-', '')}`);
  const data = fixtureData();
  data.purchases.find((p) => p.alcoholId === 'gin')!.ml = 200;
  const repo = mongoRepository(client, db, async () => data);
  const command = {
    type: 'sale' as const,
    id: 'stock-sale',
    value: { kind: 'cocktail' as const, productId: data.cocktails[0].id, quantity: 1, date: businessToday() },
  };
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
  };
  const request = (method: string, cookie = 'admin', origin = 'https://barbar.test') =>
    new Request('https://barbar.test/api/barbar/push', {
      method,
      headers: { origin, cookie: `barbar_session=${cookie}` },
      ...(method === 'GET' ? {} : { body: JSON.stringify({ subscription, visible: false }) }),
    });
  beforeAll(async () => {
    await client.connect();
    vi.stubEnv('BARBAR_PUSH_PUBLIC_KEY', 'test');
    vi.stubEnv('BARBAR_PUSH_PRIVATE_KEY', 'test');
    vi.stubEnv('BARBAR_PUSH_SUBJECT', 'https://barbar.test');
  });
  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
    vi.unstubAllEnvs();
  });
  it('stores one event atomically with sale, even under duplicate requests; oversell has no event', async () => {
    await repo.read();
    const actor = (await identity.resolve('admin'))!;
    await Promise.all([repo.execute!(command, actor), repo.execute!(command, actor)]);
    const events = await db.collection<AlertEvent>('stockAlertEvents').find().toArray();
    expect(events).toHaveLength(1);
    expect(events[0].alerts).toEqual([
      expect.objectContaining({ id: 'gin', quantity: 150, severity: 'low' }),
    ]);
    expect(JSON.stringify(events)).not.toMatch(/cost|price|revenue/);
    await expect(
      repo.execute!({ ...command, id: 'oversell', value: { ...command.value, quantity: 999 } }, actor),
    ).rejects.toThrow();
    expect(await db.collection('stockAlertEvents').countDocuments()).toBe(1);
  });
  it('authenticates subscriptions, rejects cross-origin updates, and does not let another user delete a device', async () => {
    expect((await handlePush(request('POST', 'unknown'), db, identity)).status).toBe(401);
    expect((await handlePush(request('POST', 'admin', 'https://evil.test'), db, identity)).status).toBe(403);
    await db
      .collection<{ _id: string; userId: string; expiresAt: Date }>('sessions')
      .insertOne({ _id: hash('admin'), userId: 'admin', expiresAt: new Date(Date.now() + 3600000) });
    await db.collection<{ _id: string; active: boolean }>('users').insertOne({ _id: 'admin', active: true });
    expect((await handlePush(request('POST'), db, identity)).status).toBe(200);
    await handlePush(request('DELETE', 'barbar'), db, identity);
    expect(await db.collection('pushDevices').countDocuments()).toBe(1);
  });
  it('delivers once, collapses duplicate dispatches, then suppresses foreground and revoked sessions', async () => {
    await Promise.all([deliverStockAlerts(db), deliverStockAlerts(db)]);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string);
    expect(payload.body).toContain('150 мл');
    const event = (await db.collection<AlertEvent>('stockAlertEvents').findOne())!;
    await db
      .collection<Device>('pushDevices')
      .updateMany({}, { $set: { foregroundUntil: new Date(Date.now() + 60000) } });
    await db.collection<AlertEvent>('stockAlertEvents').insertOne({
      ...event,
      _id: 'foreground',
      done: false,
      attempts: 0,
      delivered: [],
      nextAttempt: new Date(),
    });
    await deliverStockAlerts(db);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    await db.collection('sessions').deleteMany({});
    await db.collection<AlertEvent>('stockAlertEvents').insertOne({
      ...event,
      _id: 'revoked',
      done: false,
      attempts: 0,
      delivered: [],
      nextAttempt: new Date(),
    });
    await deliverStockAlerts(db);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    expect(await db.collection('pushDevices').countDocuments()).toBe(0);
  });
  it('queues one purchase notice only after the write and delivers it to owner devices, even in foreground', async () => {
    vi.mocked(webpush.sendNotification).mockClear();
    const actor = (await identity.resolve('admin'))!;
    const purchase = {
      type: 'purchase' as const,
      id: 'purchase-command',
      value: { id: 'purchase-row', alcoholId: 'gin', date: businessToday(), ml: 700, costPerLiter: 9200 },
    };
    await Promise.all([repo.execute!(purchase, actor), repo.execute!(purchase, actor)]);
    await expect(
      repo.execute!(
        { ...purchase, id: 'rejected-purchase', value: { ...purchase.value, id: 'rejected-row', ml: -1 } },
        actor,
      ),
    ).rejects.toThrow();
    const events = await db.collection<PurchaseEvent>('purchaseEvents').find().toArray();
    expect(events).toHaveLength(1);
    expect(events[0].purchase).toMatchObject({
      name: 'Gin Beefeater',
      quantity: 700,
      unit: 'ml',
      amount: 6440,
    });
    const now = Date.now();
    await db.collection<{ _id: string; userId: string; expiresAt: Date }>('sessions').insertMany([
      { _id: 'owner-session', userId: 'admin', expiresAt: new Date(now + 3600000) },
      { _id: 'worker-session', userId: 'barbar', expiresAt: new Date(now + 3600000) },
    ]);
    const users = db.collection<{ _id: string; active: boolean; role: string }>('users');
    await users.updateOne({ _id: 'admin' }, { $set: { active: true, role: 'owner' } }, { upsert: true });
    await users.updateOne({ _id: 'barbar' }, { $set: { active: true, role: 'worker' } }, { upsert: true });
    const device = (id: string, userId: string, sessionId: string): Device => ({
      _id: id,
      userId,
      sessionId,
      endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
      keys: subscription.keys,
      expiresAt: new Date(now + 3600000),
      updatedAt: new Date(now - 1000),
      foregroundUntil: new Date(now + 60000),
      language: 'ru',
    });
    await db
      .collection<Device>('pushDevices')
      .insertMany([
        device('owner-device', 'admin', 'owner-session'),
        device('worker-device', 'barbar', 'worker-session'),
      ]);
    await Promise.all([deliverPurchaseNotices(db), deliverPurchaseNotices(db)]);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [target, body] = vi.mocked(webpush.sendNotification).mock.calls[0];
    expect(target.endpoint).toContain('owner-device');
    const payload = JSON.parse(body as string);
    expect(payload.title).toBe('Barbar · Закупка');
    expect(payload.body).toMatch(/^Gin Beefeater · 700 мл · 6\s440 ֏ · \d{2}:\d{2}$/);
    expect((await db.collection<PurchaseEvent>('purchaseEvents').findOne())!.done).toBe(true);
    await deliverPurchaseNotices(db);
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });
  it('lists what was queued, newest first, and keeps purchase money away from a worker', async () => {
    const feed = (cookie: string) =>
      handleNotificationsFeed(
        new Request('https://barbar.test/api/barbar/notifications', {
          headers: { cookie: `barbar_session=${cookie}` },
        }),
        db,
        identity,
      );
    expect((await feed('unknown')).status).toBe(401);
    const owner = (await (await feed('admin')).json()) as { items: FeedItem[] };
    const kinds = owner.items.map((item) => item.kind);
    expect(kinds).toContain('purchase');
    expect(kinds).toContain('stock');
    const stamps = owner.items.map((item) => item.createdAt);
    expect(stamps).toEqual([...stamps].sort().reverse());
    expect(owner.items.find((item) => item.kind === 'purchase')).toMatchObject({
      delivered: true,
      purchase: { name: 'Gin Beefeater', amount: 6440 },
    });
    const worker = (await (await feed('barbar')).json()) as { items: FeedItem[] };
    expect(worker.items.length).toBeGreaterThan(0);
    expect(worker.items.every((item) => item.kind === 'stock')).toBe(true);
    expect(JSON.stringify(worker)).not.toMatch(/amount|cost|price|revenue/);
  });
  it('queues one guest event per request, pushes it to every device and shows it to both roles', async () => {
    vi.mocked(webpush.sendNotification).mockClear();
    const actor = (await identity.resolve('admin'))!;
    await repo.execute!(
      { type: 'saveTable', id: 'guest-table', value: { id: 'table', name: '12', order: 0, active: true } },
      actor,
    );
    const table = (await db.collection<{ _id: string; code: string }>('tables').findOne({ _id: 'table' }))!;
    const input = {
      id: crypto.randomUUID().replaceAll('-', ''),
      code: table.code,
      comment: '',
      lines: [{ id: 'one', kind: 'cocktail' as const, productId: data.cocktails[0].id, quantity: 1 }],
    };
    const store = guestOrderStore(db);
    await Promise.all([store.submit(input), store.submit(input)]);
    expect(await db.collection('guestEvents').countDocuments()).toBe(1);
    // A request is not a sale: nothing may touch the ledger before a worker accepts it.
    expect(await db.collection('sales').countDocuments({ _id: input.id as never })).toBe(0);
    await Promise.all([deliverGuestRequests(db), deliverGuestRequests(db)]);
    const calls = vi.mocked(webpush.sendNotification).mock.calls;
    // Guest requests reach workers too, and are worth interrupting an open app for.
    expect(calls.map(([target]) => target.endpoint).sort()).toEqual([
      'https://fcm.googleapis.com/fcm/send/owner-device',
      'https://fcm.googleapis.com/fcm/send/worker-device',
    ]);
    const payload = JSON.parse(calls[0][1] as string);
    expect(payload).toMatchObject({ title: 'Заявка гостя', body: '12', url: '/' });
    await deliverGuestRequests(db);
    expect(vi.mocked(webpush.sendNotification).mock.calls).toHaveLength(2);
    const guestItem = async (cookie: string) => {
      const response = await handleNotificationsFeed(
        new Request('https://barbar.test/api/barbar/notifications', {
          headers: { cookie: `barbar_session=${cookie}` },
        }),
        db,
        identity,
      );
      const body = (await response.json()) as { items: FeedItem[] };
      return { body, item: body.items.find((i) => i.kind === 'guest') };
    };
    for (const cookie of ['admin', 'barbar']) {
      const { body, item } = await guestItem(cookie);
      expect(item).toMatchObject({ id: `guest:${input.id}`, tableName: '12', delivered: true });
      // The public token, the access code and the request lines stay on the server.
      expect(JSON.stringify(body)).not.toContain(table.code);
      expect(JSON.stringify(item)).not.toMatch(/accessCode|unitPrice|lines/);
    }
  });
});
