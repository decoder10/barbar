import { revisionQuery } from './cache';
import type { Db, Document } from 'mongodb';
import { authenticated, json } from '../barbar-auth';
import type { IdentityStore } from '../barbar-users';
import { staffData } from '../barbar-access';
import type { BarData, Sale } from '../../../src/barbar/domain/types';
const dateValid = (s: string) =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function dateFilter(params: URLSearchParams) {
  const from = params.get('from') || '1900-01-01',
    to = params.get('to') || '9999-12-31';
  if (!dateValid(from) || !dateValid(to) || from > to) throw new Error('Проверьте период.');
  return { date: { $gte: from, $lte: to } };
}
/** Marks each sale whose cost is fully known: every ingredient and extra cost has a price. */
export const costKnownStage: Document = {
  $set: {
    _costKnown: {
      $and: [
        { $gt: ['$cost', 0] },
        {
          $allElementsTrue: {
            $map: { input: { $ifNull: ['$extraCosts', []] }, as: 'e', in: { $gt: ['$$e.cost', 0] } },
          },
        },
        {
          $allElementsTrue: {
            $map: { input: '$ingredients', as: 'i', in: { $gt: ['$$i.cost', 0] } },
          },
        },
      ],
    },
  },
};
export const salesGrouping = (financial: boolean): Document[] => [
  { $match: { voided: false } },
  ...(financial ? [costKnownStage] : []),
  {
    $group: {
      _id: { productId: '$productId', kind: '$kind', unit: '$unit', servingMl: '$servingMl' },
      name: { $last: '$name' },
      category: { $last: '$category' },
      quantity: { $sum: '$quantity' },
      operations: { $sum: 1 },
      revenue: { $sum: '$revenue' },
      ...(financial
        ? {
            ingredientIds: { $addToSet: '$ingredients.alcoholId' },
            cost: { $sum: '$cost' },
            knownCost: { $min: '$_costKnown' },
            knownOperations: { $sum: { $cond: ['$_costKnown', 1, 0] } },
            knownRevenue: { $sum: { $cond: ['$_costKnown', '$revenue', 0] } },
            knownCostTotal: { $sum: { $cond: ['$_costKnown', '$cost', 0] } },
          }
        : {}),
    },
  },
  {
    $project: {
      _id: 0,
      productId: '$_id.productId',
      kind: '$_id.kind',
      unit: '$_id.unit',
      servingMl: '$_id.servingMl',
      name: 1,
      category: 1,
      quantity: 1,
      operations: 1,
      revenue: 1,
      ...(financial
        ? {
            cost: 1,
            knownCost: 1,
            knownOperations: 1,
            knownRevenue: 1,
            knownCostTotal: 1,
            ingredientIds: 1,
          }
        : {}),
    },
  },
  { $sort: { operations: -1, name: 1 } },
];
export async function handleHistory(request: Request, db: Db, users: IdentityStore) {
  const user = await authenticated(request, users);
  if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  const params = new URL(request.url).searchParams;
  const collection = params.get('collection') || 'sales';
  if (!['sales', 'purchases', 'stockMovements', 'stockResets', 'expenses'].includes(collection))
    return json({ error: 'Неизвестный журнал.' }, 400);
  if (user.role !== 'owner' && collection !== 'sales')
    return json({ error: 'Журнал доступен только владельцу.' }, 403);
  try {
    const period = dateFilter(params);
    const after: Document = { ...period };
    const timed = ['sales', 'stockMovements', 'stockResets'].includes(collection);
    const sort = timed ? { date: -1, createdAt: -1, id: -1 } : { date: -1, id: -1 };
    const cursor = params.get('cursor');
    if (cursor) {
      if (cursor.length > 800) throw new SyntaxError('Invalid cursor');
      const c = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (!dateValid(c.date) || typeof c.id !== 'string' || c.id.length > 128)
        throw new SyntaxError('Invalid cursor');
      if (timed && (typeof c.createdAt !== 'string' || !Number.isFinite(Date.parse(c.createdAt))))
        throw new SyntaxError('Invalid cursor');
      after.$or = timed
        ? [
            { date: { $lt: c.date } },
            { date: c.date, createdAt: { $lt: c.createdAt } },
            { date: c.date, createdAt: c.createdAt, id: { $lt: c.id } },
          ]
        : [{ date: { $lt: c.date } }, { date: c.date, id: { $lt: c.id } }];
    }
    const result = await revisionQuery(db, `history:${user.role}:${params.toString()}`, () =>
      db.client.withSession((session) =>
        session.withTransaction(
          async () => {
            const documents = await db
              .collection(collection)
              .find(after, { session, maxTimeMS: 10000, projection: { _id: 0, _order: 0 } })
              .sort(sort as Record<string, 1 | -1>)
              .limit(51)
              .toArray();
            // Period totals belong to the first page; later pages reuse them on the client,
            // so a deep page costs one indexed find instead of a count and a period-wide aggregation.
            const total = cursor
              ? undefined
              : await db.collection(collection).countDocuments(period, { session, maxTimeMS: 10000 });
            const groups =
              collection === 'sales' && !cursor
                ? await db
                    .collection('sales')
                    .aggregate([{ $match: period }, ...salesGrouping(user.role === 'owner')], {
                      session,
                      maxTimeMS: 10000,
                    })
                    .toArray()
                : undefined;
            const last = documents[49];
            return {
              rows: documents.slice(0, 50),
              ...(total === undefined ? {} : { total }),
              groups,
              nextCursor:
                documents.length > 50
                  ? Buffer.from(
                      JSON.stringify({
                        date: last.date,
                        id: last.id,
                        ...(timed ? { createdAt: last.createdAt } : {}),
                      }),
                    ).toString('base64url')
                  : null,
            };
          },
          { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
        ),
      ),
    );
    if (user.role !== 'owner')
      return json({
        ...result,
        rows: staffData({
          version: 1,
          alcohol: [],
          cocktails: [],
          purchases: [],
          sales: result.rows as unknown as Sale[],
          operations: [],
        } as BarData).sales,
      });
    return json(result);
  } catch (error) {
    return json(
      {
        error:
          error instanceof SyntaxError
            ? 'Некорректная страница.'
            : error instanceof Error && error.message.startsWith('Проверьте')
              ? error.message
              : 'Не удалось загрузить журнал.',
      },
      error instanceof SyntaxError || (error instanceof Error && error.message.startsWith('Проверьте'))
        ? 400
        : 503,
    );
  }
}
