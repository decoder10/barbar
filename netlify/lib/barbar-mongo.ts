import { ensurePushIndexes } from './notifications/subscriptions';
import { recordStockAlerts } from './notifications/events';
import { MongoClient, type ClientSession, type Db, type Document } from 'mongodb';
import { migrateBottleCatalog } from '../../src/barbar/domain/catalog/bottles';
import { applyCommand, initialData, validateData } from '../../src/barbar/domain/model';
import type { BarData, Sale } from '../../src/barbar/domain/types';
import { businessToday } from '../../src/barbar/domain/business-day';
import { compactData, saveBalances, workingData } from './barbar-working';
import { commandAudit, appendAudit } from './audit/store';
import type { Repository, Snapshot } from './barbar-repository';

import { ensureLedgerIndexes, ledgerCollections as collections } from './database/indexes';

type CollectionName = (typeof collections)[number];
type Row = Document & { _id: string; _order: number; id: string };
type Metadata = {
  _id: 'state';
  revision: string;
  catalogRevision?: string;
  version: 1;
  operations: string[];
  readModelVersion?: number;
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
  const catalogCaches = new Map<
    string,
    { catalogRevision: string; data: Pick<BarData, 'alcohol' | 'cocktails'> }
  >();
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
  const metadata = (data: BarData, revision: string, catalogRevision = revision): Metadata => ({
    catalogRevision,
    _id: 'state',
    revision,
    version: data.version,
    operations: data.operations,
    readModelVersion: 1,
    ...(data.archived ? { archived: data.archived } : {}),
  });
  async function initialize() {
    // Also upgrade indexes for an existing ledger; never reimport its catalog.
    await ensureLedgerIndexes(db);
    await ensurePushIndexes(db);
    const existing = await state.findOne({ _id: 'state' });
    if (existing?.readModelVersion === 1) return;
    if (existing) {
      await client.withSession((session) =>
        session.withTransaction(async () => {
          const meta = await state.findOne({ _id: 'state' }, { session });
          if (meta?.readModelVersion === 1) return;
          const data: BarData = {
            version: 1,
            alcohol: [],
            cocktails: [],
            purchases: [],
            sales: [],
            operations: meta!.operations,
            ...(meta?.archived ? { archived: meta.archived } : {}),
          };
          for (const name of collections)
            Object.assign(data, {
              [name]: await db
                .collection(name)
                .find({}, { session, projection: { _id: 0, _order: 0 } })
                .sort({ _order: 1 })
                .toArray(),
            });
          const migrated = migrateBottleCatalog(data);
          validateData(migrated);
          await writeChanges(session, data, migrated);
          await saveBalances(db, session, migrated);
          await state.replaceOne({ _id: 'state' }, metadata(migrated, crypto.randomUUID()), { session });
        }, transactionOptions),
      );
      return;
    }
    // Fail closed if the old store cannot be read. Never seed an empty bar over an unreadable ledger.
    const data = validateData(await loadLegacy());
    for (const name of ['state', ...collections]) {
      try {
        await db.createCollection(name);
      } catch (error) {
        if ((error as { code?: number }).code !== 48) throw error;
      }
    }
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
        await saveBalances(db, session, data);
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
    async readStock(known) {
      await ensureReady();
      if (known) {
        const meta = await state.findOne(
          { _id: 'state' },
          { projection: { revision: 1, catalogRevision: 1 } },
        );
        if (known === meta?.revision)
          return {
            revision: meta.revision,
            catalogRevision: meta.catalogRevision || meta.revision,
            unchanged: true,
          };
      }
      return client.withSession((session) =>
        session.withTransaction(async () => {
          const meta = await state.findOne(
            { _id: 'state' },
            { session, projection: { revision: 1, catalogRevision: 1, archived: 1 } },
          );
          const common = {
            revision: meta!.revision,
            catalogRevision: meta!.catalogRevision || meta!.revision,
          };
          if (known === meta!.revision) return { ...common, unchanged: true };
          const balances = await db
            .collection<import('./barbar-working').Balance>('stockBalances')
            .find({}, { session })
            .toArray();
          return {
            ...common,
            stock: balances.map((b) => ({ alcoholId: b._id, ml: b.ml, cost: b.cost })),
            ...(meta?.archived ? { historyBefore: meta.archived.before } : {}),
          };
        }, transactionOptions),
      );
    },
    async readCatalog(known, resource) {
      await ensureReady();
      const cacheKey = resource || 'all';
      const catalogCache = catalogCaches.get(cacheKey);
      if (known || catalogCache) {
        // Validate the live revision even on a cache hit. Never cache permissions.
        const meta = await state.findOne(
          { _id: 'state' },
          { projection: { revision: 1, catalogRevision: 1 } },
        );
        const catalogRevision = meta!.catalogRevision || meta!.revision;
        if (known === catalogRevision) return { catalogRevision, unchanged: true };
        if (catalogCache?.catalogRevision === catalogRevision) return structuredClone(catalogCache);
        catalogCaches.delete(cacheKey);
      }
      const result = await client.withSession((session) =>
        session.withTransaction(async () => {
          const meta = await state.findOne(
            { _id: 'state' },
            { session, projection: { revision: 1, catalogRevision: 1 } },
          );
          const catalogRevision = meta!.catalogRevision || meta!.revision;
          if (known === catalogRevision) return { catalogRevision, unchanged: true };
          const alcohol =
            resource === 'cocktails'
              ? []
              : await db
                  .collection('alcohol')
                  .find({}, { session, projection: { _id: 0, _order: 0 } })
                  .sort({ _order: 1 })
                  .toArray();
          const cocktails =
            resource === 'alcohol'
              ? []
              : await db
                  .collection('cocktails')
                  .find({}, { session, projection: { _id: 0, _order: 0 } })
                  .sort({ _order: 1 })
                  .toArray();
          return {
            catalogRevision,
            data: { alcohol, cocktails } as unknown as Pick<BarData, 'alcohol' | 'cocktails'>,
          };
        }, transactionOptions),
      );
      // Bounded snapshots per resource; the combined route remains for older clients.
      if (result.data && JSON.stringify(result.data).length <= (resource ? 500_000 : 1_000_000)) {
        catalogCaches.set(
          cacheKey,
          structuredClone({ catalogRevision: result.catalogRevision, data: result.data }),
        );
      }
      return result;
    },
    async readSale(id) {
      await ensureReady();
      return ((await db
        .collection('sales')
        .findOne({ _id: id as never }, { projection: { _id: 0, _order: 0 } })) || undefined) as
        Sale | undefined;
    },
    async readWorking() {
      await ensureReady();
      return client.withSession((session) =>
        session.withTransaction(async () => {
          const meta = await state.findOne({ _id: 'state' }, { session });
          return {
            data: {
              ...(await workingData(db, session, meta!.operations)),
              ...(meta?.archived ? { historyBefore: meta.archived.before } : {}),
            },
            revision: meta!.revision,
            catalogRevision: meta!.catalogRevision || meta!.revision,
            days: {},
          };
        }, transactionOptions),
      );
    },
    async execute(command, actor) {
      if (!command || typeof command.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(command.id))
        throw Object.assign(new Error('Некорректная операция.'), { status: 400 });
      if (
        ['restore', 'purge', 'correctPurchase'].includes(command?.type) ||
        (command?.type === 'sale' && command.value?.date !== businessToday())
      )
        return null;
      await ensureReady();
      return client.withSession((session) =>
        session.withTransaction(async () => {
          const meta = await state.findOne({ _id: 'state' }, { session });
          const current = await workingData(db, session, meta!.operations);
          current.historyBefore = meta?.archived?.before;
          if (
            await db
              .collection('auditEvents')
              .findOne({ _id: command.id as never }, { session, projection: { _id: 1 } })
          )
            return {
              data: current,
              revision: meta!.revision,
              catalogRevision: meta!.catalogRevision || meta!.revision,
              days: {},
            };
          const previousBalances = current.opening!.ingredients.map((b) => ({
            _id: b.alcoholId,
            ml: b.ml,
            cost: b.cost,
          }));
          const duplicateCollection =
            command.type === 'sale'
              ? 'sales'
              : ['count', 'writeoff', 'prepare'].includes(command.type)
                ? 'stockMovements'
                : command.type === 'expense'
                  ? 'expenses'
                  : null;
          if (
            duplicateCollection &&
            (await db
              .collection(duplicateCollection)
              .findOne({ _id: command.id as never }, { session, projection: { _id: 1 } }))
          )
            return {
              data: current,
              revision: meta!.revision,
              catalogRevision: meta!.catalogRevision || meta!.revision,
              days: {},
            };
          if (
            command.type === 'purchase' &&
            command.value?.id &&
            (await db
              .collection('purchases')
              .findOne({ _id: command.value.id as never }, { session, projection: { _id: 1 } }))
          ) {
            if (meta!.operations.includes(command.id))
              return {
                data: current,
                revision: meta!.revision,
                catalogRevision: meta!.catalogRevision || meta!.revision,
                days: {},
              };
            throw Object.assign(new Error('Закупка с таким идентификатором уже существует.'), {
              status: 400,
            });
          }
          if (command.type === 'void') {
            const sale = await db
              .collection('sales')
              .findOne({ _id: command.saleId as never }, { session, projection: { _id: 0, _order: 0 } });
            if (sale) {
              current.sales = [sale as unknown as BarData['sales'][number]];
              if (!sale.voided)
                for (const i of sale.ingredients) {
                  const balance = current.opening!.ingredients.find((b) => b.alcoholId === i.alcoholId)!;
                  balance.ml += i.ml;
                  balance.cost += i.cost;
                }
            }
          }
          if (command.type === 'voidExpense') {
            const expense = await db
              .collection('expenses')
              .findOne({ _id: command.expenseId as never }, { session, projection: { _id: 0, _order: 0 } });
            if (expense) current.expenses = [expense as unknown as NonNullable<BarData['expenses']>[number]];
          }
          let next: BarData;
          try {
            next = applyCommand(current, command);
          } catch (error) {
            throw Object.assign(error instanceof Error ? error : new Error('Некорректная операция.'), {
              status: 400,
            });
          }
          if (next === current)
            return {
              data: {
                ...(await workingData(db, session, meta!.operations)),
                ...(meta?.archived ? { historyBefore: meta.archived.before } : {}),
              },
              revision: meta!.revision,
              catalogRevision: meta!.catalogRevision || meta!.revision,
              days: {},
            };
          const revision = crypto.randomUUID();
          const catalogRevision =
            JSON.stringify([current.alcohol, current.cocktails]) !==
            JSON.stringify([next.alcohol, next.cocktails])
              ? revision
              : meta!.catalogRevision || meta!.revision;
          // One ledger-wide write serializes balances and guards concurrent consumption.
          const saved = await state.updateOne(
            { _id: 'state', revision: meta!.revision },
            { $set: { revision, catalogRevision, operations: next.operations } },
            { session },
          );
          if (!saved.matchedCount) throw new Error('Concurrent ledger revision');
          for (const name of collections) {
            const previous = new Map(rows(current, name).map((r) => [r.id, JSON.stringify(r)]));
            for (const [index, row] of rows(next, name).entries()) {
              if (previous.get(row.id) === JSON.stringify(row)) continue;
              const catalog = name === 'alcohol' || name === 'cocktails';
              await db.collection<Row>(name).updateOne(
                { _id: row.id },
                {
                  $set: { ...row, ...(catalog ? { _order: index } : {}) },
                  $setOnInsert: { ...(catalog ? {} : { _order: Date.now() }) },
                },
                { upsert: true, session },
              );
            }
          }
          await saveBalances(db, session, next, previousBalances);
          await appendAudit(db, session, commandAudit(command, next, actor));
          if (command.type === 'sale') await recordStockAlerts(db, session, command.id, current, next);
          const compact = compactData(next);
          return {
            data: compact,
            revision,
            catalogRevision,
            baseRevision: meta!.revision,
            changedStock: compact.opening!.ingredients.filter((b) => {
              const previous = previousBalances.find((p) => p._id === b.alcoholId);
              return !previous || previous.ml !== b.ml || previous.cost !== b.cost;
            }),
            sale: command.type === 'sale' ? next.sales.find((s) => s.id === command.id) : undefined,
            days: {},
          };
        }, transactionOptions),
      );
    },
    async readRevision() {
      await ensureReady();
      return (await state.findOne({ _id: 'state' }, { projection: { revision: 1 } }))?.revision || null;
    },
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
            await saveBalances(db, session, migrated);
            return { data: migrated, revision, days: {} };
          }
          return {
            data,
            revision: meta.revision,
            catalogRevision: meta.catalogRevision || meta.revision,
            days: {},
          };
        }, transactionOptions);
      } finally {
        await session.endSession();
      }
    },
    async commit(current, next, audit) {
      await ensureReady();
      const session = client.startSession();
      try {
        return await session.withTransaction(async () => {
          const revision = crypto.randomUUID();
          const result = await state.replaceOne(
            { _id: 'state', revision: current.revision || '' },
            metadata(
              next,
              revision,
              JSON.stringify([current.data.alcohol, current.data.cocktails]) ===
                JSON.stringify([next.alcohol, next.cocktails])
                ? current.catalogRevision || current.revision || revision
                : revision,
            ),
            { session },
          );
          if (!result.matchedCount) return { modified: false };
          await writeChanges(session, current.data, next);
          await saveBalances(db, session, next);
          if (audit) await appendAudit(db, session, audit);
          if (audit?.action === 'sale') await recordStockAlerts(db, session, audit.id, current.data, next);
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

const connections = new Map<string, { client: MongoClient; db: Db }>();
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
  const key = `${uri}|${database}`;
  if (!local && connections.has(key)) return connections.get(key)!;
  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    maxIdleTimeMS: 60000,
  });
  const connection = { client, db: client.db(database) };
  if (!local) connections.set(key, connection);
  return connection;
}
