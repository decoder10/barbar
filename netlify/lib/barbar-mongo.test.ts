import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrateBottleCatalog } from '../../src/barbar/domain/catalog/bottles';
import { applyCommand, averageCost, initialData, stock } from '../../src/barbar/domain/model';
import type { Command } from '../../src/barbar/domain/types';
import type { UserProfile } from '../../src/barbar/domain/identity/user';
import { handleBarApi } from '../../tests/identity-fixture';
import { businessToday } from '../../src/barbar/domain/business-day';
import { handleHistory } from './queries/history';
import { handleReport } from './queries/report';
import { identity } from '../../tests/identity-fixture';
import { sessionCookie } from './barbar-auth';
import { mongoRepository } from './barbar-mongo';
import { mergeGoodsCatalog } from './database/goods-catalog';

const uri = process.env.BARBAR_TEST_MONGODB_URI;
describe.skipIf(!uri)('MongoDB transactions and migration (isolated test database)', () => {
  const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
  const databases: string[] = [];
  const create = (loader = async () => initialData()) => {
    const name = `barbar_test_${crypto.randomUUID().replaceAll('-', '')}`;
    databases.push(name);
    const db = client.db(name);
    return { db, repo: mongoRepository(client, db, loader) };
  };
  beforeAll(async () => {
    await client.connect();
    vi.stubEnv('BARBAR_ADMIN_PASSWORD', 'test-admin-password-123');
  });
  afterAll(async () => {
    for (const name of databases) await client.db(name).dropDatabase();
    await client.close();
    vi.unstubAllEnvs();
  });
  const purchase: Command = {
    type: 'purchase',
    id: 'purchase',
    value: { id: 'p', alcoholId: 'vodka', date: '2026-09-01', ml: 100, costPerLiter: 4000 },
  };
  const sale = (id: string, quantity = 80): Command => ({
    type: 'sale',
    id,
    value: { kind: 'alcohol', productId: 'vodka', quantity, date: '2026-09-02' },
  });
  const request = (command: Command) =>
    new Request('https://barbar.example/api/barbar', {
      method: 'POST',
      headers: {
        origin: 'https://barbar.example',
        cookie: sessionCookie(new Request('https://barbar.example'), 'admin'),
      },
      body: JSON.stringify({ command, revision: null }),
    });
  it('preserves goods referenced only by archived history when merging the catalog', async () => {
    const { db } = create();
    await db.collection('state').insertOne({
      _id: 'state' as never,
      revision: 'before',
      archived: { before: '2026-09-01', ingredients: [{ alcoholId: 'archived-tonic', ml: 1, cost: 100 }] },
    });
    await db.collection('alcohol').insertMany([
      { _id: 'tonic' as never, id: 'tonic', name: 'Тоник', category: 'mixer', unit: 'ml', _order: 0 },
      {
        _id: 'archived-tonic' as never,
        id: 'archived-tonic',
        name: 'Tonic',
        category: 'goods',
        unit: 'bottle',
        _order: 1,
      },
    ]);
    await db.collection('cocktails').insertOne({
      _id: 'menu-tonic' as never,
      id: 'menu-tonic',
      name: 'Tonic',
      category: 'soft',
      price: 1000,
      stockAlcoholId: 'archived-tonic',
      ingredients: [{ alcoholId: 'archived-tonic', ml: 1 }],
      _order: 0,
    });
    await mergeGoodsCatalog(client, db);
    expect(await db.collection('alcohol').countDocuments()).toBe(2);
    expect((await db.collection('cocktails').findOne({}))?.stockAlcoholId).toBe('archived-tonic');
  });
  it('adds indexes to an existing database without replacing custom records', async () => {
    const { db, repo } = create();
    const current = await repo.read();
    await db.collection('sales').dropIndex('_order_1');
    // Simulate an older database that has not completed the versioned index migration.
    await db.collection('appMigrations').deleteMany({});
    const neverImport = vi.fn(async () => initialData());
    const reopened = mongoRepository(client, db, neverImport);
    expect(await reopened.readRevision!()).toBe(current.revision);
    expect((await db.collection('sales').indexes()).some((i) => i.name === '_order_1')).toBe(true);
    expect((await reopened.read()).data).toEqual(current.data);
    expect(neverImport).not.toHaveBeenCalled();
  });
  it('imports the whole ledger once and reads it after reconnecting', async () => {
    let data = applyCommand(initialData(), purchase);
    data = applyCommand(data, sale('old', 20));
    const loader = vi.fn(async () => data);
    const { db, repo } = create(loader);
    const migrated = await repo.read();
    const expected = {
      ...migrateBottleCatalog(data),
      stockResets: [],
      stockMovements: [],
      expenses: [],
      tables: [],
      orders: [],
      shifts: [],
    };
    // One-time catalog upgrades (goods, merged duplicates) change the catalog only; the ledger is imported as is.
    expect({ ...migrated.data, alcohol: [], cocktails: [] }).toEqual({
      ...expected,
      alcohol: [],
      cocktails: [],
    });
    expect(migrated.data.cocktails.map((c) => c.id)).toEqual(expected.cocktails.map((c) => c.id));
    expect(new Set(migrated.data.alcohol.map((a) => a.name)).size).toBe(migrated.data.alcohol.length);
    expect(stock(migrated.data, 'vodka')).toBe(80);
    expect(averageCost(migrated.data, 'vodka')).toBe(4000);
    const neverImport = vi.fn(async () => {
      throw new Error('old files unavailable');
    });
    const reopened = mongoRepository(client, db, neverImport);
    expect((await reopened.read()).data).toEqual(migrated.data);
    expect(neverImport).not.toHaveBeenCalled();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(await db.collection('sales').countDocuments()).toBe(1);
  });
  it('does not initialize an empty database if legacy data is unavailable', async () => {
    const { db, repo } = create(async () => {
      throw new Error('unreadable source');
    });
    await expect(repo.read()).rejects.toThrow('unreadable source');
    expect(await db.collection('state').countDocuments()).toBe(0);
  });
  it('handles simultaneous initialization without duplicating the ledger', async () => {
    const { db, repo } = create(async () => applyCommand(initialData(), purchase));
    const other = mongoRepository(client, db, async () => applyCommand(initialData(), purchase));
    const snapshots = await Promise.all([repo.read(), other.read()]);
    expect(snapshots[0].revision).toBe(snapshots[1].revision);
    expect(await db.collection('purchases').countDocuments()).toBe(1);
  });
  it('rejects stale commits and rolls back partial writes on a database error', async () => {
    const { db, repo } = create();
    const before = await repo.read();
    expect((await repo.commit(before, applyCommand(before.data, purchase))).modified).toBe(true);
    expect((await repo.commit(before, before.data)).modified).toBe(false);
    const current = await repo.read();
    await db.command({
      collMod: 'sales',
      validator: { name: 'rejected-name' },
      validationLevel: 'strict',
      validationAction: 'error',
    });
    await expect(repo.commit(current, applyCommand(current.data, sale('fail', 20)))).rejects.toThrow();
    const after = await repo.read();
    expect(after.revision).toBe(current.revision);
    expect(after.data).toEqual(current.data);
  });
  it('prevents overselling across concurrent repositories and deduplicates retries', async () => {
    const { db, repo } = create(async () => applyCommand(initialData(), purchase));
    await repo.read();
    const other = mongoRepository(client, db);
    const results = await Promise.all([
      handleBarApi(request(sale('one')), repo),
      handleBarApi(request(sale('two')), other),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const state = await repo.read();
    expect(stock(state.data, 'vodka')).toBe(20);
    expect(state.data.sales).toHaveLength(1);
    expect((await handleBarApi(request(sale(state.data.sales[0].id)), other)).status).toBe(200);
    expect(await db.collection('sales').countDocuments()).toBe(1);
  });
  it('executes current-day sales without reading history and serves all-period aggregates with paginated worker redaction', async () => {
    const { db, repo } = create(async () =>
      applyCommand(initialData(), {
        ...purchase,
        value: { ...(purchase as Extract<Command, { type: 'purchase' }>).value, ml: 10000 },
      }),
    );
    await repo.readWorking!();
    const noFullRead = vi.spyOn(repo, 'read');
    const currentSale = (id: string): Command => ({
      type: 'sale',
      id,
      value: { kind: 'alcohol', productId: 'vodka', quantity: 10, date: businessToday() },
    });
    for (let i = 0; i < 55; i++)
      expect((await handleBarApi(request(currentSale(`fast-${i}`)), repo)).status).toBe(200);
    expect(noFullRead).not.toHaveBeenCalled();
    const compact = await repo.readWorking!();
    expect(compact.data.sales).toHaveLength(0);
    expect(stock(compact.data, 'vodka')).toBe(9450);
    expect((await handleBarApi(request(currentSale('fast-0')), repo)).status).toBe(200);
    expect(await db.collection('sales').countDocuments()).toBe(55);
    const get = (path: string, role = 'admin') =>
      new Request('https://barbar.example' + path, {
        headers: { cookie: sessionCookie(new Request('https://barbar.example'), role) },
      });
    const path = `/api/barbar/history?from=${businessToday()}&to=${businessToday()}`;
    const page = await (await handleHistory(get(path), db, identity)).json();
    expect(page.rows).toHaveLength(50);
    expect(page.total).toBe(55);
    expect(page.groups[0].quantity).toBe(550);
    const second = await (await handleHistory(get(path + '&cursor=' + page.nextCursor), db, identity)).json();
    expect(second.rows).toHaveLength(5);
    // Period totals ride with the first page only: a deep page costs one indexed find.
    expect(second.total).toBeUndefined();
    expect(second.groups).toBeUndefined();
    expect(new Set([...page.rows, ...second.rows].map((r) => r.id)).size).toBe(55);
    const worker = await (await handleHistory(get(path, 'barbar'), db, identity)).json();
    expect(worker.groups[0].revenue).toBe(page.groups[0].revenue);
    expect(worker.rows[0].revenue).toBe(page.rows[0].revenue);
    expect(JSON.stringify(worker)).not.toMatch(/cost|ingredientIds/i);
    const report = await (
      await handleReport(
        get(`/api/barbar/report?from=${businessToday()}&to=${businessToday()}`),
        db,
        identity,
      )
    ).json();
    expect(report.groups[0].operations).toBe(55);
    expect(report.performance[0].operations).toBe(55);
    expect(report.consumed.vodka).toBe(550);
    expect((await handleReport(get('/api/barbar/report', 'barbar'), db, identity)).status).toBe(403);
    expect(
      (await handleBarApi(request({ id: 'undo-fast', type: 'void', saleId: 'fast-0' }), repo)).status,
    ).toBe(200);
    expect(stock((await repo.readWorking!()).data, 'vodka')).toBe(9460);
    expect(stock((await repo.read()).data, 'vodka')).toBe(9460);
  });
  it('rolls back fast mutations atomically and prevents concurrent overselling across instances', async () => {
    const { db, repo } = create(async () => applyCommand(initialData(), purchase));
    await repo.readWorking!();
    const other = mongoRepository(client, db);
    const todaySale = (id: string): Command => ({
      type: 'sale',
      id,
      value: { kind: 'alcohol', productId: 'vodka', quantity: 80, date: businessToday() },
    });
    await db.command({
      collMod: 'sales',
      validator: { name: 'impossible' },
      validationLevel: 'strict',
      validationAction: 'error',
    });
    const before = await repo.readWorking!();
    expect((await handleBarApi(request(todaySale('rollback-fast')), repo)).status).toBe(503);
    expect(await repo.readWorking!()).toEqual(before);
    expect(await db.collection('auditEvents').countDocuments()).toBe(0);
    await db.command({ collMod: 'sales', validator: {}, validationLevel: 'off' });
    const results = await Promise.all([
      handleBarApi(request(todaySale('race-a')), repo),
      handleBarApi(request(todaySale('race-b')), other),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(stock((await repo.readWorking!()).data, 'vodka')).toBe(20);
    expect(await db.collection('auditEvents').countDocuments()).toBe(1);
  });
  it('preserves fractional valuation, preparations and counted balances in the compact ledger', async () => {
    const { db, repo } = create(async () =>
      applyCommand(initialData(), {
        ...purchase,
        value: {
          ...(purchase as Extract<Command, { type: 'purchase' }>).value,
          ml: 333,
          costPerLiter: 1234.56,
        },
      }),
    );
    await repo.readWorking!();
    const commands: Command[] = [
      {
        id: 'prep',
        type: 'prepare',
        reason: 'Партия',
        outputId: 'tonic',
        quantity: 55,
        ingredients: [{ alcoholId: 'vodka', ml: 50 }],
      },
      { id: 'loss', type: 'writeoff', reason: 'Пролив', alcoholId: 'tonic', quantity: 1, expected: 55 },
      {
        id: 'count',
        type: 'count',
        reason: 'Пересчёт',
        lines: [{ alcoholId: 'tonic', expected: 54, actual: 53 }],
      },
      {
        id: 'expense-test',
        type: 'expense',
        value: { date: businessToday(), category: 'other', description: 'Расход', amount: 100 },
      },
    ];
    for (const command of commands) expect((await handleBarApi(request(command), repo)).status).toBe(200);
    const full = (await repo.read()).data,
      compact = (await repo.readWorking!()).data;
    for (const id of ['vodka', 'tonic']) {
      expect(stock(compact, id)).toBe(stock(full, id));
      expect(averageCost(compact, id)).toBeCloseTo(averageCost(full, id), 9);
    }
    expect(full.stockMovements).toHaveLength(3);
    expect(full.expenses).toHaveLength(1);
    expect(await db.collection('auditEvents').countDocuments()).toBe(4);
  });
  it('runs receipts transactionally: lines deduct at once, a cancellation returns them, worker voids stay on the receipt', async () => {
    const { db, repo } = create(async () => applyCommand(initialData(), purchase));
    const owner: UserProfile = {
      id: 'admin',
      username: 'admin',
      fullName: 'Owner',
      email: '',
      phone: '',
      role: 'owner',
      active: true,
      createdAt: '',
    };
    const worker: UserProfile = { ...owner, id: 'w1', username: 'w1', fullName: 'Worker', role: 'worker' };
    const run = (command: Command, actor: UserProfile = worker) =>
      repo.execute!(command, actor, { actor: { id: actor.id, fullName: actor.fullName } });
    await run(
      { type: 'saveTable', id: 'save-table', value: { id: 't1', name: '1', order: 0, active: true } },
      owner,
    );
    await expect(
      run(
        { type: 'saveTable', id: 'save-dup', value: { id: 't2', name: '1', order: 1, active: true } },
        owner,
      ),
    ).rejects.toThrow('уже есть');
    await run({ type: 'openOrder', id: 'order-1', tableId: 't1' });
    await expect(run({ type: 'openOrder', id: 'order-2', tableId: 't1' })).rejects.toThrow(
      'уже есть открытый заказ',
    );
    const line = (id: string, quantity: number): Command => ({
      type: 'sale',
      id,
      value: { kind: 'alcohol', productId: 'vodka', quantity, date: businessToday(), orderId: 'order-1' },
    });
    const first = await run(line('line-1', 30));
    expect(first!.sale).toMatchObject({ orderId: 'order-1', quantity: 30 });
    expect(first!.changedStock?.find((b: { alcoholId: string }) => b.alcoholId === 'vodka')?.ml).toBe(70);
    await run(line('line-2', 40));
    await expect(run(line('line-3', 40))).rejects.toThrow('Недостаточно');
    const board = await repo.readOrders!();
    expect(board.orders.map((o) => o.id)).toEqual(['order-1']);
    expect(board.sales.map((s) => s.id).sort()).toEqual(['line-1', 'line-2']);
    expect(board.tables[0]).toMatchObject({ id: 't1', name: '1' });
    // The worker takes a line off the open receipt; the same worker cannot void a standalone sale.
    await run({ type: 'removeLine', id: 'void-2', saleId: 'line-2' });
    expect((await db.collection('stockBalances').findOne({ _id: 'vodka' as never }))?.ml).toBe(70);
    await run(
      {
        type: 'sale',
        id: 'plain',
        value: { kind: 'alcohol', productId: 'vodka', quantity: 10, date: businessToday() },
      },
      owner,
    );
    await expect(run({ type: 'removeLine', id: 'void-plain', saleId: 'plain' })).rejects.toThrow('владельцу');
    await expect(
      run({
        type: 'payOrder',
        id: 'pay-wrong',
        orderId: 'order-1',
        expectedTotal: 1,
        payments: [{ method: 'cash', amount: 1 }],
      }),
    ).rejects.toThrow('изменился');
    const paid = await run({
      type: 'payOrder',
      id: 'pay-1',
      orderId: 'order-1',
      expectedTotal: 540,
      payments: [{ method: 'cash', amount: 540, receivedCash: 1000 }],
    });
    expect(paid!.changedStock).toEqual([]);
    const order = await db.collection('orders').findOne({ _id: 'order-1' as never });
    expect(order).toMatchObject({
      status: 'paid',
      total: 540,
      closedBy: { id: 'w1' },
      openedBy: { id: 'w1' },
    });
    // A retry of the same payment is an idempotent success.
    expect(
      (await run({
        type: 'payOrder',
        id: 'pay-1',
        orderId: 'order-1',
        expectedTotal: 540,
        payments: [{ method: 'cash', amount: 540 }],
      }))!.revision,
    ).toBe(paid!.revision);
    await expect(run(line('line-4', 10))).rejects.toThrow('уже закрыт');
    await run({ type: 'openOrder', id: 'order-3', tableId: 't1' });
    await run({
      ...line('line-5', 20),
      value: { ...(line('line-5', 20) as { value: object }).value, orderId: 'order-3' },
    } as Command);
    expect((await db.collection('stockBalances').findOne({ _id: 'vodka' as never }))?.ml).toBe(40);
    await run({ type: 'cancelOrder', id: 'cancel-3', orderId: 'order-3' });
    expect((await db.collection('stockBalances').findOne({ _id: 'vodka' as never }))?.ml).toBe(60);
    expect((await db.collection('sales').findOne({ _id: 'line-5' as never }))?.voided).toBe(true);
    expect((await repo.readOrders!()).orders).toEqual([]);
    const full = (await repo.read()).data;
    expect(full.orders).toHaveLength(2);
    expect(full.tables).toHaveLength(1);
    await run({ type: 'removeTable', id: 'remove-t1', tableId: 't1' }, owner);
    expect(await db.collection('tables').countDocuments()).toBe(0);
    expect(await db.collection('orders').countDocuments({ tableId: 't1' })).toBe(2);
    expect((await db.collection('auditEvents').findOne({ _id: 'pay-1' as never }))?.summary).toContain(
      'стол «1»',
    );
  });
  it('preserves stock and valuation across purge, restore and cancellation', async () => {
    const { repo, db } = create(async () =>
      applyCommand(applyCommand(initialData(), purchase), sale('old', 20)),
    );
    const current = await repo.read();
    const next = applyCommand(current.data, { type: 'purge', id: 'purge', before: '2026-09-05' });
    await repo.commit(current, next);
    expect(await db.collection('sales').countDocuments()).toBe(0);
    const purged = await repo.read();
    expect(stock(purged.data, 'vodka')).toBe(80);
    expect(averageCost(purged.data, 'vodka')).toBe(4000);
    await repo.commit(
      purged,
      applyCommand(purged.data, { type: 'restore', id: 'restore', value: current.data }),
    );
    const restored = await repo.read();
    expect(restored.data.sales).toEqual(current.data.sales);
    await repo.commit(restored, applyCommand(restored.data, { type: 'void', id: 'void', saleId: 'old' }));
    expect(stock((await repo.read()).data, 'vodka')).toBe(100);
  });
});

describe('MongoDB deployment configuration', () => {
  afterAll(() => vi.unstubAllEnvs());
  it('uses platform deployment context even when build variables are absent or misleading', async () => {
    const { mongoConnection } = await import('./barbar-mongo');
    vi.stubEnv('BARBAR_MONGODB_URI', 'mongodb://127.0.0.1:27017');
    vi.stubEnv('BARBAR_MONGODB_DATABASE', 'barbar');
    vi.stubEnv('CONTEXT', 'production');
    const live = mongoConnection(false, { context: 'production', id: 'live1' });
    const preview = mongoConnection(false, { context: 'deploy-preview', id: 'preview1' });
    expect(live.db.databaseName).toBe('barbar');
    expect(preview.db.databaseName).toBe('barbar_preview_preview1');
    expect(() => mongoConnection()).toThrow('deploy context');
    await live.client.close();
    await preview.client.close();
  });
});
