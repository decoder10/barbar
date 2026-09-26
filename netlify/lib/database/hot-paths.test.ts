import { MongoClient, type Document } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureData } from '../../../tests/fixtures';
import { identity } from '../../../tests/identity-fixture';
import type { FeedItem } from '../../../src/barbar/domain/notifications/feed';
import { handleAudit } from '../audit/handler';
import { mongoRepository } from '../barbar-mongo';
import { guestOrderStore } from '../guest-order-store';
import { handleNotificationsFeed } from '../notifications/feed';
import { handleHistory } from '../queries/history';
import { handlePrices } from '../queries/prices';

const uri = process.env.BARBAR_TEST_MONGODB_URI;
// Collections that grow with use. Catalog, tables, balances and state are small and read whole on purpose.
const growing = [
  'orders',
  'sales',
  'shifts',
  'auditEvents',
  'priceChanges',
  'guestRequests',
  'stockAlertEvents',
  'purchaseEvents',
  'guestEvents',
  'purchases',
  'expenses',
  'stockMovements',
  'stockResets',
];
interface Read {
  scenario: string;
  collection: string;
  kind: string;
  plan: string;
  sort: boolean;
  docs: number;
  keys: number;
  returned: number;
}
type Stage = { stage: string; indexName?: string };
const nodes = (value: unknown): Stage[] => {
  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  return [...(typeof row.stage === 'string' ? [row as Stage] : []), ...Object.values(row).flatMap(nodes)];
};
const stages = (value: unknown) => nodes(value).map((n) => n.stage);
// Session and transaction fields cannot go into explain; the query itself stays as the code sent it.
const transport = new Set([
  'lsid',
  'txnNumber',
  'autocommit',
  'startTransaction',
  'readConcern',
  'writeConcern',
]);

describe.skipIf(!uri)('hot API reads stay on indexes (isolated local MongoDB, real code paths)', () => {
  if (uri && !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(uri))
    throw new Error('Local test URI required');
  const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017', {
    serverSelectionTimeoutMS: 5000,
    monitorCommands: true,
  });
  const db = client.db(`barbar_test_hot_paths_${crypto.randomUUID().replaceAll('-', '')}`);
  const data = fixtureData();
  const repo = mongoRepository(client, db, async () => fixtureData());
  const cocktails = data.cocktails.slice(0, 20).map((c) => c.id);
  const days = Array.from({ length: 240 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10),
  );
  const at = (path: string, cookie = 'admin') =>
    new Request(`https://barbar.test${path}`, { headers: { cookie: `barbar_session=${cookie}` } });
  const reads: Read[] = [];

  let recording: Document[] | undefined;
  client.on('commandStarted', (event) => {
    const name = event.command.find ?? event.command.aggregate ?? event.command.count;
    if (recording && event.databaseName === db.databaseName && growing.includes(name))
      recording.push(event.command);
  });

  /** Runs one API call, then explains every read it sent to a growing collection, exactly as sent. */
  async function explained(scenario: string, run: () => Promise<unknown>) {
    const sent: Document[] = [];
    recording = sent;
    const result = await run().finally(() => (recording = undefined));
    const found: Read[] = [];
    for (const command of sent) {
      const query = Object.fromEntries(
        Object.entries(command).filter(([key]) => !key.startsWith('$') && !transport.has(key)),
      );
      const plan = await db.command({ explain: query, verbosity: 'executionStats' });
      const cursor = plan.stages?.find((s: Document) => s.$cursor)?.$cursor;
      const stats = plan.executionStats ?? cursor.executionStats;
      const winning = nodes(plan.queryPlanner?.winningPlan ?? cursor.queryPlanner.winningPlan);
      found.push({
        scenario,
        collection: command.find ?? command.aggregate ?? command.count,
        kind: command.find ? 'find' : command.aggregate ? 'aggregate' : 'count',
        plan: winning
          .filter((n) => /SCAN|IDHACK|EXPRESS/.test(n.stage))
          .map((n) => [n.stage, n.indexName].filter(Boolean).join(' '))
          .join(', '),
        sort: winning.some((n) => n.stage === 'SORT'),
        docs: stats.totalDocsExamined,
        keys: stats.totalKeysExamined,
        returned: stats.nReturned,
      });
    }
    reads.push(...found);
    return { result, reads: found };
  }

  beforeAll(async () => {
    await client.connect();
    // The first request builds the ledger and runs every registered migration, as after a deploy.
    await repo.readOrders!();
    const insert = async (name: string, rows: Document[]) => {
      for (let i = 0; i < rows.length; i += 1000)
        await db.collection(name).insertMany(rows.slice(i, i + 1000), { ordered: false });
    };
    const orders: Document[] = [];
    const sales: Document[] = [];
    for (let n = 0; n < 12000; n++) {
      const businessDay = days[Math.floor(n / 50)];
      const openedAt = new Date(Date.parse(`${businessDay}T08:00:00Z`) + (n % 50) * 60000).toISOString();
      const open = n >= 11994;
      orders.push({
        _id: `order-${n}`,
        id: `order-${n}`,
        _order: n,
        tableId: `table-${n % 20}`,
        status: open ? 'open' : 'paid',
        businessDay,
        openedAt,
        openedBy: { id: `worker-${n % 8}`, fullName: `Worker ${n % 8}` },
        ...(open
          ? {}
          : {
              closedAt: openedAt,
              total: 2400,
              payments: [{ id: `pay-${n}`, method: 'cash', amount: 2400 }],
            }),
      });
      for (let line = 0; line < 2; line++)
        sales.push({
          _id: `sale-${n}-${line}`,
          id: `sale-${n}-${line}`,
          _order: 1000 + n * 2 + line,
          orderId: `order-${n}`,
          date: businessDay,
          createdAt: openedAt,
          kind: 'cocktail',
          productId: cocktails[n % cocktails.length],
          name: 'Cocktail',
          quantity: 1,
          revenue: 1200,
          cost: 300,
          ingredients: [],
          voided: (n * 2 + line) % 40 === 0,
        });
    }
    await insert('orders', orders);
    await insert('sales', sales);
    await insert(
      'shifts',
      days.slice(0, -1).map((businessDay, n) => ({
        _id: `shift-${n}`,
        id: `shift-${n}`,
        _order: n,
        businessDay,
        closedAt: `${businessDay}T23:00:00.000Z`,
        count: 50,
        revenue: 120000,
        payments: { cash: 120000 },
        countedCash: 120000,
        difference: 0,
      })),
    );
    await insert(
      'priceChanges',
      Array.from({ length: 3000 }, (_, n) => ({
        _id: `price-${n}`,
        id: `price-${String(n).padStart(5, '0')}`,
        _order: n,
        date: days[Math.floor(n / 12.5)],
        createdAt: new Date(Date.UTC(2026, 0, 1) + n * 6912000).toISOString(),
        kind: 'cocktail',
        productId: cocktails[n % cocktails.length],
        name: 'Cocktail',
        field: 'price',
        from: 1000 + n,
        to: 1001 + n,
      })),
    );
    await insert(
      'auditEvents',
      Array.from({ length: 20000 }, (_, n) => ({
        _id: `audit-${n}`,
        id: `audit-${String(n).padStart(6, '0')}`,
        createdAt: new Date(Date.UTC(2026, 0, 1) + n * 1000000).toISOString(),
        actor: { id: `worker-${n % 8}`, fullName: `Worker ${n % 8}`, role: 'worker' },
        action: `action-${Math.floor(n / 8) % 10}`,
        targetId: `target-${n}`,
        summary: 'sale',
      })),
    );
    const now = Date.now();
    await insert(
      'guestRequests',
      Array.from({ length: 3000 }, (_, n) => {
        // 30 waiting requests, 300 expired without an answer, the rest answered.
        const createdAt = new Date(now - (3000 - n) * 60000);
        const status = n >= 2670 ? 'pending' : n % 10 === 0 ? 'rejected' : 'accepted';
        const expiresAt = new Date(+createdAt + (n >= 2970 ? 60 : 15) * 60000);
        return {
          _id: `guest-${n}`,
          id: `guest-${n}`,
          accessCode: `code-${n % 20}`,
          tableId: `table-${n % 20}`,
          tableName: String(n % 20),
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          purgeAt: new Date(now + 86400000),
          status,
          comment: '',
          lines: [],
        };
      }),
    );
    // Queued notifications interleave in time; the older guest events have expired but wait for the TTL monitor.
    const base = now - 7200000;
    const event = (n: number, offset: number) => ({
      _id: `event-${n}`,
      createdAt: new Date(base + (n * 3 + offset) * 1000),
      nextAttempt: new Date(base),
      attempts: 1,
      delivered: [],
      done: true,
    });
    await insert(
      'stockAlertEvents',
      Array.from({ length: 2000 }, (_, n) => ({
        ...event(n, 0),
        expiresAt: new Date(now + 86400000),
        alerts: [{ alcoholId: 'gin', name: 'Gin', level: 'low', stock: 1, unit: 'ml' }],
      })),
    );
    await insert(
      'purchaseEvents',
      Array.from({ length: 2000 }, (_, n) => ({
        ...event(n, 1),
        expiresAt: new Date(now + 7 * 86400000),
        purchase: { purchaseId: `purchase-${n}`, name: 'Gin', quantity: 700, unit: 'ml', amount: 6440 },
      })),
    );
    await insert(
      'guestEvents',
      Array.from({ length: 2000 }, (_, n) => ({
        ...event(n, 2),
        expiresAt: new Date(base + (n * 3 + 2) * 1000 + 3600000),
        tableName: String(n % 20),
        lines: [{ name: 'Mojito', quantity: 1 }],
        total: 2400,
      })),
    );
  }, 120000);
  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });

  it('keeps the notification feed newest first, with the same items per role', async () => {
    const expected = async (owner: boolean) => {
      const now = new Date();
      const pick = async (name: string, kind: string, filter: Document = {}) =>
        (await db.collection(name).find(filter).toArray()).map((r) => ({
          id: `${kind}:${r._id}`,
          createdAt: +r.createdAt,
        }));
      return [
        ...(await pick('guestEvents', 'guest', { expiresAt: { $gt: now } })),
        ...(await pick('stockAlertEvents', 'stock')),
        ...(owner ? await pick('purchaseEvents', 'purchase') : []),
      ]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50)
        .map((r) => r.id);
    };
    for (const [cookie, owner] of [
      ['admin', true],
      ['barbar', false],
    ] as const) {
      const { result, reads: feed } = await explained(`feed:${owner ? 'owner' : 'worker'}`, () =>
        handleNotificationsFeed(at('/api/barbar/notifications', cookie), db, identity),
      );
      const { items } = (await (result as Response).json()) as { items: FeedItem[] };
      expect(items.map((i) => i.id)).toEqual(await expected(owner));
      expect(new Set(items.map((i) => i.kind))).toEqual(
        new Set(owner ? ['guest', 'stock', 'purchase'] : ['guest', 'stock']),
      );
      expect(feed.map((r) => r.collection).sort()).toEqual(
        owner ? ['guestEvents', 'purchaseEvents', 'stockAlertEvents'] : ['guestEvents', 'stockAlertEvents'],
      );
      // Each queue gives its 50 newest events: read exactly those, already in index order.
      for (const read of feed) {
        expect(read, JSON.stringify(read)).toMatchObject({ docs: 50, returned: 50, sort: false });
        expect(read.plan).toBe('IXSCAN createdAt_-1');
      }
    }
  });

  it('serves the open tables board, shifts, repeat orders and guest requests from indexes', async () => {
    const board = await explained('orders:open-board', () => repo.readOrders!());
    expect((board.result as { orders: unknown[] }).orders).toHaveLength(6);
    const shifts = await explained('orders:shifts-month', () => repo.readShifts!(days[200], days[229]));
    expect((shifts.result as { shifts: unknown[] }).shifts).toHaveLength(30);
    const mine = await explained('orders:recent-mine', () =>
      repo.readRecentOrders!({ scope: 'mine', userId: 'worker-3', limit: 10 }),
    );
    expect((mine.result as { orders: unknown[] }).orders).toHaveLength(10);
    const table = await explained('orders:recent-table', () =>
      repo.readRecentOrders!({ scope: 'table', userId: 'worker-3', tableId: 'table-4', limit: 10 }),
    );
    expect((table.result as { orders: unknown[] }).orders).toHaveLength(10);
    const pending = await explained('guest:pending', () => guestOrderStore(db).pending());
    expect(pending.result).toHaveLength(30);
    const [guest] = pending.reads;
    // Only live waiting requests are read; sorting them in memory is bounded by the per-table limit.
    expect(guest).toMatchObject({ collection: 'guestRequests', docs: 30, keys: 30, returned: 30 });
    // Command reads inside `execute`: the open receipts of one table and a closing day's orders.
    for (const filter of [{ tableId: 'table-4', status: 'open' }, { businessDay: days[120] }]) {
      const plan = await db.collection('orders').find(filter).explain('executionStats');
      expect(stages(plan.queryPlanner.winningPlan)).not.toContain('COLLSCAN');
      expect(plan.executionStats.totalDocsExamined).toBe(plan.executionStats.nReturned);
    }
  });

  it('pages the audit journal, price history and sales history without scanning or sorting', async () => {
    const pages = [
      ['audit:first-page', '/api/barbar/audit'],
      ['audit:actor', '/api/barbar/audit?actor=worker-3'],
      ['audit:actor-action', '/api/barbar/audit?actor=worker-3&action=action-4'],
    ] as const;
    for (const [scenario, path] of pages) {
      const { result } = await explained(scenario, () => handleAudit(at(path), db, identity));
      expect(((await (result as Response).json()) as { events: unknown[] }).events.length).toBeGreaterThan(0);
    }
    const all = await explained('prices:all', () => handlePrices(new URLSearchParams(), db));
    expect(((await (all.result as Response).json()) as { changes: unknown[] }).changes).toHaveLength(30);
    const one = await explained('prices:product', () =>
      handlePrices(new URLSearchParams({ kind: 'cocktail', productId: cocktails[7], limit: '30' }), db),
    );
    expect(((await (one.result as Response).json()) as { changes: unknown[] }).changes).toHaveLength(30);
    const range = `from=${days[0]}&to=${days.at(-1)}`;
    const first = await explained('history:sales-first-page', () =>
      handleHistory(at(`/api/barbar/history?collection=sales&${range}`), db, identity),
    );
    const { nextCursor } = (await (first.result as Response).json()) as { nextCursor: string };
    expect(nextCursor).toBeTruthy();
    await explained('history:sales-next-page', () =>
      handleHistory(at(`/api/barbar/history?collection=sales&${range}&cursor=${nextCursor}`), db, identity),
    );
  });

  it('reads no growing collection by a full scan and returns finds in index order', () => {
    console.info(
      'Hot path reads:',
      JSON.stringify(
        reads.map(
          (r) =>
            `${r.scenario} ${r.collection} ${r.kind} ${r.plan} sort=${r.sort} docs=${r.docs} keys=${r.keys} n=${r.returned}`,
        ),
        null,
        1,
      ),
    );
    expect(new Set(reads.map((r) => r.scenario)).size).toBe(14);
    for (const read of reads) {
      const where = JSON.stringify(read);
      expect(read.plan, where).not.toMatch(/COLLSCAN/);
      if (read.kind !== 'find') continue;
      // A find reads about what it returns: cancelled lines are skipped, and a history cursor page may
      // pass over the previous page once (deep pages: indexes.test.ts).
      expect(read.docs, where).toBeLessThanOrEqual(read.returned * 2 + 2);
      if (read.collection !== 'guestRequests') expect(read.sort, where).toBe(false);
    }
  });
});
