import type { Db } from 'mongodb';
/** Persist completion so a fresh serverless instance does not rebuild indexes or bootstrap users.
 * Bump the migration key when its definition changes. Concurrent initial runs must be idempotent.
 */
export async function oncePerDatabase(db: Db, key: string, migrate: () => Promise<unknown>) {
  const markers = db.collection<{ _id: string; completedAt: Date }>('appMigrations');
  if (await markers.findOne({ _id: key }, { projection: { _id: 1 } })) return;
  await migrate();
  await markers.updateOne({ _id: key }, { $set: { completedAt: new Date() } }, { upsert: true });
}
