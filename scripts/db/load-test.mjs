import { createServer } from 'vite';
import { MongoClient } from 'mongodb';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { connect, createServer as createTcpServer } from 'node:net';
import { performance } from 'node:perf_hooks';
const uri = process.env.BARBAR_TEST_MONGODB_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(uri))
  throw new Error('A local test MongoDB URI is required.');
const client = new MongoClient(uri, { maxPoolSize: 16, serverSelectionTimeoutMS: 5000 });
const db = client.db(`barbar_test_load_${randomUUID().replaceAll('-', '')}`);
// Cold starts go through a local TCP proxy that delays every packet by half of BARBAR_LOAD_RTT_MS, so
// their timing counts sequential MongoDB round trips as a remote cluster would. The default RTT is an
// assumption, not a measurement of Atlas. A separate client observes every command of these instances.
const rtt = Number(process.env.BARBAR_LOAD_RTT_MS ?? 20);
const upstream = new URL(uri.replace(/^mongodb:/, 'http:'));
const proxy = createTcpServer((socket) => {
  const target = connect(Number(upstream.port), upstream.hostname);
  const close = () => {
    socket.destroy();
    target.destroy();
  };
  for (const [from, to] of [
    [socket, target],
    [target, socket],
  ])
    from
      .on('data', (chunk) => setTimeout(() => to.destroyed || to.write(chunk), rtt / 2))
      .on('error', close)
      .on('close', close);
});
await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
const monitored = new MongoClient(uri.replace(upstream.host, `127.0.0.1:${proxy.address().port}`), {
  maxPoolSize: 16,
  minPoolSize: 8,
  serverSelectionTimeoutMS: 5000,
  monitorCommands: true,
});
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

  // Cold start of a Functions instance on an already migrated database: a new repository and user store
  // make their first auth, stock and catalog reads. For a single call chain a round is a sequential wave
  // of MongoDB commands (it starts when nothing is in flight) and startupRounds is the cold call minus
  // the same call on a ready instance. Parallel chains merge into waves, so for firstRequest only the
  // time with the simulated RTT shows its critical path.
  const { mongoUsers } = await server.ssrLoadModule('/netlify/lib/barbar-users.ts');
  const token = randomBytes(32).toString('hex');
  await db.collection('users').insertOne({
    _id: 'load-owner',
    id: 'load-owner',
    username: 'load-owner',
    fullName: 'Load owner',
    email: '',
    phone: '',
    role: 'owner',
    active: true,
    createdAt: new Date().toISOString(),
    passwordHash: 'disabled',
  });
  await db.collection('sessions').insertOne({
    _id: createHash('sha256').update(token).digest('hex'),
    userId: 'load-owner',
    expiresAt: new Date(Date.now() + 3600000),
    authVersion: 0,
  });
  await mongoUsers(db).list();
  // Open the pool first: connection handshakes are not part of what the application code controls.
  await Promise.all(Array.from({ length: 8 }, () => monitored.db('admin').command({ ping: 1 })));
  let trace;
  const settle = (event) => trace?.inFlight.delete(event.requestId);
  monitored.on('commandStarted', (event) => {
    if (!trace) return;
    if (!trace.inFlight.size) trace.rounds++;
    trace.inFlight.add(event.requestId);
    const target =
      event.commandName === 'getMore' ? event.command.collection : event.command[event.commandName];
    trace.commands.push(`${event.commandName}:${typeof target === 'string' ? target : event.databaseName}`);
  });
  monitored.on('commandSucceeded', settle);
  monitored.on('commandFailed', settle);
  async function traced(fn) {
    trace = { rounds: 0, commands: [], inFlight: new Set() };
    const started = performance.now();
    try {
      await fn();
      return { rounds: trace.rounds, commands: trace.commands, ms: performance.now() - started };
    } finally {
      trace = undefined;
    }
  }
  // client.db() returns a new Db each time, so per-Db caches start empty like on a new instance.
  const freshRepo = () => mongoRepository(monitored, monitored.db(db.databaseName));
  const freshUsers = () => mongoUsers(monitored.db(db.databaseName));
  const resolved = async (users) => assert.equal((await users.resolve(token))?.id, 'load-owner');
  const coldPaths = {
    resolve: { create: freshUsers, run: resolved, ready: (users) => users.list() },
    readStock: { create: freshRepo, run: (repo) => repo.readStock(), ready: (repo) => repo.readRevision() },
    readCatalog: {
      create: freshRepo,
      run: (repo) => repo.readCatalog(),
      ready: (repo) => repo.readRevision(),
    },
    // The app's first data request on a new instance: auth, then stock and catalog requests in parallel.
    firstRequest: {
      parallel: true,
      create: () => ({ users: freshUsers(), repo: freshRepo() }),
      run: async ({ users, repo }) => {
        await resolved(users);
        await Promise.all([repo.readStock(), repo.readCatalog()]);
      },
      ready: async ({ users, repo }) => {
        await users.list();
        await repo.readRevision();
      },
    },
  };
  const coldStart = {},
    coldSamples = 9;
  const median = (list) => ms(list.map((t) => t.ms).sort((a, b) => a - b)[Math.floor(list.length / 2)]);
  for (const [name, path] of Object.entries(coldPaths)) {
    const cold = [],
      warm = [];
    for (let i = 0; i < coldSamples; i++) {
      cold.push(await traced(() => path.run(path.create())));
      const instance = path.create();
      await path.ready(instance);
      warm.push(await traced(() => path.run(instance)));
    }
    assert.ok(cold.every((t) => t.commands.length === cold[0].commands.length));
    coldStart[name] = {
      commands: cold[0].commands.length,
      migrationLookups: cold[0].commands.filter((c) => c.endsWith(':appMigrations')).length,
      ...(path.parallel ? {} : { rounds: cold[0].rounds, startupRounds: cold[0].rounds - warm[0].rounds }),
      coldP50Ms: median(cold),
      warmP50Ms: median(warm),
      startupMs: ms(median(cold) - median(warm)),
      sequence: cold[0].commands.join(' → '),
    };
  }

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
  // Card pages in the default order: the 30-day popularity window is counted once per revision.
  const cards = () =>
    handleBarApi(
      request(`/catalog/cards?resources=cocktails,alcohol&sort=popular&date=${day}`),
      repo,
      identity,
    );
  await measure('cardsPopularCold', 1, 1, async () => {
    const r = await cards();
    assert.equal(r.status, 200);
    assert.equal((await r.json()).pages.length, 2);
  });
  await measure('cardsPopularCached', 12, 4, async () => {
    assert.equal((await cards()).status, 200);
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
  // The «most sold first» window: a date range plus voided filter, grouped per product.
  const popularityPlan = await db
    .collection('sales')
    .aggregate([
      { $match: { date: { $gte: day, $lte: day }, voided: false } },
      { $group: { _id: { kind: '$kind', productId: '$productId' }, operations: { $sum: 1 } } },
    ])
    .explain('executionStats');
  const popularityStats =
    popularityPlan.stages?.[0]?.$cursor?.executionStats || popularityPlan.executionStats || {};
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
        popularityQuery: {
          examined: popularityStats.totalDocsExamined,
          keys: popularityStats.totalKeysExamined,
          stage: popularityPlan.stages?.[0]?.$cursor?.queryPlanner?.winningPlan?.inputStage?.stage,
        },
        metrics,
        coldStart: { simulatedRttMs: rtt, samples: coldSamples, ...coldStart },
        integrity: 'stock, valuation, 30 audit events and deduplicated retries verified',
      },
      null,
      2,
    ),
  );
} finally {
  await db.dropDatabase();
  await monitored.close();
  await client.close();
  await server.close();
  proxy.close();
}
