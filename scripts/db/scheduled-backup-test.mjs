import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { retainedArchives, runScheduledBackup } from './scheduled-backup.mjs';

const uri = process.env.BARBAR_TEST_MONGODB_URI;
if (!uri || !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(uri)) throw new Error('Local test URI required');

const names = [];
for (let day = 1; day <= 40; day++)
  for (const hour of ['05', '23'])
    names.push(
      `barbar-2026-08-${String(((day - 1) % 31) + 1).padStart(2, '0')}T${hour}-00-00.000Z.barbar-backup`.replace(
        '2026-08-',
        day > 31 ? '2026-09-' : '2026-08-',
      ),
    );
names.push('notes.txt', 'last-run.json');
const { keep, remove } = retainedArchives(names, 7, 4);
assert.ok(!remove.includes('notes.txt') && !remove.includes('last-run.json'));
assert.ok(keep.has('barbar-2026-09-09T23-00-00.000Z.barbar-backup'));
assert.ok(!keep.has('barbar-2026-09-09T05-00-00.000Z.barbar-backup'));
assert.ok(keep.size <= 11 && keep.size >= 7);

const client = new MongoClient(uri);
const database = `barbar_test_scheduled_${crypto.randomUUID().replaceAll('-', '')}`;
const root = await mkdtemp(join(tmpdir(), 'barbar-scheduled-'));
try {
  await client.connect();
  const db = client.db(database);
  await db
    .collection('sales')
    .insertMany(Array.from({ length: 25 }, (_, i) => ({ _id: `s${i}`, revenue: i })));
  await db.collection('users').insertOne({ _id: 'owner', username: 'owner' });
  const directory = join(root, 'local');
  const mirror = join(root, 'mirror');
  await assert.rejects(
    runScheduledBackup({
      sourceUri: uri,
      sourceDatabase: database,
      restoreUri: `${uri}&appName=restore`,
      keyPath: join(root, 'k.backup-key'),
      directory,
    }),
    /MIRROR/,
  );
  await assert.rejects(
    runScheduledBackup({
      sourceUri: uri,
      sourceDatabase: database,
      restoreUri: `${uri}&appName=restore`,
      keyPath: join(root, 'k.backup-key'),
      directory,
      mirrorDirectory: mirror,
    }),
    /same disk/,
  );
  const result = await runScheduledBackup({
    sourceUri: uri,
    sourceDatabase: database,
    restoreUri: `${uri}&appName=restore`,
    keyPath: join(root, 'k.backup-key'),
    directory,
    mirrorDirectory: mirror,
    allowSameDevice: true,
    now: new Date('2026-09-15T02:30:00.000Z'),
  });
  assert.equal(result.documents, 26);
  assert.equal(result.restoreCheck, 'passed');
  assert.equal(typeof result.storage.usedPercent, 'number');
  assert.equal(result.storage.storageWarning, false);
  assert.deepEqual(
    (await readdir(mirror)).filter((n) => n.endsWith('.barbar-backup')),
    [result.archive],
  );
  const leftovers = (await client.db().admin().listDatabases({ nameOnly: true })).databases.filter((d) =>
    d.name.startsWith('barbar_restore_check_20260915023000'),
  );
  assert.equal(leftovers.length, 0);
  await writeFile(join(directory, 'barbar-2026-01-01T00-00-00.000Z.barbar-backup'), 'old');
  const second = await runScheduledBackup({
    sourceUri: uri,
    sourceDatabase: database,
    restoreUri: `${uri}&appName=restore`,
    keyPath: join(root, 'k.backup-key'),
    directory,
    mirrorDirectory: mirror,
    allowSameDevice: true,
    daily: 1,
    weekly: 1,
    now: new Date('2026-09-16T02:30:00.000Z'),
  });
  assert.ok(second.pruned >= 2);
  console.log(
    JSON.stringify({
      scheduledBackup: 'passed',
      documents: result.documents,
      retention: 'verified',
      restoreDatabase: 'dropped',
    }),
  );
} finally {
  await client
    .db(database)
    .dropDatabase()
    .catch(() => {});
  await client.close();
}
