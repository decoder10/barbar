import {
  acceptGuestRequest,
  guestRequestStatus,
  type GuestRequest,
} from '../../src/barbar/domain/guest-requests';
import { shiftPreview, paidOrderTotals } from '../../src/barbar/domain/shifts';
import { guestOrderStore } from './guest-order-store';
import { ensurePushIndexes } from './notifications/subscriptions';
import { recordPurchaseEvent, recordStockAlerts } from './notifications/events';
import { MongoClient, type ClientSession, type Db, type Document } from 'mongodb';
import { migrateBottleCatalog } from '../../src/barbar/domain/catalog/bottles';
import {
  applyCommand,
  initialData,
  priceBasis,
  purchaseCorrectionError,
  quantityRound,
  validateData,
} from '../../src/barbar/domain/model';
import { assertHistoricalStock, purchaseCostTotals } from './history-corrections';
import type { BarData, BarTable, Order, Sale } from '../../src/barbar/domain/types';
import { businessToday } from '../../src/barbar/domain/business-day';
import { compactData, saveBalances, workingData } from './barbar-working';
import { commandAudit, appendAudit } from './audit/store';
import type { Repository, Snapshot } from './barbar-repository';

import {
  ensureAuditIndexes,
  ensureLedgerIndexes,
  ledgerCollections as collections,
} from './database/indexes';
import { revisionQuery } from './queries/cache';
import { seedFoodCatalog } from './database/food-catalog';
import { convertGoodsCatalog, mergeGoodsCatalog } from './database/goods-catalog';

export interface RepositoryOptions {
  /** False for an explicitly selected live database: never import, reseed or migrate on start. */
  migrations?: boolean;
}
const migrationBlocked = () =>
  Object.assign(
    new Error('Эта база требует миграции. Запустите опубликованную версию приложения, а не локальную.'),
    { status: 503 },
  );

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
  options: RepositoryOptions = {},
): Repository {
  const migrations = options.migrations !== false;
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
    const existing = await state.findOne({ _id: 'state' });
    if (!migrations) {
      if (existing?.readModelVersion !== 1) throw migrationBlocked();
      return;
    }
    // Also upgrade indexes for an existing ledger; never reimport its catalog.
    await ensureLedgerIndexes(db);
    await ensureAuditIndexes(db);
    await ensurePushIndexes(db);
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
    ready ||= initialize()
      .then(async () => {
        // Insert-only catalog upgrades, once per database and never for an explicitly selected live DB.
        if (!migrations) return;
        await seedFoodCatalog(client, db);
        await convertGoodsCatalog(client, db);
        await mergeGoodsCatalog(client, db);
      })
      .catch((error) => {
        ready = undefined;
        throw error;
      });
    await ready;
  }
  return {
    async readGuestRequests() {
      await ensureReady();
      return guestOrderStore(db, { migrations }).pending();
    },
    async readShifts(from, to) {
      await ensureReady();
      return client.withSession((session) =>
        session.withTransaction(async () => {
          const orders = (await db
            .collection('orders')
            .find({ businessDay: { $gte: from, $lte: to } }, { session, projection: { _id: 0, _order: 0 } })
            .toArray()) as unknown as Order[];
          const shifts = (await db
            .collection('shifts')
            .find({ businessDay: { $gte: from, $lte: to } }, { session, projection: { _id: 0, _order: 0 } })
            .sort({ businessDay: -1 })
            .toArray()) as unknown as NonNullable<BarData['shifts']>;
          return { preview: shiftPreview(orders, from), totals: paidOrderTotals(orders), shifts };
        }, transactionOptions),
      );
    },
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
    async salesPopularity(from, to) {
      await ensureReady();
      // Cached per ledger revision: a search keystroke or a category switch must not re-count
      // a month of sales. Counts carry no money, so both roles share one entry.
      return revisionQuery(db, `popularity:${from}:${to}`, async () => {
        const rows = await db
          .collection('sales')
          .aggregate<{ _id: { kind: string; productId: string }; operations: number }>(
            [
              { $match: { date: { $gte: from, $lte: to }, voided: false } },
              { $group: { _id: { kind: '$kind', productId: '$productId' }, operations: { $sum: 1 } } },
            ],
            { maxTimeMS: 10000 },
          )
          .toArray();
        return new Map(rows.map((r) => [`${r._id.kind}:${r._id.productId}`, r.operations]));
      });
    },
    async readSale(id) {
      await ensureReady();
      return ((await db
        .collection('sales')
        .findOne({ _id: id as never }, { projection: { _id: 0, _order: 0 } })) || undefined) as
        Sale | undefined;
    },
    async readOrders() {
      await ensureReady();
      return client.withSession((session) =>
        session.withTransaction(async () => {
          const meta = await state.findOne({ _id: 'state' }, { session, projection: { revision: 1 } });
          const projection = { _id: 0, _order: 0 };
          const tables = (await db
            .collection('tables')
            .find({}, { session, projection })
            .toArray()) as unknown as BarTable[];
          const orders = (await db
            .collection('orders')
            .find({ status: 'open' }, { session, projection })
            .toArray()) as unknown as Order[];
          const sales = orders.length
            ? ((await db
                .collection('sales')
                .find({ orderId: { $in: orders.map((o) => o.id) }, voided: false }, { session, projection })
                .toArray()) as unknown as Sale[])
            : [];
          return { revision: meta?.revision || null, tables, orders, sales };
        }, transactionOptions),
      );
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
    async execute(command, actor, context = {}) {
      if (!command || typeof command.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(command.id))
        throw Object.assign(new Error('Некорректная операция.'), { status: 400 });
      if (
        // Restores and purges replace history and keep the full path; historical sales and
        // purchase corrections are checked incrementally below.
        ['restore', 'purge'].includes(command?.type)
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
                  : command.type === 'openOrder'
                    ? 'orders'
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
          if (command.type === 'correctPurchase') {
            const purchase = (await db
              .collection('purchases')
              .findOne(
                { _id: command.purchaseId as never },
                { session, projection: { _id: 0, _order: 0 } },
              )) as BarData['purchases'][number] | null;
            const error = purchaseCorrectionError(
              current,
              purchase || undefined,
              command,
              meta?.archived?.before,
            );
            if (error) throw Object.assign(new Error(error), { status: 400 });
            const id = purchase!.alcoholId;
            const basis = priceBasis(current, id);
            const delta = quantityRound(current, id, command.ml - purchase!.ml);
            const balance = previousBalances.find((b) => b._id === id) || { _id: id, ml: 0, cost: 0 };
            if (delta < 0)
              await assertHistoricalStock(
                db,
                session,
                purchase!.date,
                [{ alcoholId: id, ml: -delta }],
                previousBalances,
                current.alcohol,
                () =>
                  'Нельзя уменьшить закупку: часть количества уже использована в продажах или списаниях. Сначала исправьте связанные операции.',
              );
            const totals = await purchaseCostTotals(db, session, id, purchase!.id, basis, meta?.archived);
            const bought = totals.boughtOthers + (command.ml * purchase!.costPerLiter) / basis;
            const ml = quantityRound(current, id, balance.ml + delta);
            if (bought - totals.used < -0.01 || (ml === 0 && Math.abs(bought - totals.used) > 0.01))
              throw Object.assign(
                new Error('Нельзя исправить закупку: её стоимость уже учтена в продажах или списаниях.'),
                { status: 400 },
              );
            const revision = crypto.randomUUID();
            const operations = [...current.operations.slice(-999), command.id];
            const saved = await state.updateOne(
              { _id: 'state', revision: meta!.revision },
              { $set: { revision, operations } },
              { session },
            );
            if (!saved.matchedCount) throw new Error('Concurrent ledger revision');
            if (command.ml === 0)
              await db.collection('purchases').deleteOne({ _id: purchase!.id as never }, { session });
            else
              await db
                .collection('purchases')
                .updateOne({ _id: purchase!.id as never }, { $set: { ml: command.ml } }, { session });
            const cost = balance.cost + (delta * purchase!.costPerLiter) / basis;
            await db
              .collection<import('./barbar-working').Balance>('stockBalances')
              .updateOne({ _id: id }, { $set: { ml, cost } }, { upsert: true, session });
            await appendAudit(db, session, commandAudit(command, current, actor, current));
            const next: BarData = {
              ...current,
              operations,
              opening: {
                mode: 'read-model',
                ingredients: [
                  ...current.opening!.ingredients.filter((i) => i.alcoholId !== id),
                  { alcoholId: id, ml, cost },
                ],
              },
            };
            const compact = compactData(next);
            return {
              data: compact,
              revision,
              catalogRevision: meta!.catalogRevision || meta!.revision,
              baseRevision: meta!.revision,
              changedStock: compact.opening!.ingredients.filter((b) => b.alcoholId === id),
              days: {},
            };
          }
          // The working copy holds balances, not sales. A sale loaded for a void or a receipt is credited
          // back first, so `stock()` (balances − active sales) stays equal to the stored balance.
          const projection = { _id: 0, _order: 0 };
          const loadSales = (sales: Sale[]) => {
            for (const sale of sales) {
              if (sale.voided) continue;
              for (const i of sale.ingredients) {
                let balance = current.opening!.ingredients.find((b) => b.alcoholId === i.alcoholId);
                if (!balance)
                  current.opening!.ingredients.push((balance = { alcoholId: i.alcoholId, ml: 0, cost: 0 }));
                balance.ml += i.ml;
                balance.cost += i.cost;
              }
            }
            current.sales = sales;
          };
          // Each command names the slices it needs; a collection loaded whole may also shrink (see the
          // write-back below), a partial one only changes.
          const fullyLoaded = new Set<CollectionName>();
          const loadOrder = async (id: unknown) => {
            const order =
              typeof id === 'string'
                ? ((await db
                    .collection('orders')
                    .findOne({ _id: id as never }, { session, projection })) as unknown as Order | null)
                : null;
            current.orders = order ? [order] : [];
            return order;
          };
          const loadOpenOrdersOf = async (tableId: unknown) => {
            if (typeof tableId !== 'string') return;
            current.orders = (await db
              .collection('orders')
              .find({ tableId, status: 'open' }, { session, projection })
              .toArray()) as unknown as Order[];
          };
          const loadTable = async (id: unknown) => {
            const table =
              typeof id === 'string'
                ? ((await db
                    .collection('tables')
                    .findOne({ _id: id as never }, { session, projection })) as unknown as BarTable | null)
                : null;
            current.tables = table ? [table] : [];
          };
          const loadAllTables = async () => {
            current.tables = (await db
              .collection('tables')
              .find({}, { session, projection })
              .toArray()) as unknown as BarTable[];
            fullyLoaded.add('tables');
          };
          if (command.type === 'void' || command.type === 'removeLine') {
            const sale = (await db
              .collection('sales')
              .findOne({ _id: command.saleId as never }, { session, projection })) as unknown as Sale | null;
            if (sale) {
              loadSales([sale]);
              if (sale.orderId) await loadOrder(sale.orderId);
            }
          }
          if (command.type === 'sale' && command.value?.orderId !== undefined)
            await loadOrder(command.value.orderId);
          if (command.type === 'openOrder' && command.tableId !== undefined) {
            await loadTable(command.tableId);
            await loadOpenOrdersOf(command.tableId);
          }
          if (command.type === 'saveTable' || command.type === 'removeTable') {
            // The duplicate-name check needs every table; deactivation and removal need its open receipt.
            await loadAllTables();
            await loadOpenOrdersOf(command.type === 'saveTable' ? command.value?.id : command.tableId);
          }
          if (command.type === 'payOrder' || command.type === 'cancelOrder') {
            const order = await loadOrder(command.orderId);
            if (order) {
              loadSales(
                (await db
                  .collection('sales')
                  .find({ orderId: order.id }, { session, projection })
                  .toArray()) as unknown as Sale[],
              );
              if (order.tableId) await loadTable(order.tableId);
            }
          }
          if (command.type === 'voidExpense') {
            const expense = await db
              .collection('expenses')
              .findOne({ _id: command.expenseId as never }, { session, projection: { _id: 0, _order: 0 } });
            if (expense) current.expenses = [expense as unknown as NonNullable<BarData['expenses']>[number]];
          }
          current.shifts = (await db
            .collection('shifts')
            .find({}, { session, projection })
            .toArray()) as unknown as NonNullable<BarData['shifts']>;
          if (command.type === 'closeShift') {
            current.orders = (await db
              .collection('orders')
              .find({ businessDay: command.businessDay }, { session, projection })
              .toArray()) as unknown as Order[];
          }
          let handledGuest: GuestRequest | undefined;
          if (command.type === 'acceptGuestRequest' || command.type === 'rejectGuestRequest') {
            const request =
              typeof command.requestId === 'string'
                ? ((await db
                    .collection('guestRequests')
                    .findOne(
                      { _id: command.requestId as never },
                      { session },
                    )) as unknown as GuestRequest | null)
                : null;
            if (!request || guestRequestStatus(request) !== 'pending')
              throw Object.assign(new Error('Заявка уже обработана или истекла.'), { status: 409 });
            if (
              command.type === 'acceptGuestRequest' &&
              (await db
                .collection('sales')
                .findOne(
                  { _id: { $in: request.lines.map((_, i) => `guest_${request.id}_${i}`) } as never },
                  { session, projection: { _id: 1 } },
                ))
            )
              throw Object.assign(new Error('Заявка уже обработана или истекла.'), { status: 409 });
            handledGuest = request;
            await loadTable(request.tableId);
            await loadOpenOrdersOf(request.tableId);
          }
          let next: BarData;
          try {
            if (command.type === 'acceptGuestRequest' && handledGuest) {
              const accepted = acceptGuestRequest(current, handledGuest, command.lineIds, context);
              next = accepted.data;
              handledGuest = accepted.request;
              next.operations = [...next.operations.slice(-999), command.id];
            } else if (command.type === 'rejectGuestRequest' && handledGuest) {
              next = { ...current, operations: [...current.operations.slice(-999), command.id] };
              handledGuest = { ...handledGuest, status: 'rejected' };
            } else next = applyCommand(current, command, context);
          } catch (error) {
            throw Object.assign(error instanceof Error ? error : new Error('Некорректная операция.'), {
              status: 400,
            });
          }
          if (command.type === 'sale' && next !== current) {
            const saved = next.sales.find((sale) => sale.id === command.id);
            if (saved && saved.date !== businessToday()) {
              if (meta?.archived?.before && saved.date < meta.archived.before)
                throw Object.assign(
                  new Error('История этого периода удалена. Выберите более позднюю дату.'),
                  {
                    status: 400,
                  },
                );
              await assertHistoricalStock(
                db,
                session,
                saved.date,
                saved.ingredients,
                previousBalances,
                current.alcohol,
                (name, day) => `Недостаточно «${name}» на ${day}. Добавьте закупку или уменьшите количество.`,
              );
            }
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
          if (handledGuest) {
            await db.collection('guestRequests').updateOne(
              { _id: handledGuest.id as never, status: 'pending' },
              {
                $set: {
                  status: handledGuest.status,
                  ...(handledGuest.acceptedLineIds
                    ? { acceptedLineIds: handledGuest.acceptedLineIds, orderId: handledGuest.orderId }
                    : {}),
                },
              },
              { session },
            );
          }
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
          // Only a collection loaded whole can shrink: a row missing from `next` was removed, not unloaded.
          for (const name of fullyLoaded) {
            const kept = new Set(rows(next, name).map((r) => r.id));
            const removed = rows(current, name).filter((r) => !kept.has(r.id));
            if (removed.length)
              await db
                .collection(name)
                .deleteMany({ _id: { $in: removed.map((r) => r.id) } as never }, { session });
          }
          await saveBalances(db, session, next, previousBalances);
          await appendAudit(db, session, commandAudit(command, next, actor, current));
          if (command.type === 'sale' || command.type === 'acceptGuestRequest')
            await recordStockAlerts(db, session, command.id, current, next);
          if (command.type === 'purchase')
            await recordPurchaseEvent(db, session, command.id, next, command.value.id);
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
            if (!migrations) throw migrationBlocked();
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
          if (audit?.action === 'purchase')
            await recordPurchaseEvent(db, session, audit.id, next, audit.targetId);
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
export function mongoConnection(
  local = false,
  deploy?: DeployInfo,
  explicit?: { uri: string; database: string },
) {
  if (explicit && !local) throw new Error('Explicit database is only for the local server');
  const uri =
    explicit?.uri ||
    process.env.BARBAR_MONGODB_URI ||
    (local ? 'mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true' : '');
  if (!uri) throw new Error('BARBAR_MONGODB_URI is required');
  const base = explicit?.database || process.env.BARBAR_MONGODB_DATABASE || 'barbar';
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
