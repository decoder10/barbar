import type { Db, Filter } from 'mongodb';
import { authenticated, json } from '../barbar-auth';
import type { IdentityStore } from '../barbar-users';
import type { AuditEvent } from './store';
export async function handleAudit(request: Request, db: Db, users: IdentityStore) {
  const user = await authenticated(request, users);
  if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  if (user.role !== 'owner') return json({ error: 'Журнал доступен только владельцу.' }, 403);
  if (request.method !== 'GET') return json({ error: 'Метод не поддерживается.' }, 405);
  const query = new URL(request.url).searchParams;
  const filter: Filter<AuditEvent> = {};
  const actor = query.get('actor');
  if (actor) filter['actor.id'] = actor.slice(0, 128);
  const action = query.get('action');
  if (action) filter.action = action.slice(0, 64);
  const cursor = query.get('cursor');
  if (cursor) {
    try {
      if (cursor.length > 800) throw new Error();
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (
        typeof value.date !== 'string' ||
        typeof value.id !== 'string' ||
        value.id.length > 128 ||
        !/^\d{4}-\d{2}-\d{2}T/.test(value.date)
      )
        throw new Error();
      filter.$or = [{ createdAt: { $lt: value.date } }, { createdAt: value.date, id: { $lt: value.id } }];
    } catch {
      return json({ error: 'Некорректная страница журнала.' }, 400);
    }
  }
  const events = await db
    .collection<AuditEvent>('auditEvents')
    .find(filter, { maxTimeMS: 10000, projection: { _id: 0 } })
    .sort({ createdAt: -1, id: -1 })
    .limit(51)
    .toArray();
  const more = events.length > 50;
  const items = events.slice(0, 50);
  const last = items.at(-1);
  return json({
    events: items,
    nextCursor:
      more && last
        ? Buffer.from(JSON.stringify({ date: last.createdAt, id: last.id })).toString('base64url')
        : null,
  });
}
