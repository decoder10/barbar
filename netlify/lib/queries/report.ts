import { aggregatedPerformance, aggregatedAnalytics } from '../../../src/barbar/domain/reports/aggregated';
import type { SalesGroup } from '../../../src/barbar/domain/reports/server-types';
import { revisionQuery } from './cache';
import type { Db } from 'mongodb';
import { authenticated, json } from '../barbar-auth';
import type { IdentityStore } from '../barbar-users';
import { dateFilter, salesGrouping } from './history';
import { workingData } from '../barbar-working';
import { forecastFromUsage } from '../../../src/barbar/domain/reports/purchasing';
import { availabilityDays, type DailyChange } from '../../../src/barbar/domain/reports/availability';
import { stockTotals } from '../../../src/barbar/domain/model';
import { businessToday } from '../../../src/barbar/domain/business-day';
import { handleCompare } from './compare';
import { handlePrices } from './prices';
import { respondError } from '../http';
import type { Supplier } from '../../../src/barbar/domain/types';
export async function handleReport(request: Request, db: Db, users: IdentityStore) {
  const user = await authenticated(request, users);
  if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  if (user.role !== 'owner') return json({ error: 'Отчёты доступны только владельцу.' }, 403);
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  const params = new URL(request.url).searchParams;
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/barbar/report/compare' || pathname === '/api/barbar/prices') {
    try {
      return await (pathname === '/api/barbar/prices' ? handlePrices(params, db) : handleCompare(params, db));
    } catch (error) {
      return respondError(error, 'Отчёт временно недоступен.');
    }
  }
  let period: ReturnType<typeof dateFilter>;
  try {
    period = dateFilter(params);
  } catch {
    return json({ error: 'Проверьте период.' }, 400);
  }
  const lead = Math.min(90, Math.max(0, Number(params.get('lead') || 3)));
  const reserve = Math.min(90, Math.max(0, Number(params.get('reserve') || 4)));
  if (!Number.isFinite(lead + reserve)) return json({ error: 'Проверьте срок поставки.' }, 400);
  const data = await revisionQuery(db, `report:${params.toString()}`, () =>
    db.client.withSession((session) =>
      session.withTransaction(
        async () => {
          const options = { session, maxTimeMS: 10000 };
          const groups = await db
            .collection('sales')
            .aggregate([{ $match: period }, ...salesGrouping(true)], options)
            .toArray();
          const daily = await db
            .collection('sales')
            .aggregate(
              [
                { $match: { ...period, voided: false } },
                { $group: { _id: '$date', revenue: { $sum: '$revenue' } } },
                { $project: { _id: 0, date: '$_id', revenue: 1 } },
                { $sort: { date: 1 } },
              ],
              options,
            )
            .toArray();
          const purchaseRows = await db
            .collection('purchases')
            .aggregate(
              [
                { $match: period },
                { $lookup: { from: 'alcohol', localField: 'alcoholId', foreignField: 'id', as: 'product' } },
                {
                  $group: {
                    _id: null,
                    count: { $sum: 1 },
                    total: {
                      $sum: {
                        $divide: [
                          { $multiply: ['$ml', '$costPerLiter'] },
                          {
                            $cond: [
                              { $in: [{ $arrayElemAt: ['$product.unit', 0] }, ['bottle', 'pcs']] },
                              1,
                              1000,
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
              ],
              options,
            )
            .toArray();
          const cancellations = await db
            .collection('sales')
            .countDocuments({ ...period, voided: true }, options);
          const expenses = await db
            .collection('expenses')
            .aggregate(
              [
                { $match: { ...period, voided: false } },
                { $group: { _id: null, value: { $sum: '$amount' } } },
              ],
              options,
            )
            .toArray();
          const losses = await db
            .collection('stockMovements')
            .aggregate(
              [
                { $match: { ...period, kind: { $in: ['count', 'writeoff'] } } },
                { $unwind: '$lines' },
                { $match: { 'lines.cost': { $lt: 0 } } },
                { $group: { _id: null, value: { $sum: { $multiply: ['$lines.cost', -1] } } } },
              ],
              options,
            )
            .toArray();
          const resets = await db
            .collection('stockResets')
            .aggregate([{ $match: period }, { $group: { _id: null, value: { $sum: '$cost' } } }], options)
            .toArray();
          const usage = await db
            .collection('sales')
            .aggregate(
              [
                { $match: { ...period, voided: false } },
                { $unwind: '$ingredients' },
                { $group: { _id: '$ingredients.alcoholId', ml: { $sum: '$ingredients.ml' } } },
              ],
              options,
            )
            .toArray();
          const prepared = await db
            .collection('stockMovements')
            .aggregate(
              [
                { $match: { ...period, kind: 'prepare' } },
                { $unwind: '$lines' },
                { $match: { 'lines.ml': { $lt: 0 } } },
                { $group: { _id: '$lines.alcoholId', ml: { $sum: { $multiply: ['$lines.ml', -1] } } } },
              ],
              options,
            )
            .toArray();
          const outputs = await db
            .collection('stockMovements')
            .distinct('outputId', { kind: 'prepare' }, options);
          const current = await workingData(db, session, []);
          const suppliers = (await db
            .collection('suppliers')
            .find({}, { session, projection: { _id: 0, _order: 0 } })
            .sort({ name: 1 })
            .toArray()) as unknown as Supplier[];
          // Feed compact usage totals into the shared forecast, then restore current stock as its opening basis.
          const from = period.date.$gte,
            to = period.date.$lte > businessToday() ? businessToday() : period.date.$lte;
          const consumed = new Map<string, number>();
          for (const row of [...usage, ...prepared])
            consumed.set(row._id, (consumed.get(row._id) || 0) + row.ml);
          // Daily net changes since the period start rebuild past balances from today's stock.
          const since = { date: { $gte: from } };
          const byDay = (id: string) => ({ date: '$date', id });
          const dailyChanges = async (name: string, pipeline: object[]) =>
            (await db.collection(name).aggregate(pipeline, options).toArray()) as {
              _id: { date: string; id: string };
              ml: number;
              used?: number;
            }[];
          const changes: DailyChange[] = [
            ...(
              await dailyChanges('sales', [
                { $match: { ...since, voided: false } },
                { $unwind: '$ingredients' },
                { $group: { _id: byDay('$ingredients.alcoholId'), ml: { $sum: '$ingredients.ml' } } },
              ])
            ).map((r) => ({ date: r._id.date, alcoholId: r._id.id, delta: -r.ml, consumed: r.ml })),
            ...(
              await dailyChanges('purchases', [
                { $match: since },
                { $group: { _id: byDay('$alcoholId'), ml: { $sum: '$ml' } } },
              ])
            ).map((r) => ({ date: r._id.date, alcoholId: r._id.id, delta: r.ml, consumed: 0 })),
            ...(
              await dailyChanges('stockMovements', [
                { $match: since },
                { $unwind: '$lines' },
                {
                  $group: {
                    _id: byDay('$lines.alcoholId'),
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
              ])
            ).map((r) => ({ date: r._id.date, alcoholId: r._id.id, delta: r.ml, consumed: r.used || 0 })),
            ...(
              await dailyChanges('stockResets', [
                { $match: since },
                { $group: { _id: byDay('$alcoholId'), ml: { $sum: '$ml' } } },
              ])
            ).map((r) => ({ date: r._id.date, alcoholId: r._id.id, delta: -r.ml, consumed: 0 })),
          ];
          const workedDates = (await db
            .collection('sales')
            .distinct('date', { date: { $gte: from, $lte: to }, voided: false }, options)) as string[];
          const availability = availabilityDays({
            from,
            to,
            current: stockTotals(current),
            changes,
            workedDates,
          });
          const forecast = forecastFromUsage(
            current,
            from,
            to,
            lead,
            reserve,
            consumed,
            new Set(outputs),
            availability,
            suppliers,
          );
          const performance = aggregatedPerformance(current, groups as unknown as SalesGroup[]);
          return {
            performance,
            analytics: aggregatedAnalytics(performance, cancellations, {
              operations: groups.reduce((sum, g) => sum + (g.knownOperations || 0), 0),
              revenue: groups.reduce((sum, g) => sum + (g.knownRevenue || 0), 0),
              cost: groups.reduce((sum, g) => sum + (g.knownCostTotal || 0), 0),
            }),
            purchaseTotal: purchaseRows[0]?.total || 0,
            purchaseCount: purchaseRows[0]?.count || 0,
            consumed: Object.fromEntries(usage.map((r) => [r._id, r.ml])),
            groups,
            daily,
            cancellations,
            expenses: expenses[0]?.value || 0,
            losses: (losses[0]?.value || 0) + (resets[0]?.value || 0),
            forecast,
            suppliers,
          };
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      ),
    ),
  );
  return json(data);
}
