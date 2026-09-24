import type { ClientSession, Db } from 'mongodb';
import type { StockMovement } from '../../src/barbar/domain/types';

/**
 * Preparations of the given outputs and the write-offs aimed at their batches, for costing a command.
 * They go into `BarData.batchSources`, never into `stockMovements`: the working copy's balances already
 * include them, so loading them as movements would count the stock twice.
 */
export async function loadBatchSources(
  db: Db,
  session: ClientSession,
  ids: string[],
): Promise<StockMovement[]> {
  if (!ids.length) return [];
  const movements = db.collection('stockMovements');
  const options = { session, projection: { _id: 0, _order: 0 } };
  const preparations = (await movements
    .find({ kind: 'prepare', outputId: { $in: ids } }, options)
    .toArray()) as unknown as StockMovement[];
  if (!preparations.length) return [];
  const writeoffs = (await movements
    .find({ batchId: { $in: preparations.map((m) => m.id) } }, options)
    .toArray()) as unknown as StockMovement[];
  return [...preparations, ...writeoffs];
}
