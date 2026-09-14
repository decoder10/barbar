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
  await source.collection('sessions').insertOne({ _id: 'excluded-session' });
  await source.collection('appMigrations').insertOne({ _id: 'excluded-migration' });
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
  assert.equal(result.documents, 502);
  assert.equal((await readBackup(path, key)).documents, 502);
  assert.equal((await restoreDatabase(client, target.databaseName, path, key)).verified, true);
  for (const name of ['users', 'sales', 'empty']) {
    const original = await source.collection(name).find().sort({ _id: 1 }).toArray();
    const restored = await target.collection(name).find().sort({ _id: 1 }).toArray();
    assert.equal(
      BSON.EJSON.stringify(restored, { relaxed: false }),
      BSON.EJSON.stringify(original, { relaxed: false }),
    );
  }
  assert.equal(await target.collection('sessions').countDocuments(), 0);
  assert.equal(await target.collection('appMigrations').countDocuments(), 0);
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
      documents: 502,
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
