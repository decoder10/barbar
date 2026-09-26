import { barConfig, configHash } from '../../../src/barbar/config';
import type { ClientSession, Db, MongoClient } from 'mongodb';
import { mergeGoodsDuplicates, migrateGoodsCatalog } from '../../../src/barbar/domain/catalog/goods';
import type { Alcohol, Cocktail } from '../../../src/barbar/domain/types';
import { runMigrations, type Migration } from './migrations';

type Row<T> = T & { _id: string; _order: number };

const { goods, duplicates, merges } = barConfig.upgrades;
export const goodsCatalogKey = `goods-catalog-v3-${configHash({ goods, duplicates })}`;
export const goodsMergeKey = `goods-merge-v3-${configHash(merges)}`;

/**
 * Removing catalog rows leaves gaps in `_order`. The ledger writers number changed rows by array position,
 * so renumber contiguously in the same transaction to keep catalog order stable across reads.
 */
async function renumberCatalog(db: Db, session: ClientSession) {
  for (const name of ['alcohol', 'cocktails']) {
    const rows = await db
      .collection<{ _id: string; _order: number }>(name)
      .find({}, { session, projection: { _order: 1 } })
      .sort({ _order: 1, _id: 1 })
      .toArray();
    const changes = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => row._order !== index)
      .map(({ row, index }) => ({
        updateOne: { filter: { _id: row._id }, update: { $set: { _order: index } } },
      }));
    if (changes.length)
      await db.collection<{ _id: string; _order: number }>(name).bulkWrite(changes, { session });
  }
}

/** One-time link of untouched piece items (soft drinks, packs, tea bags) to piece stock with zero balance. */
export const goodsCatalogMigration: Migration = {
  // v3: v2 could be marked done by a build without the duplicate cleanup. The hash reruns it when the
  // goods or duplicate lists in config change; the migration itself is idempotent.
  id: goodsCatalogKey,
  description: 'Link untouched piece items to goods stock; remove unused duplicates',
  run: (db, client) =>
    client.withSession((session) =>
      session.withTransaction(
        async () => {
          const state = db.collection<{ _id: string; revision: string }>('state');
          const meta = await state.findOne({ _id: 'state' }, { session });
          if (!meta) return;
          const alcohol = await db.collection<Row<Alcohol>>('alcohol').find({}, { session }).toArray();
          const cocktails = await db.collection<Row<Cocktail>>('cocktails').find({}, { session }).toArray();
          const sold = new Set(
            (await db
              .collection('sales')
              .distinct(
                'productId',
                { kind: 'cocktail', category: { $in: ['soft', 'snack', 'hot'] } },
                { session },
              )) as string[],
          );
          const balances = await db
            .collection<{ _id: string; ml: number; cost: number }>('stockBalances')
            .find({ $or: [{ ml: { $ne: 0 } }, { cost: { $ne: 0 } }] }, { session, projection: { _id: 1 } })
            .toArray();
          const archived = await db
            .collection('state')
            .findOne({ _id: 'state' as never }, { session, projection: { archived: 1 } });
          const used = new Set<string>([
            ...((await db.collection('purchases').distinct('alcoholId', {}, { session })) as string[]),
            ...((await db
              .collection('stockMovements')
              .distinct('lines.alcoholId', {}, { session })) as string[]),
            ...((await db.collection('stockResets').distinct('alcoholId', {}, { session })) as string[]),
            ...((await db
              .collection('sales')
              .distinct('ingredients.alcoholId', {}, { session })) as string[]),
            ...balances.map((b) => b._id),
            ...((archived?.archived?.ingredients || []) as { alcoholId: string }[]).map((i) => i.alcoholId),
          ]);
          const migrated = migrateGoodsCatalog(
            {
              alcohol: alcohol.map(({ _id, _order, ...a }) => (void _id, void _order, a)),
              cocktails: cocktails.map(({ _id, _order, ...c }) => (void _id, void _order, c)),
            },
            sold,
            used,
          );
          if (!migrated) return;
          if (migrated.removed.length) {
            await db
              .collection('alcohol')
              .deleteMany({ _id: { $in: migrated.removed as never[] } }, { session });
            await db
              .collection('stockBalances')
              .deleteMany({ _id: { $in: migrated.removed as never[] } }, { session });
            await renumberCatalog(db, session);
          }
          if (migrated.kept.length)
            console.info(JSON.stringify({ migration: goodsCatalogKey, keptDuplicates: migrated.kept }));
          const known = new Set(alcohol.map((a) => a.id));
          const added = migrated.alcohol.filter((a) => !known.has(a.id));
          const last = alcohol.reduce((max, a) => Math.max(max, a._order ?? -1), -1);
          // A rerun that only removes duplicates adds nothing: MongoDB rejects empty batches.
          if (added.length) {
            await db.collection<Row<Alcohol>>('alcohol').insertMany(
              added.map((a, index) => ({ ...a, _id: a.id, _order: last + 1 + index })),
              { session },
            );
            await db.collection<{ _id: string; ml: number; cost: number }>('stockBalances').bulkWrite(
              added.map((a) => ({
                updateOne: {
                  filter: { _id: a.id },
                  update: { $setOnInsert: { ml: 0, cost: 0 } },
                  upsert: true,
                },
              })),
              { session },
            );
          }
          for (const item of migrated.cocktails.filter((c) => added.some((a) => a.id === c.stockAlcoholId)))
            await db.collection<Row<Cocktail>>('cocktails').updateOne(
              { _id: item.id, stockAlcoholId: { $exists: false } },
              {
                $set: {
                  stockAlcoholId: item.stockAlcoholId,
                  ingredients: item.ingredients,
                  notes: item.notes,
                },
              },
              { session },
            );
          const revision = crypto.randomUUID();
          const saved = await state.updateOne(
            { _id: 'state', revision: meta.revision },
            { $set: { revision, catalogRevision: revision } },
            { session },
          );
          if (!saved.matchedCount) throw new Error('Concurrent ledger revision');
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
      ),
    ),
};

/** One item per drink: merge bar Tonic/Cola/Soda in ml with their goods counterparts (owner decisions). */
export const goodsMergeMigration: Migration = {
  // v3 preserves custom recipes, every recipe reference and archived usage. Reruns when config changes.
  id: goodsMergeKey,
  description: 'Merge bar mixers in ml with their goods counterparts',
  run: (db, client) =>
    client.withSession((session) =>
      session.withTransaction(
        async () => {
          const state = db.collection<{ _id: string; revision: string }>('state');
          const meta = await state.findOne({ _id: 'state' }, { session });
          if (!meta) return;
          const alcohol = await db.collection<Row<Alcohol>>('alcohol').find({}, { session }).toArray();
          const cocktails = await db.collection<Row<Cocktail>>('cocktails').find({}, { session }).toArray();
          const balances = await db
            .collection<{ _id: string; ml: number; cost: number }>('stockBalances')
            .find({ $or: [{ ml: { $ne: 0 } }, { cost: { $ne: 0 } }] }, { session, projection: { _id: 1 } })
            .toArray();
          const used = new Set<string>([
            ...((await db.collection('purchases').distinct('alcoholId', {}, { session })) as string[]),
            ...((await db
              .collection('stockMovements')
              .distinct('lines.alcoholId', {}, { session })) as string[]),
            ...((await db.collection('stockResets').distinct('alcoholId', {}, { session })) as string[]),
            ...((await db
              .collection('sales')
              .distinct('ingredients.alcoholId', {}, { session })) as string[]),
            ...balances.map((b) => b._id),
            ...(
              (await db.collection('state').findOne({ _id: 'state' as never }, { session }))?.archived
                ?.ingredients || []
            ).map((i: { alcoholId: string }) => i.alcoholId),
          ]);
          const strip = <T extends { _id: string; _order: number }>({ _id, _order, ...rest }: T) => (
            void _id,
            void _order,
            rest
          );
          const result = mergeGoodsDuplicates(
            { alcohol: alcohol.map(strip) as Alcohol[], cocktails: cocktails.map(strip) as Cocktail[] },
            used,
          );
          if (!result) return;
          for (const item of result.alcohol) {
            const before = alcohol.find((a) => a.id === item.id);
            if (before && JSON.stringify(strip(before)) !== JSON.stringify(item))
              await db
                .collection<Row<Alcohol>>('alcohol')
                .updateOne({ _id: item.id }, { $set: item }, { session });
          }
          for (const item of result.cocktails) {
            const before = cocktails.find((c) => c.id === item.id);
            if (before && JSON.stringify(strip(before)) !== JSON.stringify(item))
              await db
                .collection<Row<Cocktail>>('cocktails')
                .updateOne({ _id: item.id }, { $set: item }, { session });
          }
          if (result.removed.length) {
            await db
              .collection('alcohol')
              .deleteMany({ _id: { $in: result.removed as never[] } }, { session });
            await db
              .collection('stockBalances')
              .deleteMany({ _id: { $in: result.removed as never[] } }, { session });
            await renumberCatalog(db, session);
          }
          if (result.kept.length)
            console.info(JSON.stringify({ migration: goodsMergeKey, notMerged: result.kept }));
          const revision = crypto.randomUUID();
          const saved = await state.updateOne(
            { _id: 'state', revision: meta.revision },
            { $set: { revision, catalogRevision: revision } },
            { session },
          );
          if (!saved.matchedCount) throw new Error('Concurrent ledger revision');
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
      ),
    ),
};
export const mergeGoodsCatalog = (client: MongoClient, db: Db) =>
  runMigrations(db, [goodsMergeMigration], client);
