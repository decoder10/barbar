import { createHash, randomBytes } from 'node:crypto';
import { BSON, MongoClient, type Db } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { applyCommand, initialData } from '../../../src/barbar/domain/model';
import type { Command } from '../../../src/barbar/domain/types';
import { mongoRepository } from '../barbar-mongo';
import { mongoUsers } from '../barbar-users';
import { guestOrderStore } from '../guest-order-store';
import { goodsCatalogKey, goodsMergeKey } from './goods-catalog';
import { runMigrations, type Migration } from './migrations';
import { dataMigrations, guestMigrations, registry, schemaMigrations } from './registry';

// Keys recorded by the release before the registry: databases migrated by it carry exactly these markers.
const previousRelease = [
  'ledger-indexes-v5',
  'audit-indexes-v2',
  'push-indexes-v2',
  'food-catalog-v1',
  goodsCatalogKey,
  goodsMergeKey,
];
// Every registry key, in run order. Append each new id here: renaming or reordering one reruns that step on production data.
const shippedSchema = [
  'ledger-indexes-v5',
  'audit-indexes-v2',
  'push-indexes-v2',
  '2026-09-25-notification-feed-indexes',
  '2026-09-25-price-history-indexes',
];
const shippedData = ['food-catalog-v1', goodsCatalogKey, goodsMergeKey];
const shipped = [...shippedSchema, ...shippedData];

describe('migration registry', () => {
  it('keeps shipped keys in their order and appends only dated ids', () => {
    const ids = registry.map((m) => m.id);
    // Index steps run before the ledger read model, catalog steps after it: each list only grows at its end.
    expect(schemaMigrations.slice(0, shippedSchema.length).map((m) => m.id)).toEqual(shippedSchema);
    expect(dataMigrations.slice(0, shippedData.length).map((m) => m.id)).toEqual(shippedData);
    expect(previousRelease.every((id) => shipped.includes(id))).toBe(true);
    expect(goodsCatalogKey).toMatch(/^goods-catalog-v3-/);
    expect(goodsMergeKey).toMatch(/^goods-merge-v3-/);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids.filter((id) => !previousRelease.includes(id)))
      expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
    expect(registry).toEqual([...schemaMigrations, ...dataMigrations]);
    expect(guestMigrations.every((m) => schemaMigrations.includes(m))).toBe(true);
    expect(registry.every((m) => m.description.length > 0)).toBe(true);
  });
});

const uri = process.env.BARBAR_TEST_MONGODB_URI;
describe.skipIf(!uri)('versioned migrations keep existing data (disposable MongoDB databases)', () => {
  if (uri && !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(uri))
    throw new Error('Local test URI required');
  const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
  const monitored = new MongoClient(uri || 'mongodb://127.0.0.1:27017', {
    serverSelectionTimeoutMS: 5000,
    monitorCommands: true,
  });
  const databases: string[] = [];
  const checked = [
    'orders',
    'tables',
    'alcohol',
    'cocktails',
    'sales',
    'purchases',
    'users',
    'sessions',
    'stockBalances',
  ];
  const token = randomBytes(32).toString('hex');
  beforeAll(async () => {
    await client.connect();
    await monitored.connect();
  });
  afterAll(async () => {
    for (const name of databases) {
      if (!name.startsWith('barbar_test_migrations_')) throw new Error('Unsafe test database');
      await client.db(name).dropDatabase();
    }
    await monitored.close();
    await client.close();
  });

  /** A ledger with tables, a purchase, a sale, open and paid orders, users and a session. */
  async function seed() {
    const name = `barbar_test_migrations_${crypto.randomUUID().replaceAll('-', '')}`;
    databases.push(name);
    const db = client.db(name);
    const commands: Command[] = [
      { id: 'table', type: 'saveTable', value: { id: 'table', name: '1', order: 0, active: true } },
      {
        id: 'purchase',
        type: 'purchase',
        value: { id: 'purchase', alcoholId: 'vodka', date: '2026-09-01', ml: 1000, costPerLiter: 4000 },
      },
      {
        id: 'sale',
        type: 'sale',
        value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-02' },
      },
    ];
    const data = commands.reduce((next, command) => applyCommand(next, command), initialData());
    await mongoRepository(client, db, async () => data).read();
    await db.collection('orders').insertMany([
      { _id: 'open' as never, id: 'open', tableId: 'table', status: 'open', total: 900, _order: 0 },
      { _id: 'paid' as never, id: 'paid', tableId: 'table', status: 'paid', total: 1800, _order: 1 },
    ]);
    await db.collection('users').insertOne({
      _id: 'owner' as never,
      id: 'owner',
      username: 'owner',
      fullName: 'Owner',
      email: '',
      phone: '',
      role: 'owner',
      active: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      passwordHash: 'disabled',
    });
    await db.collection('sessions').insertOne({
      _id: createHash('sha256').update(token).digest('hex') as never,
      userId: 'owner',
      expiresAt: new Date(Date.now() + 3600000),
      authVersion: 0,
    });
    return db;
  }
  const digest = async (db: Db) =>
    Object.fromEntries(
      await Promise.all(
        checked.map(async (name) => {
          const rows = await db.collection(name).find().sort({ _id: 1 }).toArray();
          const json = BSON.EJSON.stringify(rows, { relaxed: false });
          return [name, { count: rows.length, hash: createHash('sha256').update(json).digest('hex') }];
        }),
      ),
    );
  const markers = (db: Db) =>
    db.collection<{ _id: string }>('appMigrations').find().sort({ _id: 1 }).toArray();
  const neverImport = vi.fn(async () => initialData());

  it('runs only the new steps on a database migrated by the previous version, then reads markers once', async () => {
    const db = await seed();
    // Markers as the previous oncePerDatabase wrote them: only completedAt.
    await db.collection('appMigrations').deleteMany({});
    const completedAt = new Date('2026-09-20T10:00:00.000Z');
    await db
      .collection('appMigrations')
      .insertMany(
        [...previousRelease, 'identity-bootstrap-v2'].map((id) => ({ _id: id as never, completedAt })),
      );
    // A rebuilt ledger index or a catalog upgrade would be visible here.
    await db.collection('sales').dropIndex('_order_1');
    const before = {
      data: await digest(db),
      markers: await markers(db),
      state: await db.collection('state').findOne({}),
    };
    let lookups = 0;
    const count = (event: { databaseName: string; command: { find?: unknown } }) => {
      if (event.databaseName === db.databaseName && event.command.find === 'appMigrations') lookups++;
    };
    monitored.on('commandStarted', count);
    try {
      // One Functions instance: mongoConnection shares a Db between the user store and the repository.
      const shared = monitored.db(db.databaseName);
      const users = mongoUsers(shared);
      const repo = mongoRepository(monitored, shared, neverImport);
      expect((await users.resolve(token))?.id).toBe('owner');
      await Promise.all([repo.readStock!(), repo.readCatalog!()]);
      await guestOrderStore(shared).table('missing');
      // All markers, then one recheck right before the steps added since: another instance may have run them.
      expect(lookups).toBe(2);
      lookups = 0;
      // The next cold start finds every step done.
      const next = monitored.db(db.databaseName);
      await Promise.all([
        mongoUsers(next).resolve(token),
        mongoRepository(monitored, next, neverImport).readStock!(),
        guestOrderStore(next).table('missing'),
      ]);
      expect(lookups).toBe(1);
    } finally {
      monitored.off('commandStarted', count);
    }
    expect(neverImport).not.toHaveBeenCalled();
    expect(await digest(db)).toEqual(before.data);
    const added = registry.map((m) => m.id).filter((id) => !previousRelease.includes(id));
    const journal = await markers(db);
    expect(journal.filter((m) => !added.includes(m._id))).toEqual(before.markers);
    expect(journal.map((m) => m._id).filter((id) => added.includes(id))).toEqual([...added].sort());
    expect(await db.collection('state').findOne({})).toEqual(before.state);
    expect((await db.collection('sales').indexes()).map((i) => i.name)).not.toContain('_order_1');
  });

  it('keeps every document when a restored backup reruns all steps, concurrently and again', async () => {
    const db = await seed();
    // Backups exclude appMigrations: a restored database runs every step again over its data.
    await db.collection('appMigrations').deleteMany({});
    await db.collection('sales').dropIndex('_order_1');
    const before = await digest(db);
    const instances = () =>
      Array.from({ length: 3 }, () => client.db(db.databaseName)).map((handle) => ({
        repo: mongoRepository(client, handle, neverImport),
        handle,
      }));
    await Promise.all(
      instances().flatMap(({ repo, handle }) => [
        repo.readRevision!(),
        guestOrderStore(handle).table('missing'),
      ]),
    );
    expect(await digest(db)).toEqual(before);
    expect((await db.collection('sales').indexes()).map((i) => i.name)).toContain('_order_1');
    const journal = await markers(db);
    expect(journal.map((m) => m._id).sort()).toEqual(registry.map((m) => m.id).sort());
    for (const marker of journal)
      expect(marker).toEqual({
        _id: marker._id,
        completedAt: expect.any(Date),
        startedAt: expect.any(Date),
        durationMs: expect.any(Number),
        description: registry.find((m) => m.id === marker._id)!.description,
      });
    // Another cold start and a repeated run on the same instance change nothing, journal included.
    for (const { repo, handle } of instances()) {
      await repo.readRevision!();
      await runMigrations(handle, registry);
    }
    expect(await digest(db)).toEqual(before);
    expect(await markers(db)).toEqual(journal);
    expect(neverImport).not.toHaveBeenCalled();
  });

  it('leaves no marker for a failed step, stops there and retries it on the next call', async () => {
    const db = client.db(`barbar_test_migrations_${crypto.randomUUID().replaceAll('-', '')}`);
    databases.push(db.databaseName);
    const calls: string[] = [];
    let fail = true;
    const step = (id: string, run = async () => {}): Migration => ({
      id,
      description: id,
      run: async () => {
        calls.push(id);
        await run();
      },
    });
    const list = [
      step('2026-09-25-first'),
      step('2026-09-25-second', async () => {
        if (fail) throw new Error('interrupted');
      }),
      step('2026-09-25-third'),
    ];
    await expect(runMigrations(db, list)).rejects.toThrow('interrupted');
    expect((await markers(db)).map((m) => m._id)).toEqual(['2026-09-25-first']);
    expect(calls).toEqual(['2026-09-25-first', '2026-09-25-second']);
    fail = false;
    await runMigrations(db, list);
    expect(calls).toEqual(['2026-09-25-first', '2026-09-25-second', '2026-09-25-second', '2026-09-25-third']);
    expect((await markers(db)).map((m) => m._id)).toEqual(list.map((m) => m.id));
  });

  it('runs a step once per instance and skips one another instance completed meanwhile', async () => {
    const name = `barbar_test_migrations_${crypto.randomUUID().replaceAll('-', '')}`;
    databases.push(name);
    const [one, two] = [client.db(name), client.db(name)];
    let runs = 0;
    const step: Migration = { id: '2026-09-25-once', description: 'once', run: async () => void runs++ };
    await Promise.all([runMigrations(one, [step]), runMigrations(one, [step])]);
    expect(runs).toBe(1);
    // `two` read its markers before the step existed; it must check again instead of trusting that.
    const later: Migration = { id: '2026-09-25-later', description: 'later', run: async () => void runs++ };
    await runMigrations(two, [step]);
    await runMigrations(one, [later]);
    await runMigrations(two, [later]);
    expect(runs).toBe(2);
  });
});
