import { MongoClient, type Db, type Document, type ClientSession } from 'mongodb';
import { migrateBottleCatalog } from '../../src/barbar/bottles';
import { initialData, validateData } from '../../src/barbar/model';
import type { BarData } from '../../src/barbar/types';
import type { Repository, Snapshot } from './barbar-repository';

const collections = ['alcohol', 'cocktails', 'purchases', 'sales', 'stockResets'] as const;
type CollectionName = (typeof collections)[number];
type Row = Document & { _id: string; _order: number; id: string };
type Metadata = {
  _id: 'state';
  revision: string;
  version: 1;
  operations: string[];
  archived?: BarData['archived'];
};
const transactionOptions = {
  readConcern: { level: 'snapshot' as const },
  writeConcern: { w: 'majority' as const },
  readPreference: 'primary' as const,
  maxCommitTimeMS: 10000,
};

export function mongoRepository(
  client: MongoClient,
  db: Db,
  loadLegacy: () => Promise<BarData> = async () => initialData(),
): Repository {
  const state = db.collection<Metadata>('state');
  let ready: Promise<void> | undefined;
  const rows = (data: BarData, name: CollectionName) => data[name] || [];
  async function writeChanges(session: ClientSession, previous: BarData, next: BarData) {
    for (const name of collections) {
      const old = new Map(
        rows(previous, name).map((row, index) => [row.id, JSON.stringify({ ...row, _order: index })]),
      );
      const updated = rows(next, name);
      const ids = new Set(updated.map((row) => row.id));
      const collection = db.collection<Row>(name);
      const deleted = [...old.keys()].filter((id) => !ids.has(id));
      if (deleted.length) await collection.deleteMany({ _id: { $in: deleted } }, { session });
      const changes = updated.flatMap((row, index) => {
        const value = { ...row, _order: index };
        return old.get(row.id) === JSON.stringify(value)
          ? []
          : [
              {
                replaceOne: { filter: { _id: row.id }, replacement: { ...value, _id: row.id }, upsert: true },
              },
            ];
      });
      if (changes.length) await collection.bulkWrite(changes, { session });
    }
  }
  const metadata = (data: BarData, revision: string): Metadata => ({
    _id: 'state',
    revision,
    version: data.version,
    operations: data.operations,
    ...(data.archived ? { archived: data.archived } : {}),
  });
  async function initialize() {
    if (await state.findOne({ _id: 'state' })) return;
    // Fail closed if the old store cannot be read. Never seed an empty bar over an unreadable ledger.
    const data = validateData(await loadLegacy());
    for (const name of ['state', ...collections]) {
      try {
        await db.createCollection(name);
      } catch (error) {
        if ((error as { code?: number }).code !== 48) throw error;
      }
    }
    await db.collection('sales').createIndex({ date: 1, createdAt: 1 });
    await db.collection('purchases').createIndex({ date: 1, alcoholId: 1 });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        if (await state.findOne({ _id: 'state' }, { session })) return;
        // First write serializes competing initializers before importing their snapshots.
        await state.insertOne(metadata(data, crypto.randomUUID()), { session });
        const empty: BarData = {
          version: 1,
          alcohol: [],
          cocktails: [],
          purchases: [],
          sales: [],
          operations: [],
        };
        await writeChanges(session, empty, data);
      }, transactionOptions);
    } catch (error) {
      // A concurrent first import may have won the unique state key.
      if ((error as { code?: number }).code !== 11000 || !(await state.findOne({ _id: 'state' })))
        throw error;
    } finally {
      await session.endSession();
    }
  }
  async function ensureReady() {
    ready ||= initialize().catch((error) => {
      ready = undefined;
      throw error;
    });
    await ready;
  }
  return {
    async read(): Promise<Snapshot> {
      await ensureReady();
      const session = client.startSession();
      try {
        return await session.withTransaction(async () => {
          const meta = await state.findOne({ _id: 'state' }, { session });
          if (!meta || meta.version !== 1) throw new Error('Unsupported database schema');
          const data: BarData = {
            version: 1,
            operations: meta.operations,
            alcohol: [],
            cocktails: [],
            purchases: [],
            sales: [],
            ...(meta.archived ? { archived: meta.archived } : {}),
          };
          // MongoDB sessions do not support parallel queries inside a transaction.
          for (const name of collections) {
            const documents = await db
              .collection<Row>(name)
              .find({}, { session })
              .sort({ _order: 1 })
              .toArray();
            Object.assign(data, {
              [name]: documents.map(({ _id, _order, ...row }) => {
                void _id;
                void _order;
                return row;
              }),
            });
          }
          const migrated = migrateBottleCatalog(data);
          if (migrated !== data) {
            validateData(migrated);
            const revision = crypto.randomUUID();
            await state.replaceOne({ _id: 'state', revision: meta.revision }, metadata(migrated, revision), {
              session,
            });
            await writeChanges(session, data, migrated);
            return { data: migrated, revision, days: {} };
          }
          return { data, revision: meta.revision, days: {} };
        }, transactionOptions);
      } finally {
        await session.endSession();
      }
    },
    async commit(current, next) {
      await ensureReady();
      const session = client.startSession();
      try {
        return await session.withTransaction(async () => {
          const revision = crypto.randomUUID();
          const result = await state.replaceOne(
            { _id: 'state', revision: current.revision || '' },
            metadata(next, revision),
            { session },
          );
          if (!result.matchedCount) return { modified: false };
          await writeChanges(session, current.data, next);
          return { modified: true, revision };
        }, transactionOptions);
      } finally {
        await session.endSession();
      }
    },
  };
}

export interface DeployInfo {
  context: string;
  id: string;
}

export function mongoConnection(local = false, deploy?: DeployInfo) {
  const uri =
    process.env.BARBAR_MONGODB_URI ||
    (local ? 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true' : '');
  if (!uri) throw new Error('BARBAR_MONGODB_URI is required');
  const base = process.env.BARBAR_MONGODB_DATABASE || 'barbar';
  // CONTEXT/BRANCH are build variables, not guaranteed at Functions runtime.
  if (!local && (!deploy?.context || !deploy.id)) throw new Error('Missing Netlify deploy context');
  const database =
    !local && deploy!.context !== 'production'
      ? `${base}_preview_${deploy!.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
      : base;
  const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
  return { client, db: client.db(database) };
}
