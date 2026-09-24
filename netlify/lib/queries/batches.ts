import type { Db } from 'mongodb';
import { batchStock } from '../../../src/barbar/domain/batches';
import type { StockMovement } from '../../../src/barbar/domain/types';
import { authenticated, json } from '../barbar-auth';
import type { Balance } from '../barbar-working';
import type { IdentityStore } from '../barbar-users';
import { revisionQuery } from './cache';

/** Owner-only FEFO batch balances: positive balances plus preparation rows of those outputs only. */
export async function handleBatches(request: Request, db: Db, users: IdentityStore) {
  const user = await authenticated(request, users);
  if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  if (user.role !== 'owner') return json({ error: 'Партии доступны только владельцу.' }, 403);
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  const result = await revisionQuery(db, 'batches', () =>
    db.client.withSession((session) =>
      session.withTransaction(
        async () => {
          const balances = await db
            .collection<Balance>('stockBalances')
            .find({ ml: { $gt: 0 } }, { session, maxTimeMS: 10000 })
            .toArray();
          const options = { session, maxTimeMS: 10000, projection: { _id: 0, _order: 0 } };
          const preparations = balances.length
            ? ((await db
                .collection('stockMovements')
                .find({ kind: 'prepare', outputId: { $in: balances.map((b) => b._id) } }, options)
                .toArray()) as unknown as StockMovement[])
            : [];
          // Write-offs aimed at a batch shrink its capacity.
          const targeted = preparations.length
            ? ((await db
                .collection('stockMovements')
                .find({ batchId: { $in: preparations.map((m) => m.id) } }, options)
                .toArray()) as unknown as StockMovement[])
            : [];
          const movements = [...preparations, ...targeted];
          return { batches: batchStock(movements, new Map(balances.map((b) => [b._id, b.ml]))) };
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      ),
    ),
  );
  return json(result);
}
