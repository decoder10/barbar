import { MongoClient } from 'mongodb';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import presets from '../../src/barbar/config/presets.json' with { type: 'json' };

const MB = 1024 * 1024;
const day = 86400000;

async function collectionSizes(db, name) {
  try {
    const [stats] = await db
      .collection(name)
      .aggregate([{ $collStats: { storageStats: { scale: 1 } } }])
      .toArray();
    const s = stats.storageStats;
    return {
      name,
      documents: s.count,
      dataBytes: s.size,
      storageBytes: s.storageSize,
      indexBytes: s.totalIndexSize,
      averageDocumentBytes: Math.round(s.avgObjSize || 0),
    };
  } catch {
    // Shared tiers may restrict $collStats: fall back to counts only.
    return {
      name,
      documents: await db.collection(name).estimatedDocumentCount(),
      dataBytes: null,
      storageBytes: null,
      indexBytes: null,
      averageDocumentBytes: null,
    };
  }
}

/** Read-only: dbStats, per-collection sizes and 30/90-day document growth of the ledger and audit. */
export async function storageReport(db, { limitMb = presets.storage.limitMb, now = new Date() } = {}) {
  const stats = await db.stats({ scale: 1 });
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'))
    .sort();
  const collections = [];
  for (const name of names) collections.push(await collectionSizes(db, name));
  collections.sort(
    (a, b) => (b.storageBytes || 0) + (b.indexBytes || 0) - ((a.storageBytes || 0) + (a.indexBytes || 0)),
  );
  const since = (days) => new Date(now.getTime() - days * day).toISOString().slice(0, 10);
  const growth = {};
  for (const [name, field] of [
    ['sales', 'date'],
    ['purchases', 'date'],
    ['stockMovements', 'date'],
    ['expenses', 'date'],
    ['auditEvents', 'createdAt'],
  ]) {
    if (!names.includes(name)) continue;
    const collection = db.collection(name);
    const filter = (days) => ({
      [field]: {
        $gte: field === 'createdAt' ? new Date(now.getTime() - days * day).toISOString() : since(days),
      },
    });
    growth[name] = {
      last30Days: await collection.countDocuments(filter(30)),
      last90Days: await collection.countDocuments(filter(90)),
    };
  }
  // Atlas Free counts documents plus indexes of all databases on the cluster, e.g. old preview databases.
  let databases = null;
  try {
    const listed = await db.client
      .db('admin')
      .command({ listDatabases: 1, authorizedDatabases: true, nameOnly: false });
    databases = listed.databases.map((d) => ({
      name: d.name,
      sizeOnDiskMb: +((d.sizeOnDisk || 0) / MB).toFixed(2),
    }));
  } catch {
    databases = null;
  }
  const used = stats.dataSize + stats.indexSize;
  const bytesPerDay = collections.reduce((sum, c) => {
    const g = growth[c.name];
    if (!g || !c.averageDocumentBytes) return sum;
    // Documents plus a proportional share of their indexes.
    const indexShare = c.documents ? (c.indexBytes || 0) / c.documents : 0;
    return sum + (g.last90Days / 90) * (c.averageDocumentBytes + indexShare);
  }, 0);
  const remainingBytes = limitMb * MB - used;
  return {
    database: db.databaseName,
    at: now.toISOString(),
    limitMb,
    dataMb: +(stats.dataSize / MB).toFixed(2),
    storageMb: +(stats.storageSize / MB).toFixed(2),
    indexMb: +(stats.indexSize / MB).toFixed(2),
    usedPercent: +((used / (limitMb * MB)) * 100).toFixed(1),
    databases,
    collections: collections.map((c) => ({
      ...c,
      dataMb: c.dataBytes === null ? null : +(c.dataBytes / MB).toFixed(3),
      indexMb: c.indexBytes === null ? null : +(c.indexBytes / MB).toFixed(3),
    })),
    growth,
    estimatedMbPerMonth: +((bytesPerDay * 30) / MB).toFixed(3),
    estimatedMonthsLeft: bytesPerDay > 0 ? Math.floor(remainingBytes / bytesPerDay / 30) : null,
  };
}

async function main() {
  if (process.env.BARBAR_BACKUP_ENV_FILE) process.loadEnvFile(process.env.BARBAR_BACKUP_ENV_FILE);
  const uri = process.env.BARBAR_STORAGE_MONGODB_URI || process.env.BARBAR_BACKUP_MONGODB_URI;
  if (!uri)
    throw new Error('Set BARBAR_BACKUP_MONGODB_URI in .env.backup (a read-only Atlas user is enough).');
  const client = new MongoClient(uri, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    readPreference: 'secondaryPreferred',
  });
  try {
    const report = await storageReport(client.db(process.env.BARBAR_BACKUP_DATABASE || 'barbar'), {
      limitMb: Number(process.env.BARBAR_STORAGE_LIMIT_MB || presets.storage.limitMb),
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error('Storage report failed:', error?.message || 'Error');
    process.exitCode = 1;
  });
