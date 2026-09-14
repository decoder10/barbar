import type { ClientSession, Db } from 'mongodb';
import type { BarData } from '../../src/barbar/domain/types';
import { inventoryCalculations } from '../../src/barbar/domain/inventory-calculations';
export interface Balance {
  _id: string;
  ml: number;
  cost: number;
}
export function ledgerBalances(data: BarData): Balance[] {
  const calc = inventoryCalculations(data);
  return data.alcohol.map((a) => ({
    _id: a.id,
    ml: calc.stock(a.id),
    cost: calc.stockValue(a.id),
  }));
}
export async function saveBalances(db: Db, session: ClientSession, data: BarData, previous?: Balance[]) {
  const balances = ledgerBalances(data);
  const old = new Map(previous?.map((b) => [b._id, b]));
  const changed = balances.filter((b) => b.ml !== old.get(b._id)?.ml || b.cost !== old.get(b._id)?.cost);
  if (changed.length)
    await db.collection<Balance>('stockBalances').bulkWrite(
      changed.map((b) => ({ replaceOne: { filter: { _id: b._id }, replacement: b, upsert: true } })),
      { session },
    );
  if (!previous || previous.some((b) => !balances.some((next) => next._id === b._id)))
    await db
      .collection<Balance>('stockBalances')
      .deleteMany({ _id: { $nin: balances.map((b) => b._id) } }, { session });
}
export async function workingData(db: Db, session: ClientSession, operations: string[]): Promise<BarData> {
  const alcohol = await db
    .collection('alcohol')
    .find({}, { session, projection: { _id: 0, _order: 0 } })
    .sort({ _order: 1 })
    .toArray();
  const cocktails = await db
    .collection('cocktails')
    .find({}, { session, projection: { _id: 0, _order: 0 } })
    .sort({ _order: 1 })
    .toArray();
  const balances = await db.collection<Balance>('stockBalances').find({}, { session }).toArray();
  return {
    version: 1,
    alcohol: alcohol as unknown as BarData['alcohol'],
    cocktails: cocktails as unknown as BarData['cocktails'],
    purchases: [],
    sales: [],
    operations,
    opening: {
      mode: 'read-model',
      ingredients: balances.map((b) => ({ alcoholId: b._id, ml: b.ml, cost: b.cost })),
    },
  };
}

export function compactData(data: BarData): BarData {
  return {
    version: 1,
    alcohol: data.alcohol,
    cocktails: data.cocktails,
    purchases: [],
    sales: [],
    operations: data.operations,
    ...(data.historyBefore ? { historyBefore: data.historyBefore } : {}),
    opening: {
      mode: 'read-model',
      ingredients: ledgerBalances(data).map((b) => ({ alcoholId: b._id, ml: b.ml, cost: b.cost })),
    },
  };
}
