import { MongoClient } from 'mongodb';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { mongoRepository } from './barbar-mongo';
import { guestOrderStore } from './guest-order-store';
import { applyCommand, initialData, validateData } from '../../src/barbar/domain/model';
import { businessToday } from '../../src/barbar/domain/business-day';
import { shiftPreview } from '../../src/barbar/domain/shifts';
import type { UserProfile } from '../../src/barbar/domain/identity/user';
import type { Command } from '../../src/barbar/domain/types';
import type { GuestRequestInput } from '../../src/barbar/domain/guest-requests';

const uri = process.env.BARBAR_TEST_MONGODB_URI;
describe.skipIf(!uri)('guest orders and shifts (disposable MongoDB database)', () => {
  if (uri && !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(uri))
    throw new Error('Local test URI required');
  const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 3000 });
  const databases: string[] = [];
  const actor: UserProfile = {
    id: 'worker',
    username: 'worker',
    fullName: 'Worker',
    email: '',
    phone: '',
    role: 'worker',
    active: true,
    createdAt: new Date().toISOString(),
  };
  beforeAll(() => client.connect());
  afterAll(async () => {
    for (const name of databases) {
      if (!name.startsWith('barbar_test_workflows_')) throw new Error('Unsafe test database');
      await client.db(name).dropDatabase();
    }
    await client.close();
  });
  async function create(
    lines: GuestRequestInput['lines'] = [
      { id: 'one', kind: 'alcohol', productId: 'vodka', quantity: 2, servingMl: 50 },
    ],
  ) {
    const name = `barbar_test_workflows_${crypto.randomUUID().replaceAll('-', '')}`;
    databases.push(name);
    const db = client.db(name);
    let data = initialData();
    data = applyCommand(data, {
      id: 'table',
      type: 'saveTable',
      value: { id: 'table', name: '1', order: 0, active: true },
    });
    data = applyCommand(data, {
      id: 'purchase',
      type: 'purchase',
      value: { id: 'purchase', alcoholId: 'vodka', date: businessToday(), ml: 150, costPerLiter: 1000 },
    });
    const repo = mongoRepository(client, db, async () => data);
    await repo.read();
    const store = guestOrderStore(db);
    const input: GuestRequestInput = {
      id: crypto.randomUUID().replaceAll('-', ''),
      code: data.tables![0].code,
      comment: '',
      lines,
    };
    return { db, repo, store, input };
  }
  it('initializes guest collections on a first public request without reseeding the ledger', async () => {
    const name = `barbar_test_workflows_${crypto.randomUUID().replaceAll('-', '')}`;
    databases.push(name);
    const db = client.db(name);
    const data = applyCommand(initialData(), {
      id: 'table',
      type: 'saveTable',
      value: { id: 'table', name: '1', order: 0, active: true },
    });
    await db.collection('tables').insertMany(data.tables!.map((t) => ({ ...t })));
    await db.collection('alcohol').insertMany(data.alcohol.map((a) => ({ ...a })));
    await db.collection('cocktails').insertMany(data.cocktails.map((c) => ({ ...c })));
    const input: GuestRequestInput = {
      id: crypto.randomUUID().replaceAll('-', ''),
      code: data.tables![0].code,
      comment: '',
      lines: [{ id: 'one', kind: 'alcohol', productId: 'vodka', quantity: 1, servingMl: 50 }],
    };
    // The explicitly selected production profile must not run any setup.
    expect(await guestOrderStore(db, { migrations: false }).table(input.code)).toEqual({
      id: 'table',
      name: '1',
    });
    expect(await db.collection('appMigrations').countDocuments()).toBe(0);
    await guestOrderStore(db).submit(input);
    expect(await db.collection('guestRequests').countDocuments()).toBe(1);
    expect(await db.collection('guestEvents').countDocuments()).toBe(1);
    expect(await db.collection('sales').countDocuments()).toBe(0);
    expect(await db.collection('alcohol').countDocuments()).toBe(data.alcohol.length);
    expect(await db.collection('appMigrations').countDocuments()).toBe(2);
    expect(await db.collection('guestRequests').indexes()).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: { purgeAt: 1 }, expireAfterSeconds: 0 })]),
    );
  });
  it('serializes duplicate submissions/acceptance and rolls back an entire shortage', async () => {
    const { db, repo, store, input } = await create();
    await Promise.all([store.submit(input), store.submit(input)]);
    expect(await db.collection('guestRequests').countDocuments()).toBe(1);
    expect(await db.collection('sales').countDocuments()).toBe(0);
    const command: Command = {
      id: 'accept',
      type: 'acceptGuestRequest',
      requestId: input.id,
      lineIds: ['one'],
    };
    const racing = [command, { ...command, id: 'other' }];
    const results = await Promise.allSettled(racing.map((c) => repo.execute!(c, actor)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    // The winning ID replays as a no-op; the losing one must stay rejected rather than sell twice.
    await expect(
      repo.execute!(racing[results.findIndex((r) => r.status === 'fulfilled')], actor),
    ).resolves.toBeTruthy();
    await expect(
      repo.execute!(racing[results.findIndex((r) => r.status === 'rejected')], actor),
    ).rejects.toThrow(/обработана/);
    expect(await db.collection('sales').countDocuments()).toBe(1);
    expect((await store.status(input.id, input.code))?.status).toBe('accepted');
    const second = { ...input, id: crypto.randomUUID().replaceAll('-', '') };
    await store.submit(second);
    await expect(repo.execute!({ ...command, id: 'shortage', requestId: second.id }, actor)).rejects.toThrow(
      /Недостаточно/,
    );
    expect((await store.status(second.id, input.code))?.status).toBe('pending');
    expect(await db.collection('sales').countDocuments()).toBe(1);
    expect(await db.collection('auditEvents').countDocuments({ _id: 'shortage' as never })).toBe(0);
    // Even after TTL cleanup, a processed public token cannot be reused to overwrite an old receipt.
    await db.collection('guestRequests').deleteOne({ _id: input.id as never });
    await expect(store.submit(input)).rejects.toThrow(/обработана/);
  });
  it('rolls back a request whose later line exceeds stock and keeps a partial selection final', async () => {
    // 150 ml on hand: the first line alone fits, both together do not.
    const { db, repo, store, input } = await create([
      { id: 'one', kind: 'alcohol', productId: 'vodka', quantity: 2, servingMl: 50 },
      { id: 'two', kind: 'alcohol', productId: 'vodka', quantity: 2, servingMl: 50 },
    ]);
    await store.submit(input);
    const snapshot = async () => ({
      balances: await db.collection('stockBalances').find().sort({ _id: 1 }).toArray(),
      revision: await repo.readRevision!(),
      sales: await db.collection('sales').countDocuments(),
      orders: await db.collection('orders').countDocuments(),
      audit: await db.collection('auditEvents').countDocuments(),
    });
    const before = await snapshot();
    await expect(
      repo.execute!(
        { id: 'both', type: 'acceptGuestRequest', requestId: input.id, lineIds: ['one', 'two'] },
        actor,
      ),
    ).rejects.toThrow(/Недостаточно/);
    // No stock consumed, no receipt opened, no revision burned and nothing written to the audit.
    expect(await snapshot()).toEqual(before);
    expect((await store.status(input.id, input.code))?.status).toBe('pending');
    await repo.execute!(
      { id: 'one-only', type: 'acceptGuestRequest', requestId: input.id, lineIds: ['one'] },
      actor,
    );
    expect(await db.collection('sales').countDocuments()).toBe(1);
    expect((await store.status(input.id, input.code))?.acceptedLineIds).toEqual(['one']);
    // The unselected line was rejected with the request and can never be sold afterwards.
    await expect(
      repo.execute!(
        { id: 'two-later', type: 'acceptGuestRequest', requestId: input.id, lineIds: ['two'] },
        actor,
      ),
    ).rejects.toThrow(/обработана/);
    expect(await db.collection('sales').countDocuments()).toBe(1);
    expect(await db.collection('auditEvents').countDocuments({ _id: 'two-later' as never })).toBe(0);
  });
  it('serializes payment and closing, refuses stale totals and persists one closed shift', async () => {
    const { db, repo, store, input } = await create();
    // Two staff screens opening the same table must not produce two receipts.
    const opened = await Promise.allSettled([
      repo.execute!({ id: 'open-a', type: 'openOrder', tableId: 'table' }, actor),
      repo.execute!({ id: 'open-b', type: 'openOrder', tableId: 'table' }, actor),
    ]);
    expect(opened.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.collection('orders').countDocuments({ status: 'open' })).toBe(1);
    await store.submit(input);
    await repo.execute!(
      { id: 'accept', type: 'acceptGuestRequest', requestId: input.id, lineIds: ['one'] },
      actor,
    );
    const board = await repo.readOrders!();
    const day = board.orders[0].businessDay;
    const before = await repo.readShifts!(day, day);
    const close: Command = {
      id: 'close',
      type: 'closeShift',
      businessDay: day,
      expected: before.preview.expected,
      countedCash: 0,
    };
    const pay: Command = {
      id: 'pay',
      type: 'payOrder',
      orderId: board.orders[0].id,
      expectedTotal: board.sales[0].revenue,
      payments: [{ method: 'card', amount: board.sales[0].revenue }],
    };
    const raced = await Promise.allSettled([repo.execute!(pay, actor), repo.execute!(close, actor)]);
    expect(raced[0].status).toBe('fulfilled');
    expect(raced[1].status).toBe('rejected');
    const preview = (await repo.readShifts!(day, day)).preview;
    const results = await Promise.allSettled([
      repo.execute!({ ...close, expected: preview.expected }, actor),
      repo.execute!({ ...close, id: 'close2', expected: preview.expected }, actor),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.collection('shifts').countDocuments()).toBe(1);
    const full = await repo.read();
    expect(validateData(full.data).shifts).toHaveLength(1);
    expect(JSON.stringify(full.data)).not.toContain('guestRequests');
    expect(shiftPreview(full.data.orders!, day).count).toBe(1);
    await expect(repo.execute!({ id: 'late', type: 'openOrder' }, actor)).rejects.toThrow(/Смена закрыта/);
  });
});
