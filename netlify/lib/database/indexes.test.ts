import { MongoClient, type Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureAuditIndexes, ensureLedgerIndexes } from './indexes';
import { oncePerDatabase } from './migrations';

const uri = process.env.BARBAR_TEST_MONGODB_URI;
const stats = (plan: Document) =>
  plan.executionStats || plan.stages?.find((s: Document) => s.$cursor)?.$cursor.executionStats;
const stages = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  return [...(typeof row.stage === 'string' ? [row.stage] : []), ...Object.values(row).flatMap(stages)];
};

describe.skipIf(!uri)('query-driven indexes on an isolated local database', () => {
  if (uri && !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(uri))
    throw new Error('Local test URI required');
  const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
  const db = client.db(`barbar_test_indexes_${crypto.randomUUID().replaceAll('-', '')}`);
  const period = { date: { $gte: '2026-09-01', $lte: '2026-09-30' } };
  const auditQuery = () =>
    db
      .collection('auditEvents')
      .find({ 'actor.id': 'worker-3', action: 'action-4' })
      .sort({ createdAt: -1, id: -1 })
      .limit(51);
  const cancelled = () =>
    db.collection('sales').aggregate([{ $match: { ...period, voided: true } }, { $count: 'count' }]);
  const outputs = () =>
    db.command({
      explain: { distinct: 'stockMovements', key: 'outputId', query: { kind: 'prepare' } },
      verbosity: 'executionStats',
    });
  beforeAll(async () => {
    await client.connect();
    for (let i = 0; i < 30000; i += 500) {
      const rows = Array.from({ length: 500 }, (_, j) => {
        const n = i + j;
        return {
          id: String(n).padStart(8, '0'),
          date: '2026-09-14',
          createdAt: new Date(1700000000000 + n * 1000).toISOString(),
          actor: { id: `worker-${n % 20}` },
          action: `action-${Math.floor(n / 20) % 10}`,
          voided: n % 100 === 0,
          kind: n % 30 === 0 ? 'prepare' : 'writeoff',
          ...(n % 30 === 0 ? { outputId: `output-${n % 7}` } : {}),
        };
      });
      for (const name of ['sales', 'stockMovements', 'auditEvents'])
        await db.collection(name).insertMany(rows.map((r) => ({ ...r })));
    }
    await db
      .collection('auditEvents')
      .createIndexes([
        { key: { createdAt: -1, id: -1 } },
        { key: { 'actor.id': 1, createdAt: -1, id: -1 } },
        { key: { action: 1, createdAt: -1, id: -1 } },
      ]);
    for (const name of ['sales', 'stockMovements', 'stockResets']) {
      await db.collection(name).createIndex({ date: -1, createdAt: -1, id: -1 });
      await db.collection(name).createIndex({ date: -1, id: -1 });
    }
    await db.collection('sales').createIndex({ date: 1, createdAt: 1 });
    await db.collection('purchases').createIndex({ date: 1, alcoholId: 1 });
    await db.collection('sales').createIndex({ productId: 1 }, { name: 'custom_product_lookup' });
    // An existing deployment has already completed the previous index migrations.
    await db.collection('appMigrations').insertMany([
      { _id: 'ledger-indexes-v3' as never, completedAt: new Date() },
      { _id: 'audit-indexes-v1' as never, completedAt: new Date() },
    ]);
  }, 30000);
  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  it('reduces actual reads without hints and preserves query results', async () => {
    const before = {
      audit: stats(await auditQuery().explain('executionStats')),
      cancellations: stats(await cancelled().explain('executionStats')),
      outputs: stats(await outputs()),
    };
    const expected = await auditQuery().toArray();
    const expectedOutputs = await db.collection('stockMovements').distinct('outputId', { kind: 'prepare' });
    await ensureLedgerIndexes(db);
    await ensureAuditIndexes(db);
    const after = {
      audit: stats(await auditQuery().explain('executionStats')),
      cancellations: stats(await cancelled().explain('executionStats')),
      outputs: stats(await outputs()),
    };
    expect(await auditQuery().toArray()).toEqual(expected);
    expect(await cancelled().toArray()).toEqual([{ count: 300 }]);
    expect((await db.collection('stockMovements').distinct('outputId', { kind: 'prepare' })).sort()).toEqual(
      expectedOutputs.sort(),
    );
    expect(after.audit.totalDocsExamined).toBe(51);
    expect(before.audit.totalDocsExamined).toBeGreaterThan(after.audit.totalDocsExamined * 5);
    expect(after.cancellations.totalDocsExamined).toBe(0);
    expect(after.cancellations.totalKeysExamined).toBeLessThanOrEqual(301);
    expect(before.cancellations.totalDocsExamined).toBe(30000);
    expect(after.outputs.totalDocsExamined).toBe(0);
    expect(after.outputs.totalKeysExamined).toBeLessThanOrEqual(8);
    expect(before.outputs.totalDocsExamined).toBe(30000);
    console.info(
      'Index reads before/after:',
      JSON.stringify(
        Object.fromEntries(
          Object.keys(before).map((k) => {
            const key = k as keyof typeof before;
            return [
              key,
              {
                beforeDocs: before[key].totalDocsExamined,
                afterDocs: after[key].totalDocsExamined,
                afterKeys: after[key].totalKeysExamined,
              },
            ];
          }),
        ),
      ),
    );
  });

  it('keeps deep chronological pages bounded and index-sorted after legacy index retirement', async () => {
    const sale = db.collection('sales');
    const cursor = await sale.findOne({ id: '00015000' });
    const filter = {
      ...period,
      $or: [
        { date: { $lt: cursor!.date } },
        { date: cursor!.date, createdAt: { $lt: cursor!.createdAt } },
        { date: cursor!.date, createdAt: cursor!.createdAt, id: { $lt: cursor!.id } },
      ],
    };
    const query = sale.find(filter).sort({ date: -1, createdAt: -1, id: -1 }).limit(51);
    const plan = await query.explain('executionStats');
    expect((await query.toArray())[0].id).toBe('00014999');
    expect(stats(plan).totalDocsExamined).toBeLessThanOrEqual(60);
    expect(stages(plan.queryPlanner.winningPlan)).not.toContain('SORT');
    expect(stages(plan.queryPlanner.winningPlan)).not.toContain('COLLSCAN');
    // The remaining chronological index also supports old ascending date/time order.
    const ascending = await sale
      .find(period)
      .sort({ date: 1, createdAt: 1 })
      .limit(51)
      .explain('executionStats');
    expect(stages(ascending.queryPlanner.winningPlan)).not.toContain('SORT');
    expect(stats(ascending).totalDocsExamined).toBe(51);
  });

  it('is idempotent and only retires exact app-owned non-unique indexes', async () => {
    const before = await db.collection('sales').listIndexes().toArray();
    expect(before.map((i) => i.name)).toContain('custom_product_lookup');
    expect(before.map((i) => i.name)).not.toContain('date_1_createdAt_1');
    expect(before.map((i) => i.name)).not.toContain('date_-1_id_-1');
    expect((await db.collection('purchases').listIndexes().toArray()).map((i) => i.name)).not.toContain(
      'date_1_alcoholId_1',
    );
    // A uniqueness constraint with a legacy name must never be removed.
    await db.collection('stockResets').createIndex({ date: -1, id: -1 }, { unique: true });
    await Promise.all([ensureLedgerIndexes(db), ensureLedgerIndexes(db), ensureAuditIndexes(db)]);
    expect(await db.collection('sales').listIndexes().toArray()).toEqual(before);
    expect(
      (await db.collection('stockResets').listIndexes().toArray()).find((i) => i.name === 'date_-1_id_-1')
        ?.unique,
    ).toBe(true);
    expect(await db.collection('sales').countDocuments()).toBe(30000);
  });
  it('skips completed cold-start setup and retries an interrupted migration', async () => {
    let calls = 0;
    await oncePerDatabase(db, 'test-cold-start', async () => {
      calls++;
    });
    // A new Db handle represents an independent function instance.
    await oncePerDatabase(client.db(db.databaseName), 'test-cold-start', async () => {
      calls++;
    });
    expect(calls).toBe(1);
    await expect(
      oncePerDatabase(db, 'test-retry', async () => {
        throw new Error('interrupted');
      }),
    ).rejects.toThrow('interrupted');
    expect(await db.collection('appMigrations').findOne({ _id: 'test-retry' } as never)).toBeNull();
    await oncePerDatabase(db, 'test-retry', async () => {
      calls++;
    });
    expect(calls).toBe(2);
  });

  it('upgrades existing deployments with shift uniqueness, guest TTLs and audit lookup', async () => {
    await ensureLedgerIndexes(db);
    await ensureAuditIndexes(db);
    const names = (await db.collection('appMigrations').find().toArray()).map((m) => String(m._id));
    expect(names).toEqual(expect.arrayContaining(['ledger-indexes-v5', 'audit-indexes-v2']));
    const shifts = db.collection('shifts');
    await shifts.insertOne({ businessDay: '2026-09-22', id: 'first' });
    await expect(shifts.insertOne({ businessDay: '2026-09-22', id: 'second' })).rejects.toMatchObject({
      code: 11000,
    });
    expect(await shifts.countDocuments()).toBe(1);
    for (const [collection, field] of [
      ['guestRequests', 'purgeAt'],
      ['guestLimits', 'purgeAt'],
      ['guestEvents', 'expiresAt'],
    ]) {
      const indexes = await db.collection(collection).indexes();
      expect(indexes).toEqual(
        expect.arrayContaining([expect.objectContaining({ key: { [field]: 1 }, expireAfterSeconds: 0 })]),
      );
    }
    expect(await db.collection('auditEvents').indexes()).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: { targetId: 1, action: 1 } })]),
    );
  });
});
