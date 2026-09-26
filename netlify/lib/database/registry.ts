import { foodCatalogMigration } from './food-catalog';
import { goodsCatalogMigration, goodsMergeMigration } from './goods-catalog';
import { auditIndexMigration, ledgerIndexMigration } from './indexes';
import type { Migration } from './migrations';
import { pushIndexMigration } from '../notifications/subscriptions';

/**
 * Every database migration of the application, in run order. Append new steps with an id
 * `YYYY-MM-DD-<slug>`; never edit, reorder or remove a step that has shipped (docs/database-migrations.md).
 * `identity-bootstrap-v2` stays with the user store in barbar-users.ts.
 */

/** The notification feed takes the 50 newest events of each queue: no full scan and in-memory sort. */
export const notificationFeedIndexMigration: Migration = {
  id: '2026-09-25-notification-feed-indexes',
  description: 'Notification feed: createdAt DESC on stock, purchase and guest events',
  run: (db) =>
    Promise.all(
      ['stockAlertEvents', 'purchaseEvents', 'guestEvents'].map((name) =>
        db.collection(name).createIndex({ createdAt: -1 }),
      ),
    ),
};
/** Price history pages sort by createdAt and id; the createdAt-only indexes of v5 still need a blocking sort. */
export const priceHistoryIndexMigration: Migration = {
  id: '2026-09-25-price-history-indexes',
  description: 'Price history: createdAt DESC, id DESC overall and per product',
  run: (db) =>
    db
      .collection('priceChanges')
      .createIndexes([{ key: { createdAt: -1, id: -1 } }, { key: { productId: 1, createdAt: -1, id: -1 } }]),
};

/** Indexes and collections: before the ledger read model is imported or upgraded. */
export const schemaMigrations: readonly Migration[] = [
  ledgerIndexMigration,
  auditIndexMigration,
  pushIndexMigration,
  notificationFeedIndexMigration,
  priceHistoryIndexMigration,
];
/** The public guest order function needs only the ledger and audit indexes. */
export const guestMigrations: readonly Migration[] = [ledgerIndexMigration, auditIndexMigration];
/** Document changes on an existing ledger: each in one transaction, insert-only or usage-checked. */
export const dataMigrations: readonly Migration[] = [
  foodCatalogMigration,
  goodsCatalogMigration,
  goodsMergeMigration,
];
export const registry: readonly Migration[] = [...schemaMigrations, ...dataMigrations];
