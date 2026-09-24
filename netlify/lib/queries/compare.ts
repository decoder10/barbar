import type { ClientSession, Db, Document } from 'mongodb';
import { barConfig } from '../../../src/barbar/config';
import {
  BUSINESS_DAY_START_HOUR,
  BUSINESS_TIME_ZONE,
  businessToday,
} from '../../../src/barbar/domain/business-day';
import {
  compare,
  type Bucket,
  type Comparison,
  type PeriodData,
} from '../../../src/barbar/domain/reports/compare';
import { json } from '../barbar-auth';
import { HttpError } from '../http';
import { revisionQuery } from './cache';
import { costKnownStage } from './history';

const validDate = (s: string | null): s is string =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const span = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86400000 + 1;

/** Both periods of `?from&to&baseFrom&baseTo`, each at most a year and not in the future. */
export function comparePeriods(params: URLSearchParams) {
  const from = params.get('from'),
    to = params.get('to'),
    baseFrom = params.get('baseFrom'),
    baseTo = params.get('baseTo');
  if (!validDate(from) || !validDate(to) || !validDate(baseFrom) || !validDate(baseTo))
    throw new HttpError('Проверьте периоды сравнения.');
  const today = businessToday();
  if (from > to || baseFrom > baseTo || from > today || baseFrom > today)
    throw new HttpError('Проверьте периоды сравнения.');
  const current = { from, to: to > today ? today : to };
  const base = { from: baseFrom, to: baseTo > today ? today : baseTo };
  if (span(current.from, current.to) > 366 || span(base.from, base.to) > 366)
    throw new HttpError('Период сравнения — не больше года.');
  return { current, base };
}

const businessDayOf = {
  $dateToString: {
    format: '%Y-%m-%d',
    date: { $subtract: ['$_at', BUSINESS_DAY_START_HOUR * 3600000] },
    timezone: BUSINESS_TIME_ZONE,
  },
};
const total = (key: unknown, label: unknown): Document[] => [
  {
    $group: {
      _id: key,
      label: { $last: label },
      units: { $sum: '$_units' },
      operations: { $sum: 1 },
      revenue: { $sum: '$revenue' },
      cost: { $sum: '$cost' },
    },
  },
  { $project: { _id: 0, key: '$_id', label: 1, units: 1, operations: 1, revenue: 1, cost: 1 } },
  { $sort: { key: 1 } },
];

/** The same buckets `periodFromSales` builds, in one pass over the period's active sales. */
async function readPeriod(
  db: Db,
  session: ClientSession,
  period: { from: string; to: string },
): Promise<PeriodData> {
  const options = { session, maxTimeMS: 10000 };
  const match = { date: { $gte: period.from, $lte: period.to }, voided: false };
  const [facets] = await db
    .collection('sales')
    .aggregate(
      [
        { $match: match },
        costKnownStage,
        { $set: { _at: { $toDate: '$createdAt' } } },
        {
          $set: {
            _units: {
              $cond: [
                { $eq: ['$kind', 'alcohol'] },
                { $divide: ['$quantity', barConfig.guest.pouredAlcohol.portionMl] },
                '$quantity',
              ],
            },
            _category: {
              $cond: [{ $eq: ['$kind', 'alcohol'] }, 'alcohol', { $ifNull: ['$category', 'cocktail'] }],
            },
            _weekday: { $toString: { $isoDayOfWeek: { $dateFromString: { dateString: '$date' } } } },
            // A sale entered after its business day has no meaningful hour.
            _hour: {
              $cond: [
                { $eq: [businessDayOf, '$date'] },
                { $dateToString: { format: '%H', date: '$_at', timezone: BUSINESS_TIME_ZONE } },
                'unknown',
              ],
            },
          },
        },
        {
          $facet: {
            products: total({ $concat: ['$kind', ':', '$productId'] }, '$name'),
            weekdays: total('$_weekday', '$_weekday'),
            hours: total('$_hour', '$_hour'),
            categories: total('$_category', '$_category'),
            unknown: [{ $match: { _costKnown: false } }, { $count: 'count' }],
          },
        },
      ],
      options,
    )
    .toArray();
  const days = (await db.collection('sales').distinct('date', match, options)) as string[];
  return {
    ...period,
    days: days.sort(),
    unknownCostOperations: facets?.unknown?.[0]?.count || 0,
    products: (facets?.products || []) as Bucket[],
    weekdays: (facets?.weekdays || []) as Bucket[],
    hours: (facets?.hours || []) as Bucket[],
    categories: (facets?.categories || []) as Bucket[],
  };
}

/** Owner-only period comparison; the caller has already checked the session and the role. */
export async function handleCompare(params: URLSearchParams, db: Db) {
  const { current, base } = comparePeriods(params);
  const result = await revisionQuery(
    db,
    `compare:${current.from}:${current.to}:${base.from}:${base.to}`,
    () =>
      db.client.withSession((session) =>
        session.withTransaction(
          // Sequential on purpose: a driver session does not support concurrent operations.
          async (): Promise<Comparison> => {
            const now = await readPeriod(db, session, current);
            const before = await readPeriod(db, session, base);
            return compare(now, before);
          },
          { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
        ),
      ),
  );
  return json({ current, base, comparison: result });
}
