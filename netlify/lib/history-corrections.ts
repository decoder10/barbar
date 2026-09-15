import type { ClientSession, Db } from 'mongodb';
import type { Alcohol, BarData } from '../../src/barbar/domain/types';
import type { Balance } from './barbar-working';

type DailyRow = { _id: { id: string; date: string }; ml: number };

/**
 * Chronological stock guard without replaying the ledger: rebuild each ingredient's end-of-day balance from
 * today's balance and the daily changes after `date`. Within a day additions precede deductions, so the
 * end of each day is its lowest point — the same result as the full ledger check for a valid ledger.
 */
export async function assertHistoricalStock(
  db: Db,
  session: ClientSession,
  date: string,
  lines: { alcoholId: string; ml: number }[],
  balances: Balance[],
  alcohol: Alcohol[],
  message: (name: string, day: string) => string,
) {
  const ids = [...new Set(lines.map((l) => l.alcoholId))];
  if (!ids.length) return;
  const since = { date: { $gt: date } };
  const options = { session, maxTimeMS: 10000 };
  const aggregate = async (name: string, pipeline: object[]) =>
    (await db.collection(name).aggregate(pipeline, options).toArray()) as DailyRow[];
  const rows = [
    ...(await aggregate('purchases', [
      { $match: { ...since, alcoholId: { $in: ids } } },
      { $group: { _id: { id: '$alcoholId', date: '$date' }, ml: { $sum: '$ml' } } },
    ])),
    ...(await aggregate('sales', [
      { $match: { ...since, voided: false, 'ingredients.alcoholId': { $in: ids } } },
      { $unwind: '$ingredients' },
      { $match: { 'ingredients.alcoholId': { $in: ids } } },
      {
        $group: {
          _id: { id: '$ingredients.alcoholId', date: '$date' },
          ml: { $sum: { $multiply: ['$ingredients.ml', -1] } },
        },
      },
    ])),
    ...(await aggregate('stockMovements', [
      { $match: { ...since, 'lines.alcoholId': { $in: ids } } },
      { $unwind: '$lines' },
      { $match: { 'lines.alcoholId': { $in: ids } } },
      { $group: { _id: { id: '$lines.alcoholId', date: '$date' }, ml: { $sum: '$lines.ml' } } },
    ])),
    ...(await aggregate('stockResets', [
      { $match: { ...since, alcoholId: { $in: ids } } },
      { $group: { _id: { id: '$alcoholId', date: '$date' }, ml: { $sum: { $multiply: ['$ml', -1] } } } },
    ])),
  ];
  for (const id of ids) {
    const amount = lines.filter((l) => l.alcoholId === id).reduce((sum, l) => sum + l.ml, 0);
    const item = alcohol.find((a) => a.id === id);
    const tolerance = item?.unit === 'bottle' || item?.unit === 'pcs' ? 1e-7 : 0.001;
    const days = new Map<string, number>();
    for (const row of rows.filter((r) => r._id.id === id))
      days.set(row._id.date, (days.get(row._id.date) || 0) + row.ml);
    let later = 0;
    const current = balances.find((b) => b._id === id)?.ml || 0;
    let lowest = { balance: current, day: date };
    for (const day of [...days.keys()].sort().reverse()) {
      const end = current - later;
      if (end < lowest.balance) lowest = { balance: end, day };
      later += days.get(day)!;
    }
    const end = current - later;
    if (end <= lowest.balance) lowest = { balance: end, day: date };
    if (lowest.balance - amount < -tolerance)
      throw Object.assign(new Error(message(item?.name || id, lowest.day)), { status: 400 });
  }
}

/** The full ledger's purchase-correction cost totals for one item, from aggregates. */
export async function purchaseCostTotals(
  db: Db,
  session: ClientSession,
  alcoholId: string,
  exceptPurchaseId: string,
  basis: number,
  archived?: BarData['archived'],
) {
  const options = { session, maxTimeMS: 10000 };
  const [purchases] = await db
    .collection('purchases')
    .aggregate(
      [
        { $match: { alcoholId, id: { $ne: exceptPurchaseId } } },
        {
          $group: {
            _id: null,
            value: { $sum: { $divide: [{ $multiply: ['$ml', '$costPerLiter'] }, basis] } },
          },
        },
      ],
      options,
    )
    .toArray();
  const [sales] = await db
    .collection('sales')
    .aggregate(
      [
        { $match: { voided: false, 'ingredients.alcoholId': alcoholId } },
        { $unwind: '$ingredients' },
        { $match: { 'ingredients.alcoholId': alcoholId } },
        { $group: { _id: null, value: { $sum: '$ingredients.cost' } } },
      ],
      options,
    )
    .toArray();
  const [resets] = await db
    .collection('stockResets')
    .aggregate([{ $match: { alcoholId } }, { $group: { _id: null, value: { $sum: '$cost' } } }], options)
    .toArray();
  const retired = (archived?.ingredients || [])
    .filter((i) => i.alcoholId === alcoholId)
    .reduce((s, i) => s + i.cost, 0);
  return { boughtOthers: purchases?.value || 0, used: (sales?.value || 0) + (resets?.value || 0) + retired };
}
