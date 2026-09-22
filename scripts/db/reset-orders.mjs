/**
 * Removes every table, receipt and receipt line from a database — a reset of the orders feature.
 * Only for a database the owner names explicitly; refuses to run without the confirmation flag.
 *
 *   BARBAR_MONGODB_URI=... BARBAR_MONGODB_DATABASE=barbar node scripts/db/reset-orders.mjs --confirm
 */
import { MongoClient } from 'mongodb';

const uri = process.env.BARBAR_MONGODB_URI;
const database = process.env.BARBAR_MONGODB_DATABASE || 'barbar';
if (!uri) {
  console.error('BARBAR_MONGODB_URI is required.');
  process.exit(1);
}
if (!process.argv.includes('--confirm')) {
  console.error(
    `Dry run: would remove tables, orders and receipt lines from «${database}». Pass --confirm to run.`,
  );
}
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const db = client.db(database);
  const lines = await db.collection('sales').countDocuments({ orderId: { $exists: true } });
  const orders = await db.collection('orders').countDocuments();
  const tables = await db.collection('tables').countDocuments();
  console.log(`«${database}»: ${tables} tables, ${orders} orders, ${lines} receipt lines.`);
  if (!process.argv.includes('--confirm')) process.exit(0);
  const session = client.startSession();
  await session.withTransaction(async () => {
    // Receipt lines are ordinary sales: they are removed with their stock effect recomputed by the app.
    await db.collection('sales').deleteMany({ orderId: { $exists: true } }, { session });
    await db.collection('orders').deleteMany({}, { session });
    await db.collection('tables').deleteMany({}, { session });
    await db
      .collection('auditEvents')
      .deleteMany(
        { action: { $in: ['openOrder', 'payOrder', 'cancelOrder', 'saveTable', 'removeTable'] } },
        { session },
      );
    await db.collection('stockBalances').deleteMany({}, { session });
    await db
      .collection('state')
      .updateOne({ _id: 'state' }, { $unset: { readModelVersion: '' } }, { session });
  });
  console.log('Done. The next app start rebuilds stock balances from the ledger.');
} finally {
  await client.close();
}
