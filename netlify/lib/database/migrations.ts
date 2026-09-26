import type { Db, MongoClient } from 'mongodb';

/**
 * One versioned database step. `id` is its permanent key in `appMigrations`: never rename or reuse it.
 * A changed definition gets a new id. Every step must be idempotent (concurrent cold starts may run it
 * together) and must keep existing data: see docs/database-migrations.md.
 */
export interface Migration {
  id: string;
  description: string;
  run: (db: Db, client: MongoClient) => Promise<unknown>;
}
/** Markers written before the registry carry only `completedAt`; they stay valid as they are. */
interface Marker {
  _id: string;
  completedAt: Date;
  startedAt?: Date;
  durationMs?: number;
  description?: string;
}
interface Cache {
  completed?: Promise<Set<string>>;
  running: Map<string, Promise<void>>;
}

// Per Db handle, like one Functions instance: a new handle reads the markers again.
const caches = new WeakMap<Db, Cache>();
const cacheOf = (db: Db) => {
  let cache = caches.get(db);
  if (!cache) caches.set(db, (cache = { running: new Map() }));
  return cache;
};
const markers = (db: Db) => db.collection<Marker>('appMigrations');

/** Reads every completion marker in one query; later checks on this handle need no round trip. */
export function loadMigrationMarkers(db: Db) {
  const cache = cacheOf(db);
  cache.completed ||= markers(db)
    .find({}, { projection: { _id: 1 }, batchSize: 1000 })
    .toArray()
    .then((rows) => new Set(rows.map((row) => row._id)))
    .catch((error) => {
      cache.completed = undefined;
      throw error;
    });
  return cache.completed;
}

async function apply(db: Db, client: MongoClient, migration: Migration, completed: Set<string>) {
  const startedAt = new Date();
  try {
    await migration.run(db, client);
    const completedAt = new Date();
    // The first completion stays in the journal when another instance finishes the same step.
    await markers(db).updateOne(
      { _id: migration.id },
      {
        $setOnInsert: {
          completedAt,
          startedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          description: migration.description,
        },
      },
      { upsert: true },
    );
    completed.add(migration.id);
  } catch (error) {
    // No marker: the step runs again on the next call, which also rereads the markers.
    cacheOf(db).completed = undefined;
    throw error;
  }
}

/** Runs the steps without a marker in list order; stops at the first failure. */
export async function runMigrations(db: Db, list: readonly Migration[], client: MongoClient = db.client) {
  const cache = cacheOf(db);
  const earlier = cache.completed;
  const completed = await loadMigrationMarkers(db);
  let pending = list.filter((m) => !completed.has(m.id));
  if (!pending.length) return;
  // An older snapshot may miss a step that another instance has completed since.
  if (earlier) {
    const done = await markers(db)
      .find({ _id: { $in: pending.map((m) => m.id) } }, { projection: { _id: 1 } })
      .toArray();
    for (const row of done) completed.add(row._id);
    pending = pending.filter((m) => !completed.has(m.id));
  }
  for (const migration of pending) {
    if (completed.has(migration.id)) continue;
    let run = cache.running.get(migration.id);
    if (!run) {
      run = apply(db, client, migration, completed).finally(() => cache.running.delete(migration.id));
      cache.running.set(migration.id, run);
    }
    await run;
  }
}

/** Persist completion so a fresh serverless instance does not rebuild indexes or bootstrap users.
 * Bump the migration key when its definition changes. Concurrent initial runs must be idempotent.
 */
export const oncePerDatabase = (db: Db, key: string, migrate: () => Promise<unknown>) =>
  runMigrations(db, [{ id: key, description: key, run: migrate }]);
