import { createServer } from 'vite';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const uri = process.env.BARBAR_TEST_MONGODB_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(uri))
  throw new Error('A local test MongoDB URI is required.');
const client = new MongoClient(uri, { maxPoolSize: 16, serverSelectionTimeoutMS: 5000 });
const db = client.db(`barbar_test_load_${randomUUID().replaceAll('-', '')}`);
const server = await createServer({
  configFile: false,
  cacheDir: '/tmp/barbar-load-vite',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: 'custom',
});
const metrics = {};
const ms = (n) => Math.round(n * 100) / 100;
async function measure(name, count, concurrency, fn) {
  const samples = [],
    started = performance.now();
  let offset = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (offset < count) {
        const i = offset++,
          start = performance.now();
        await fn(i);
        samples.push(performance.now() - start);
      }
    }),
  );
  samples.sort((a, b) => a - b);
  metrics[name] = {
    requests: count,
    concurrency,
    p50Ms: ms(samples[Math.floor(count * 0.5)]),
    p95Ms: ms(samples[Math.min(count - 1, Math.floor(count * 0.95))]),
    totalMs: ms(performance.now() - started),
  };
}
try {
  const { initialData, stock, averageCost } = await server.ssrLoadModule('/src/barbar/domain/model.ts');
  const { businessToday } = await server.ssrLoadModule('/src/barbar/domain/business-day.ts');
  const { mongoRepository } = await server.ssrLoadModule('/netlify/lib/barbar-mongo.ts');
  const { handleBarApi } = await server.ssrLoadModule('/netlify/lib/barbar-handler.ts');
  const { handleHistory } = await server.ssrLoadModule('/netlify/lib/queries/history.ts');
  const { handleReport } = await server.ssrLoadModule('/netlify/lib/queries/report.ts');
  const { identity } = await server.ssrLoadModule('/tests/identity-fixture.ts');
  const { sessionCookie } = await server.ssrLoadModule('/netlify/lib/barbar-auth.ts');
  const day = businessToday(),
    seed = initialData();
  seed.purchases = [{ id: 'load-purchase', alcoholId: 'vodka', ml: 1000000, costPerLiter: 4000, date: day }];
  seed.sales = Array.from({ length: 50000 }, (_, i) => ({
    id: `load-${i.toString().padStart(6, '0')}`,
    date: day,
    createdAt: new Date(Date.now() - (50000 - i) * 1000).toISOString(),
    kind: 'alcohol',
    productId: 'vodka',
    name: 'Vodka',
    quantity: 1,
    revenue: 18,
    cost: 4,
    ingredients: [{ alcoholId: 'vodka', ml: 1, cost: 4 }],
    voided: false,
  }));
  const repo = mongoRepository(client, db, async () => ({ ...seed, sales: [] }));
  await repo.readWorking();
  // Fixture construction represents an already accumulated journal, not a giant atomic import.
  for (let i = 0; i < seed.sales.length; i += 500)
    await db
      .collection('sales')
      .insertMany(seed.sales.slice(i, i + 500).map((s, j) => ({ ...s, _id: s.id, _order: i + j })));
  const { ledgerBalances } = await server.ssrLoadModule('/netlify/lib/barbar-working.ts');
  await db
    .collection('stockBalances')
    .bulkWrite(ledgerBalances(seed).map((b) => ({ replaceOne: { filter: { _id: b._id }, replacement: b } })));

  const other = mongoRepository(client, db);
  await other.readWorking();
  const request = (path = '', command) =>
    new Request('https://barbar.example/api/barbar' + path, {
      method: command ? 'POST' : 'GET',
      headers: {
        cookie: sessionCookie(new Request('https://barbar.example'), 'admin'),
        origin: 'https://barbar.example',
        'content-type': 'application/json',
      },
      ...(command ? { body: JSON.stringify({ command }) } : {}),
    });
  let compactBytes = 0,
    historyBytes = 0,
    historyCursor = null,
    deepBytes = 0;
  await measure('workingState', 60, 10, async () => {
    const r = await handleBarApi(request(), repo, identity);
    assert.equal(r.status, 200);
    const text = await r.text();
    compactBytes = Buffer.byteLength(text);
    assert.equal(JSON.parse(text).data.sales.length, 0);
  });
  await measure('historyFirstPage', 12, 4, async () => {
    const r = await handleHistory(request(`/history?from=${day}&to=${day}`), db, identity);
    assert.equal(r.status, 200);
    const text = await r.text();
    historyBytes = Buffer.byteLength(text);
    const page = JSON.parse(text);
    assert.equal(page.rows.length, 50);
    assert.equal(page.total, 50000);
    assert.equal(page.groups[0].operations, 50000);
    historyCursor = page.nextCursor;
  });
  // A deep page must cost one indexed find: no period count, no period-wide grouping.
  await measure('historyDeepPage', 12, 4, async () => {
    const r = await handleHistory(
      request(`/history?from=${day}&to=${day}&cursor=${historyCursor}`),
      db,
      identity,
    );
    assert.equal(r.status, 200);
    const text = await r.text();
    deepBytes = Buffer.byteLength(text);
    const page = JSON.parse(text);
    assert.equal(page.rows.length, 50);
    assert.equal(page.total, undefined);
    assert.equal(page.groups, undefined);
  });
  await measure('reportCold', 1, 1, async () => {
    const r = await handleReport(request(`/report?from=${day}&to=${day}`), db, identity);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).groups[0].operations, 50000);
  });
  await measure('reportCached', 40, 8, async () => {
    assert.equal((await handleReport(request(`/report?from=${day}&to=${day}`), db, identity)).status, 200);
  });
  const sale = (i) => ({
    id: `concurrent-${i}`,
    type: 'sale',
    value: { kind: 'alcohol', productId: 'vodka', quantity: 10, date: day },
  });
  await measure('sales', 30, 6, async (i) => {
    const r = await handleBarApi(request('', sale(i)), i % 2 ? repo : other, identity);
    assert.equal(r.status, 200, await r.text());
  });
  await measure('retries', 30, 6, async (i) => {
    assert.equal((await handleBarApi(request('', sale(i)), other, identity)).status, 200);
  });
  const compact = (await repo.readWorking()).data,
    full = (await repo.read()).data;
  assert.equal(full.sales.length, 50030);
  assert.equal(stock(compact, 'vodka'), 949700);
  assert.equal(stock(full, 'vodka'), stock(compact, 'vodka'));
  assert.equal(averageCost(full, 'vodka'), averageCost(compact, 'vodka'));
  assert.equal(await db.collection('auditEvents').countDocuments(), 30);
  const plan = await db
    .collection('sales')
    .find({ date: { $gte: day, $lte: day } })
    .sort({ date: -1, createdAt: -1, id: -1 })
    .limit(51)
    .explain('executionStats');
  const fullBytes = Buffer.byteLength(JSON.stringify(full));
  console.log(
    JSON.stringify(
      {
        environment: 'local MongoDB replica set; synthetic data; not an Atlas/Netlify latency guarantee',
        historySales: 50000,
        products: seed.alcohol.length,
        compactBytes,
        historyPageBytes: historyBytes,
        historyDeepPageBytes: deepBytes,
        fullBytes,
        reduction: ms(fullBytes / compactBytes),
        historyQuery: {
          returned: plan.executionStats.nReturned,
          examined: plan.executionStats.totalDocsExamined,
          keys: plan.executionStats.totalKeysExamined,
        },
        metrics,
        integrity: 'stock, valuation, 30 audit events and deduplicated retries verified',
      },
      null,
      2,
    ),
  );
} finally {
  await db.dropDatabase();
  await client.close();
  await server.close();
}
