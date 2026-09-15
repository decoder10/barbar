import type { Db, MongoClient } from 'mongodb';
import alcoholDefaults from '../../../src/barbar/data/alcohol.json' with { type: 'json' };
import type { Alcohol } from '../../../src/barbar/domain/types';
import { oncePerDatabase } from './migrations';

export const foodDefaults = (alcoholDefaults as Alcohol[]).filter((a) => a.category === 'food');

/** Existing ids and names always win; nothing is renamed, repriced or attached to recipes. */
export function missingFoodDefaults(existing: Pick<Alcohol, 'id' | 'name'>[]) {
  const ids = new Set(existing.map((a) => a.id));
  const names = new Set(existing.map((a) => a.name.trim().toLocaleLowerCase()));
  return foodDefaults.filter((a) => !ids.has(a.id) && !names.has(a.name.toLocaleLowerCase()));
}

/** Insert-only catalog upgrade: snack products with zero stock, one new catalog revision. */
export const seedFoodCatalog = (client: MongoClient, db: Db) =>
  oncePerDatabase(db, 'food-catalog-v1', () =>
    client.withSession((session) =>
      session.withTransaction(
        async () => {
          const state = db.collection<{ _id: string; revision: string }>('state');
          const meta = await state.findOne({ _id: 'state' }, { session });
          if (!meta) return;
          const alcohol = db.collection<Alcohol & { _id: string; _order: number }>('alcohol');
          const existing = await alcohol
            .find({}, { session, projection: { id: 1, name: 1, _order: 1 } })
            .toArray();
          const missing = missingFoodDefaults(existing);
          if (!missing.length) return;
          const last = existing.reduce((max, a) => Math.max(max, a._order ?? -1), -1);
          await alcohol.insertMany(
            missing.map((a, index) => ({ ...a, _id: a.id, _order: last + 1 + index })),
            { session },
          );
          await db.collection<{ _id: string; ml: number; cost: number }>('stockBalances').bulkWrite(
            missing.map((a) => ({
              updateOne: {
                filter: { _id: a.id },
                update: { $setOnInsert: { ml: 0, cost: 0 } },
                upsert: true,
              },
            })),
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
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        },
      ),
    ),
  );
