import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mongoRepository } from './barbar-mongo';
import { applyCommand, averageCost, initialData, stock } from '../../src/barbar/model';
import { handleBarApi } from './barbar-handler';
import { sessionCookie } from './barbar-auth';
import type { Command } from '../../src/barbar/types';

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
        cookie: sessionCookie(new Request('https://barbar.example'), false, 'admin'),
      },
      body: JSON.stringify({ command, revision: null }),
    });
  it('imports the whole ledger once and reads it after reconnecting', async () => {
    let data = applyCommand(initialData(), purchase);
    data = applyCommand(data, sale('old', 20));
    const loader = vi.fn(async () => data);
    const { db, repo } = create(loader);
    const migrated = await repo.read();
    expect(migrated.data).toEqual({ ...data, stockResets: [] });
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
