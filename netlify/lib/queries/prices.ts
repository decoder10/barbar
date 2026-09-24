import type { ClientSession, Db } from 'mongodb';
import { barConfig } from '../../../src/barbar/config';
import { businessToday } from '../../../src/barbar/domain/business-day';
import { expandRecipe } from '../../../src/barbar/domain/catalog/sets';
import { stockTotals } from '../../../src/barbar/domain/model';
import { availabilityDays, type DailyChange } from '../../../src/barbar/domain/reports/availability';
import {
  priceWindows,
  windowStats,
  type DaySales,
  type PriceWindow,
} from '../../../src/barbar/domain/reports/price-history';
import type { PriceChange } from '../../../src/barbar/domain/types';
import type { PriceChangeRow } from '../../../src/barbar/domain/reports/price-history-types';
import { json } from '../barbar-auth';
import { workingData } from '../barbar-working';
import { HttpError } from '../http';
import { revisionQuery } from './cache';

export type PriceChangeReport = PriceChangeRow;
const identifier = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s);

/** Owner-only price history: newest changes first, each with its before and after windows. */
export async function handlePrices(params: URLSearchParams, db: Db) {
  const kind = params.get('kind');
  const productId = params.get('productId');
  const limit = Number(params.get('limit') || 30);
  if (
    (kind !== null && kind !== 'cocktail' && kind !== 'alcohol') ||
    (productId !== null && !identifier(productId)) ||
    (productId !== null && kind === null) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new HttpError('Проверьте запрос истории цен.');
  const result = await revisionQuery(db, `prices:${kind}:${productId}:${limit}`, () =>
    db.client.withSession((session) =>
      session.withTransaction(() => readPrices(db, session, { kind, productId, limit }), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      }),
    ),
  );
  return json(result);
}

async function readPrices(
  db: Db,
  session: ClientSession,
  filter: { kind: string | null; productId: string | null; limit: number },
) {
  const options = { session, maxTimeMS: 10000 };
  const projection = { _id: 0, _order: 0 };
  const today = businessToday();
  const changes = (await db
    .collection('priceChanges')
    .find(
      {
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.productId ? { productId: filter.productId } : {}),
      },
      { ...options, projection },
    )
    .sort({ createdAt: -1, id: -1 })
    .limit(filter.limit)
    .toArray()) as unknown as PriceChange[];
  const marker = await db
    .collection('appMigrations')
    .findOne({ _id: 'ledger-indexes-v5' as never }, { session });
  const trackingSince = marker?.completedAt ? new Date(marker.completedAt).toISOString().slice(0, 10) : null;
  if (!changes.length) return { changes: [] as PriceChangeReport[], trackingSince };
  // Neighbouring changes of the same item bound its windows.
  const products = [...new Set(changes.map((c) => `${c.kind}:${c.productId}`))];
  const related = (await db
    .collection('priceChanges')
    .find({ productId: { $in: changes.map((c) => c.productId) } }, { ...options, projection })
    .toArray()) as unknown as PriceChange[];
  const datesOf = (c: PriceChange) =>
    related
      .filter((o) => o.kind === c.kind && o.productId === c.productId && o.id !== c.id)
      .map((o) => o.date);
  const planned = changes.map((c) => ({ change: c, plan: priceWindows(c.date, datesOf(c), today) }));
  const ranges = planned.flatMap((p) => (p.plan ? [p.plan.before.from, p.plan.after.to] : []));
  if (!ranges.length)
    return {
      changes: planned.map((p) => ({ ...p.change, windows: null })) as PriceChangeReport[],
      trackingSince,
    };
  const from = ranges.reduce((a, b) => (a < b ? a : b));
  const to = ranges.reduce((a, b) => (a > b ? a : b));
  const daily = (await db
    .collection('sales')
    .aggregate(
      [
        {
          $match: {
            voided: false,
            date: { $gte: from, $lte: to },
            $or: products.map((key) => {
              const [k, ...id] = key.split(':');
              return { kind: k, productId: id.join(':') };
            }),
          },
        },
        {
          $group: {
            _id: { kind: '$kind', productId: '$productId', date: '$date' },
            units: {
              $sum: {
                $cond: [
                  { $eq: ['$kind', 'alcohol'] },
                  { $divide: ['$quantity', barConfig.guest.pouredAlcohol.portionMl] },
                  '$quantity',
                ],
              },
            },
            operations: { $sum: 1 },
            revenue: { $sum: '$revenue' },
            cost: { $sum: '$cost' },
          },
        },
      ],
      options,
    )
    .toArray()) as unknown as {
    _id: { kind: string; productId: string; date: string };
    units: number;
    operations: number;
    revenue: number;
    cost: number;
  }[];
  const salesOf = (c: PriceChange): DaySales[] =>
    daily
      .filter((d) => d._id.kind === c.kind && d._id.productId === c.productId)
      .map((d) => ({
        date: d._id.date,
        units: d.units,
        operations: d.operations,
        revenue: d.revenue,
        cost: d.cost,
      }));
  const workedDates = (await db
    .collection('sales')
    .distinct('date', { date: { $gte: from, $lte: to }, voided: false }, options)) as string[];
  // Availability: the ingredients of each item and their daily stock changes since the earliest window.
  const current = await workingData(db, session, []);
  const stock = stockTotals(current);
  const ingredientsOf = (c: PriceChange) =>
    c.kind === 'alcohol'
      ? [c.productId]
      : [
          ...new Set(
            expandRecipe(
              current.cocktails.find((x) => x.id === c.productId) || { ingredients: [] },
              current.cocktails,
            ).map((i) => i.alcoholId),
          ),
        ];
  const ids = [...new Set(planned.flatMap((p) => (p.plan ? ingredientsOf(p.change) : [])))];
  const changesByDay = ids.length ? await ingredientChanges(db, session, ids, from) : [];
  const availableIn = (c: PriceChange, window: PriceWindow) => {
    const own = ingredientsOf(c);
    if (!own.length) return null;
    const result = availabilityDays({
      from: window.from,
      to: window.to,
      current: new Map(own.map((id) => [id, stock.get(id) || 0])),
      changes: changesByDay,
      workedDates,
    });
    return Math.min(...own.map((id) => result.get(id)?.availableDays ?? 0));
  };
  return {
    changes: planned.map(({ change, plan }) => ({
      ...change,
      windows: plan
        ? {
            length: plan.length,
            before: windowStats(plan.before, salesOf(change), workedDates, availableIn(change, plan.before)),
            after: windowStats(plan.after, salesOf(change), workedDates, availableIn(change, plan.after)),
          }
        : null,
    })) as PriceChangeReport[],
    trackingSince,
  };
}

/** Net daily stock changes of the given items since `from`: what availability is rebuilt from. */
async function ingredientChanges(db: Db, session: ClientSession, ids: string[], from: string) {
  const options = { session, maxTimeMS: 10000 };
  type Row = { _id: { date: string; id: string }; ml: number; used?: number };
  const rows = async (collection: string, pipeline: object[]) =>
    (await db.collection(collection).aggregate(pipeline, options).toArray()) as unknown as Row[];
  const day = (id: string) => ({ date: '$date', id });
  const out: DailyChange[] = [];
  for (const r of await rows('sales', [
    { $match: { date: { $gte: from }, voided: false } },
    { $unwind: '$ingredients' },
    { $match: { 'ingredients.alcoholId': { $in: ids } } },
    { $group: { _id: day('$ingredients.alcoholId'), ml: { $sum: '$ingredients.ml' } } },
  ]))
    out.push({ date: r._id.date, alcoholId: r._id.id, delta: -r.ml, consumed: r.ml });
  for (const r of await rows('purchases', [
    { $match: { date: { $gte: from }, alcoholId: { $in: ids } } },
    { $group: { _id: day('$alcoholId'), ml: { $sum: '$ml' } } },
  ]))
    out.push({ date: r._id.date, alcoholId: r._id.id, delta: r.ml, consumed: 0 });
  for (const r of await rows('stockMovements', [
    { $match: { date: { $gte: from } } },
    { $unwind: '$lines' },
    { $match: { 'lines.alcoholId': { $in: ids } } },
    {
      $group: {
        _id: day('$lines.alcoholId'),
        ml: { $sum: '$lines.ml' },
        used: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$kind', 'prepare'] }, { $lt: ['$lines.ml', 0] }] },
              { $multiply: ['$lines.ml', -1] },
              0,
            ],
          },
        },
      },
    },
  ]))
    out.push({ date: r._id.date, alcoholId: r._id.id, delta: r.ml, consumed: r.used || 0 });
  for (const r of await rows('stockResets', [
    { $match: { date: { $gte: from }, alcoholId: { $in: ids } } },
    { $group: { _id: day('$alcoholId'), ml: { $sum: '$ml' } } },
  ]))
    out.push({ date: r._id.date, alcoholId: r._id.id, delta: -r.ml, consumed: 0 });
  return out;
}
