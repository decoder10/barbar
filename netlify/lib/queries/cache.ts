import type { Db } from 'mongodb';
const caches = new WeakMap<Db, Map<string, { expires: number; value: Promise<unknown> }>>();
/** Bounded per-container cache; ledger revision invalidates it across devices. Never caches authorization. */
export async function revisionQuery<T>(db: Db, key: string, load: () => Promise<T>): Promise<T> {
  const state = await db
    .collection('state')
    .findOne({ _id: 'state' as never }, { projection: { revision: 1 } });
  const cacheKey = `${state?.revision || 'empty'}:${key}`;
  let cache = caches.get(db);
  if (!cache) {
    cache = new Map();
    caches.set(db, cache);
  }
  const found = cache.get(cacheKey);
  if (found && found.expires > Date.now()) return found.value as Promise<T>;
  if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  const value = load().catch((error) => {
    cache!.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, { expires: Date.now() + 30000, value });
  return value;
}
