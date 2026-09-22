import { MongoClient, BSON } from 'mongodb';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { backupDatabase, readBackup, restoreDatabase, encryptionKey } from './backup.mjs';
const uri = process.env.BARBAR_TEST_MONGODB_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(uri))
  throw new Error('A local test MongoDB URI is required.');
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
const id = randomUUID().replaceAll('-', '');
const source = client.db(`barbar_test_backup_${id}`),
  target = client.db(`barbar_restore_test_${id}`);
const dir = await mkdtemp(join(tmpdir(), 'barbar-backup-test-'));
try {
  const key = await encryptionKey(join(dir, 'test.backup-key'), true),
    path = join(dir, 'test.barbar-backup');
  await source
    .collection('users')
    .insertOne({ _id: 'u1', username: 'owner', passwordHash: 'test-hash', active: true });
  await source.collection('users').createIndex({ username: 1 }, { unique: true });
  const excluded = [
    'sessions',
    'pushDevices',
    'stockAlertEvents',
    'purchaseEvents',
    'guestRequests',
    'guestLimits',
    'guestEvents',
    'appMigrations',
  ];
  for (const name of excluded)
    await source.collection(name).insertOne({ _id: `excluded-${name}`, purgeAt: new Date() });
  await source.collection('tables').insertOne({
    _id: 'table-1',
    id: 'table-1',
    name: '1',
    code: 'a'.repeat(32),
    active: true,
    order: 0,
  });
  await source.collection('tables').createIndex({ code: 1 }, { unique: true });
  await source.collection('orders').insertOne({
    _id: 'order-1',
    id: 'order-1',
    tableId: 'table-1',
    businessDay: '2026-09-22',
    openedAt: '2026-09-22T08:00:00.000Z',
    closedAt: '2026-09-22T09:00:00.000Z',
    status: 'paid',
    total: 1500,
    payments: [
      { method: 'cash', amount: 500 },
      { method: 'card', amount: 1000 },
    ],
  });
  await source.collection('orders').createIndex({ status: 1, businessDay: -1, openedAt: -1 });
  await source.collection('shifts').insertOne({
    _id: 'shift-1',
    id: 'shift-1',
    businessDay: '2026-09-22',
    closedAt: '2026-09-22T20:00:00.000Z',
    closedBy: { id: 'u1', fullName: 'Owner' },
    count: 1,
    revenue: 1500,
    payments: { cash: 500, card: 1000 },
    countedCash: 490,
    difference: -10,
  });
  await source.collection('shifts').createIndex({ businessDay: 1 }, { unique: true });
  await source.createCollection('empty');
  await source.collection('sales').insertMany(
    Array.from({ length: 501 }, (_, i) => ({
      _id: `sale-${i}`,
      when: new Date(),
      amount: BSON.Decimal128.fromString('1.234567890123'),
      count: BSON.Long.fromString('9007199254740993'),
    })),
  );
  const result = await backupDatabase(source, key, path);
  assert.equal(result.documents, 505);
  const verified = await readBackup(path, key, async (record) => {
    if (record.kind === 'document') assert.ok(!excluded.includes(record.collection));
  });
  assert.equal(verified.documents, 505);
  for (const name of excluded) {
    assert.ok(!Object.hasOwn(verified.header.indexes, name));
    assert.ok(!Object.hasOwn(verified.counts, name));
  }
  assert.equal((await restoreDatabase(client, target.databaseName, path, key)).verified, true);
  for (const name of ['users', 'sales', 'empty', 'tables', 'orders', 'shifts']) {
    const original = await source.collection(name).find().sort({ _id: 1 }).toArray();
    const restored = await target.collection(name).find().sort({ _id: 1 }).toArray();
    assert.equal(
      BSON.EJSON.stringify(restored, { relaxed: false }),
      BSON.EJSON.stringify(original, { relaxed: false }),
    );
    assert.deepEqual(await target.collection(name).indexes(), await source.collection(name).indexes());
  }
  const restoredNames = (await target.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  for (const name of excluded) assert.ok(!restoredNames.includes(name));
  await assert.rejects(
    target.collection('shifts').insertOne({ _id: 'duplicate-shift', businessDay: '2026-09-22' }),
    { code: 11000 },
  );
  assert.equal(
    (await target.collection('users').indexes()).find((i) => i.name === 'username_1').unique,
    true,
  );
  await assert.rejects(restoreDatabase(client, target.databaseName, path, key), /empty/);
  await assert.rejects(restoreDatabase(client, 'barbar', path, key), /barbar_restore/);
  await assert.rejects(readBackup(path, randomBytes(32)));
  const bytes = await readFile(path);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(join(dir, 'tampered'), bytes);
  await assert.rejects(readBackup(join(dir, 'tampered'), key));
  console.log(
    JSON.stringify({
      backupRestore: 'passed',
      documents: 505,
      tablesOrdersShifts: 'preserved',
      transientCollections: 'excluded',
      bsonTypes: 'preserved',
      indexes: 'restored',
      sessions: 'excluded',
      tampering: 'rejected',
      existingDatabase: 'protected',
    }),
  );
} finally {
  await source.dropDatabase();
  await target.dropDatabase();
  await client.close();
  await rm(dir, { recursive: true, force: true });
}
