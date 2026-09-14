import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { fixtureData } from '../../../tests/fixtures';
import { identity } from '../../../tests/identity-fixture';
import { mongoRepository } from '../barbar-mongo';
import { businessToday } from '../../../src/barbar/domain/business-day';
import { handlePush, hash, type Device } from './subscriptions';
import { deliverStockAlerts } from './deliver';
import type { AlertEvent } from './events';
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
});
