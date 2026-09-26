import type { Db } from 'mongodb';
import {
  quoteGuestRequest,
  guestOrderLimits,
  guestRequestStatus,
  type GuestRequest,
  type GuestRequestInput,
} from '../../src/barbar/domain/guest-requests';
import type { BarTable, BarData } from '../../src/barbar/domain/types';
import { HttpError } from './http';
import { runMigrations } from './database/migrations';
import { guestMigrations } from './database/registry';

type Row = GuestRequest & { _id: string; accessCode: string; purgeAt: Date };
/** Public projection: never return tokens, internal order IDs or ledger objects. */
export const publicGuestRequest = (r: GuestRequest) => ({
  id: r.id,
  tableId: r.tableId,
  tableName: r.tableName,
  createdAt: r.createdAt,
  expiresAt: r.expiresAt,
  status: guestRequestStatus(r),
  lines: r.lines.map((l) => ({
    id: l.id,
    productId: l.productId,
    kind: l.kind,
    name: l.name,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    ...(l.servingMl ? { servingMl: l.servingMl } : {}),
  })),
  comment: r.comment,
  ...(r.acceptedLineIds ? { acceptedLineIds: r.acceptedLineIds } : {}),
});
export function guestOrderStore(db: Db, options: { migrations?: boolean } = {}) {
  const requests = db.collection<Row>('guestRequests');
  let ready: Promise<void> | undefined;
  async function ensureReady() {
    if (options.migrations === false) return;
    // This public function may be the first request after a deploy. Create the
    // collections and TTL/audit indexes before starting the submission transaction.
    ready ||= runMigrations(db, guestMigrations).catch((error) => {
      ready = undefined;
      throw error;
    });
    await ready;
  }
  return {
    async table(code: string) {
      await ensureReady();
      const table = await db.collection<BarTable & { _id: string }>('tables').findOne({ code, active: true });
      return table ? { id: table.id, name: table.name } : null;
    },
    async status(id: string, code: string) {
      await ensureReady();
      const row = await requests.findOne({ _id: id, accessCode: code, purgeAt: { $gt: new Date() } });
      return row ? publicGuestRequest(row) : null;
    },
    async pending() {
      await ensureReady();
      const rows = await requests
        .find({ status: 'pending', expiresAt: { $gt: new Date().toISOString() } })
        .sort({ createdAt: 1 })
        .limit(100)
        .toArray();
      return rows.map(publicGuestRequest);
    },
    async submit(input: GuestRequestInput) {
      await ensureReady();
      return db.client.withSession((session) =>
        session.withTransaction(
          async () => {
            const existing = await requests.findOne({ _id: input.id }, { session });
            if (existing) {
              if (existing.accessCode !== input.code) throw new HttpError('Заявка не найдена.', 404);
              return publicGuestRequest(existing);
            }
            if (
              await db
                .collection('auditEvents')
                .findOne(
                  { targetId: input.id, action: { $in: ['acceptGuestRequest', 'rejectGuestRequest'] } },
                  { session, projection: { _id: 1 } },
                )
            )
              throw new HttpError('Заявка уже обработана или истекла.', 409);
            const table = await db
              .collection<BarTable & { _id: string }>('tables')
              .findOne({ code: input.code, active: true }, { session });
            if (!table) throw new HttpError('Стол недоступен.', 404);
            const now = new Date();
            // A per-table write serializes submissions and enforces limits across function instances.
            const limits = db.collection<{ _id: string; window: number; count: number; purgeAt: Date }>(
              'guestLimits',
            );
            const window = Math.floor(+now / 60000);
            const previous = await limits.findOne({ _id: table.id }, { session });
            const count = previous?.window === window ? previous.count + 1 : 1;
            if (
              count > guestOrderLimits.submissionsPerMinute ||
              (await requests.countDocuments(
                { tableId: table.id, status: 'pending', expiresAt: { $gt: now.toISOString() } },
                { session },
              )) >= guestOrderLimits.pendingPerTable
            )
              throw new HttpError('Слишком много заявок. Подождите сотрудника.', 429);
            await limits.replaceOne(
              { _id: table.id },
              { window, count, purgeAt: new Date(+now + guestOrderLimits.retentionHours * 3600000) },
              { session, upsert: true },
            );
            const alcohol = await db.collection('alcohol').find({}, { session }).toArray();
            const cocktails = await db.collection('cocktails').find({}, { session }).toArray();
            // The same balances the ledger sells from: a drink shown as out of stock cannot be requested.
            // A built read model has a row per product; none at all means stock is not known yet.
            const balances = await db
              .collection<{ _id: string; ml: number }>('stockBalances')
              .find({}, { session, projection: { ml: 1 } })
              .toArray();
            let lines: GuestRequest['lines'];
            try {
              lines = quoteGuestRequest(
                { alcohol, cocktails } as unknown as BarData,
                input,
                balances.length ? new Map(balances.map((b) => [b._id, b.ml])) : undefined,
              );
            } catch (error) {
              throw new HttpError((error as Error).message);
            }
            const request: Row = {
              _id: input.id,
              id: input.id,
              accessCode: input.code,
              tableId: table.id,
              tableName: table.name,
              createdAt: now.toISOString(),
              expiresAt: new Date(+now + guestOrderLimits.expiresMinutes * 60000).toISOString(),
              purgeAt: new Date(+now + guestOrderLimits.retentionHours * 3600000),
              status: 'pending',
              comment: input.comment.trim(),
              lines,
            };
            await requests.insertOne(request, { session });
            // Staff see what was asked for without opening the board: names, portions and the menu total.
            await db.collection('guestEvents').insertOne(
              {
                _id: input.id as never,
                tableName: table.name,
                lines: lines.map((l) => ({
                  name: l.name,
                  quantity: l.quantity,
                  ...(l.servingMl ? { servingMl: l.servingMl } : {}),
                })),
                total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
                ...(request.comment ? { comment: request.comment } : {}),
                createdAt: now,
                expiresAt: new Date(request.expiresAt),
                nextAttempt: now,
                attempts: 0,
                delivered: [],
                done: false,
              },
              { session },
            );
            return publicGuestRequest(request);
          },
          { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
        ),
      );
    },
  };
}
