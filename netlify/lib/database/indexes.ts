import type { Db, IndexDescription } from 'mongodb';

export const ledgerCollections = [
  'alcohol',
  'cocktails',
  'purchases',
  'sales',
  'stockResets',
  'stockMovements',
  'expenses',
] as const;

const ledgerIndexes: Record<string, IndexDescription[]> = {
  alcohol: [{ key: { id: 1 }, unique: true }],
  sales: [
    { key: { date: -1, createdAt: -1, id: -1 } },
    // Only cancelled rows: countDocuments for report cancellations is index-only.
    { key: { date: 1 }, name: 'cancelled_sales_date', partialFilterExpression: { voided: true } },
  ],
  purchases: [{ key: { date: -1, id: -1 } }],
  expenses: [{ key: { date: -1, id: -1 } }],
  stockResets: [{ key: { date: -1, createdAt: -1, id: -1 } }],
  stockMovements: [
    { key: { date: -1, createdAt: -1, id: -1 } },
    // DISTINCT outputId across preparation history, without fetching all movements.
    {
      key: { kind: 1, outputId: 1 },
      name: 'preparation_outputs',
      partialFilterExpression: { kind: 'prepare' },
    },
  ],
};

// Exact, non-unique indexes previously created by this application. Their query
// shapes are now served by the chronological indexes above. Preserve custom indexes.
const retired: Record<string, Record<string, Record<string, number>>> = {
  sales: { date_1_createdAt_1: { date: 1, createdAt: 1 }, 'date_-1_id_-1': { date: -1, id: -1 } },
  purchases: { date_1_alcoholId_1: { date: 1, alcoholId: 1 } },
  stockResets: { 'date_-1_id_-1': { date: -1, id: -1 } },
  stockMovements: { 'date_-1_id_-1': { date: -1, id: -1 } },
};

export async function ensureLedgerIndexes(db: Db) {
  await Promise.all(
    ledgerCollections.map((name) =>
      db.collection(name).createIndexes([{ key: { _order: 1 } }, ...(ledgerIndexes[name] || [])]),
    ),
  );
  // Replacements must be built successfully before removing any legacy index.
  for (const [name, candidates] of Object.entries(retired)) {
    const collection = db.collection(name);
    for (const index of await collection.listIndexes().toArray()) {
      const key = candidates[index.name || ''];
      if (
        !key ||
        index.unique ||
        index.sparse ||
        index.partialFilterExpression ||
        index.expireAfterSeconds !== undefined ||
        index.collation
      )
        continue;
      if (JSON.stringify(index.key) !== JSON.stringify(key)) continue;
      try {
        await collection.dropIndex(index.name!);
      } catch (error) {
        // Another cold start may have completed the same idempotent migration.
        if ((error as { code?: number }).code !== 27) throw error;
      }
    }
  }
}

export async function ensureAuditIndexes(db: Db) {
  await db
    .collection('auditEvents')
    .createIndexes([
      { key: { createdAt: -1, id: -1 } },
      { key: { action: 1, createdAt: -1, id: -1 } },
      { key: { 'actor.id': 1, createdAt: -1, id: -1 } },
      { key: { 'actor.id': 1, action: 1, createdAt: -1, id: -1 } },
    ]);
}
