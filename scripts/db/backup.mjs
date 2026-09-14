import { MongoClient, BSON } from 'mongodb';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, chmod, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
const magic = Buffer.from('BARBARDB1');
const encode = (record) =>
  JSON.stringify(
    record.kind === 'document'
      ? { ...record, value: BSON.EJSON.serialize(record.value, { relaxed: false }) }
      : record,
  );
export async function encryptionKey(path, create = false) {
  try {
    const info = await stat(path);
    if ((info.mode & 0o077) !== 0) throw new Error('Key file permissions must be 0600.');
    const value = Buffer.from((await readFile(path, 'utf8')).trim(), 'base64');
    if (value.length !== 32) throw new Error('Invalid backup key.');
    return value;
  } catch (error) {
    if (!create || error.code !== 'ENOENT') throw error;
    const key = randomBytes(32);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, key.toString('base64'), { mode: 0o600, flag: 'wx' });
    return key;
  }
}
/** Consistent logical snapshot, encrypted locally. Sessions are intentionally omitted. */
export async function backupDatabase(db, key, path) {
  const names = (await db.listCollections({ type: 'collection' }, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.') && !['sessions', 'pushDevices', 'stockAlertEvents'].includes(n))
    .sort();
  const indexes = {};
  for (const name of names) indexes[name] = await db.collection(name).indexes();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv),
    zip = createGzip();
  await writeFile(path, Buffer.concat([magic, iv]), { flag: 'wx', mode: 0o600 });
  const output = createWriteStream(path, { flags: 'a', mode: 0o600 });
  const done = pipeline(zip, cipher, output);
  // Observe early stream errors while awaiting database reads.
  done.catch(() => {});
  const counts = {},
    hash = createHash('sha256');
  const put = async (value) => {
    const line = encode(value) + '\n';
    if (!zip.write(line)) await once(zip, 'drain');
  };
  const session = db.client.startSession();
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' }, readPreference: 'primary' });
    await put({
      kind: 'header',
      version: 1,
      database: db.databaseName,
      createdAt: new Date().toISOString(),
      indexes,
    });
    for (const name of names) {
      counts[name] = 0;
      for await (const value of db
        .collection(name)
        .find({}, { session, batchSize: 250, promoteValues: false })
        .sort({ _id: 1 })) {
        const record = { kind: 'document', collection: name, value };
        hash.update(encode(record) + '\n');
        await put(record);
        counts[name]++;
      }
    }
    await session.commitTransaction();
    await put({ kind: 'footer', counts, digest: hash.digest('hex') });
    zip.end();
    await done;
    await appendFile(path, cipher.getAuthTag());
    await chmod(path, 0o600);
    return {
      collections: names.length,
      documents: Object.values(counts).reduce((a, b) => a + b, 0),
      bytes: (await stat(path)).size,
    };
  } catch (error) {
    zip.destroy();
    await done.catch(() => {});
    if (session.inTransaction()) await session.abortTransaction().catch(() => {});
    await unlink(path).catch(() => {});
    throw error;
  } finally {
    await session.endSession();
  }
}
export async function readBackup(path, key, onRecord = async () => {}) {
  const length = (await stat(path)).size;
  if (length < magic.length + 28) throw new Error('Truncated backup.');
  const file = await import('node:fs/promises').then((fs) => fs.open(path, 'r'));
  const header = Buffer.alloc(magic.length + 12),
    tag = Buffer.alloc(16);
  try {
    await file.read(header, 0, header.length, 0);
    await file.read(tag, 0, 16, length - 16);
  } finally {
    await file.close();
  }
  if (!header.subarray(0, magic.length).equals(magic)) throw new Error('Unsupported backup.');
  const decrypt = createDecipheriv('aes-256-gcm', key, header.subarray(magic.length));
  decrypt.setAuthTag(tag);
  const unzip = createGunzip();
  const done = pipeline(createReadStream(path, { start: header.length, end: length - 17 }), decrypt, unzip);
  done.catch(() => {});
  const lines = createInterface({ input: unzip, crlfDelay: Infinity }),
    hash = createHash('sha256'),
    counts = {};
  let first, footer;
  try {
    for await (const line of lines) {
      const value = JSON.parse(line);
      if (value.kind === 'document') value.value = BSON.EJSON.deserialize(value.value, { relaxed: false });
      if (!first) {
        if (value.kind !== 'header' || value.version !== 1) throw new Error('Invalid backup header.');
        first = value;
      } else if (value.kind === 'document' && !footer) {
        hash.update(line + '\n');
        counts[value.collection] = (counts[value.collection] || 0) + 1;
      } else if (value.kind === 'footer' && !footer) footer = value;
      else throw new Error('Invalid backup record.');
      await onRecord(value);
    }
    await done;
    if (!footer || footer.digest !== hash.digest('hex')) throw new Error('Backup integrity check failed.');
    for (const [name, count] of Object.entries(footer.counts))
      if ((counts[name] || 0) !== count) throw new Error('Backup count mismatch.');
    return {
      header: first,
      counts: footer.counts,
      documents: Object.values(footer.counts).reduce((a, b) => a + b, 0),
    };
  } catch (error) {
    unzip.destroy();
    lines.close();
    await done.catch(() => {});
    throw error;
  }
}
/** Always restores into a fresh named database. Never overwrites an existing database. */
export async function restoreDatabase(client, target, path, key) {
  if (!/^barbar_restore_[a-zA-Z0-9_]+$/.test(target))
    throw new Error('Target must start with barbar_restore_.');
  const verified = await readBackup(path, key);
  const db = client.db(target);
  if ((await db.listCollections({}, { nameOnly: true }).toArray()).length)
    throw new Error('Restore target must be empty.');
  // Reserve target atomically; a competing restore fails instead of mixing snapshots.
  await db.createCollection('_restore_in_progress');
  const counts = {};
  const buffers = new Map();
  const flush = async (name) => {
    const batch = buffers.get(name) || [];
    if (batch.length) {
      await db.collection(name).insertMany(batch);
      counts[name] = (counts[name] || 0) + batch.length;
      buffers.set(name, []);
    }
  };
  await readBackup(path, key, async (record) => {
    if (record.kind !== 'document') return;
    if (
      ['sessions', 'pushDevices', 'stockAlertEvents'].includes(record.collection) ||
      record.collection.startsWith('system.') ||
      record.collection === '_restore_in_progress'
    )
      throw new Error('Unsupported collection.');
    const batch = buffers.get(record.collection) || [];
    batch.push(record.value);
    buffers.set(record.collection, batch);
    if (batch.length >= 250) await flush(record.collection);
  });
  for (const name of buffers.keys()) await flush(name);
  for (const [name, indexes] of Object.entries(verified.header.indexes)) {
    if (!buffers.has(name)) await db.createCollection(name);
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      const {
        key: spec,
        name: label,
        unique,
        sparse,
        expireAfterSeconds,
        partialFilterExpression,
        collation,
      } = index;
      await db.collection(name).createIndex(spec, {
        name: label,
        ...(unique ? { unique } : {}),
        ...(sparse ? { sparse } : {}),
        ...(expireAfterSeconds !== undefined ? { expireAfterSeconds } : {}),
        ...(partialFilterExpression ? { partialFilterExpression } : {}),
        ...(collation ? { collation } : {}),
      });
    }
  }
  for (const [name, count] of Object.entries(verified.counts))
    if ((await db.collection(name).countDocuments()) !== count)
      throw new Error('Restored document count mismatch.');
  await db.collection('_restore_in_progress').drop();
  return { database: target, documents: verified.documents, verified: true };
}
async function main() {
  const [mode, suppliedPath, target] = process.argv.slice(2);
  const pathArg =
    suppliedPath ||
    (mode === 'backup'
      ? `.barbar-backups/barbar-${new Date().toISOString().replaceAll(':', '-')}.barbar-backup`
      : undefined);
  if (!['backup', 'verify', 'restore'].includes(mode) || !pathArg)
    throw new Error('Usage: node scripts/db/backup.mjs backup|verify|restore FILE [barbar_restore_NAME]');
  if (process.env.BARBAR_BACKUP_ENV_FILE) process.loadEnvFile(process.env.BARBAR_BACKUP_ENV_FILE);
  const keyPath = process.env.BARBAR_BACKUP_KEY_FILE;
  if (!keyPath) throw new Error('Set BARBAR_BACKUP_KEY_FILE outside version control.');
  const key = await encryptionKey(resolve(keyPath), mode === 'backup'),
    path = resolve(pathArg);
  if (mode === 'verify') {
    const r = await readBackup(path, key);
    console.log(
      JSON.stringify({ verified: true, documents: r.documents, collections: Object.keys(r.counts).length }),
    );
    return;
  }
  const uri =
    mode === 'restore' ? process.env.BARBAR_RESTORE_MONGODB_URI : process.env.BARBAR_BACKUP_MONGODB_URI;
  if (!uri) throw new Error('Configure the private backup or separate restore connection.');
  const client = new MongoClient(uri, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000 });
  try {
    console.log(
      JSON.stringify(
        mode === 'backup'
          ? await backupDatabase(client.db(process.env.BARBAR_BACKUP_DATABASE || 'barbar'), key, path)
          : await restoreDatabase(client, target, path, key),
      ),
    );
  } finally {
    await client.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error('Backup operation failed:', error?.name || 'Error');
    process.exitCode = 1;
  });
