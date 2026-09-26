// Checks that the migration registry keeps existing data. It copies a local database (--source) or builds a
// synthetic ledger, runs the registry the way new Functions instances do (one cold start, another one, then
// three at once) and compares document counts and content hashes. The source database is only read; the
// copy and the synthetic ledger are disposable databases dropped at the end.
//
//   npm run db:migrate:check                                   synthetic ledger, markers as in production
//   npm run db:migrate:check -- --source barbar_copy_x         a local copy, markers as it has them
//   npm run db:migrate:check -- --without-markers              as after db:restore: every step runs again
//   npm run db:migrate:check -- --out docs/perf/result.json
import { createServer } from 'vite';
import { BSON, MongoClient } from 'mongodb';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

const uri = process.env.BARBAR_TEST_MONGODB_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(uri))
  throw new Error('A local test MongoDB URI is required.');
const { values: args } = parseArgs({
  options: {
    source: { type: 'string' },
    'without-markers': { type: 'boolean', default: false },
    sales: { type: 'string', default: '20000' },
    out: { type: 'string' },
  },
});
const id = randomUUID().replaceAll('-', '');
const checkName = `barbar_migrate_check_${id}`;
const syntheticName = `barbar_migrate_source_${id}`;
const disposable = (name) => /^barbar_migrate_(check|source)_[a-f0-9]{32}$/.test(name);

// Ledger and identity documents never change. Catalog steps may add, relink or remove unused catalog rows,
// but only in a run that actually executes a data migration.
const strict = [
  'orders',
  'tables',
  'sales',
  'purchases',
  'users',
  'sessions',
  'stockMovements',
  'stockResets',
  'expenses',
  'shifts',
  'suppliers',
  'priceChanges',
];
const catalog = ['alcohol', 'cocktails', 'stockBalances'];
const checked = [...strict, ...catalog];

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, monitorCommands: true });
const server = await createServer({
  configFile: false,
  cacheDir: '/tmp/barbar-migrate-check-vite',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: 'custom',
});
const created = [];
let failed = false;
try {
  const { mongoRepository } = await server.ssrLoadModule('/netlify/lib/barbar-mongo.ts');
  const { registry, dataMigrations } = await server.ssrLoadModule('/netlify/lib/database/registry.ts');
  const { runMigrations } = await server.ssrLoadModule('/netlify/lib/database/migrations.ts');
  const { applyCommand, initialData } = await server.ssrLoadModule('/src/barbar/domain/model.ts');
  await client.connect();

  async function synthetic() {
    const db = client.db(syntheticName);
    created.push(syntheticName);
    const commands = [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `table-${i}`,
        type: 'saveTable',
        value: { id: `table-${i}`, name: String(i + 1), order: i, active: true },
      })),
      {
        id: 'purchase',
        type: 'purchase',
        value: { id: 'purchase', alcoholId: 'vodka', date: '2026-09-01', ml: 100000, costPerLiter: 4000 },
      },
      {
        id: 'sale',
        type: 'sale',
        value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-02' },
      },
    ];
    const data = commands.reduce((next, command) => applyCommand(next, command), initialData());
    await mongoRepository(client, db, async () => data).read();
    // Bulk history at the storage level, as a restored backup has it.
    const template = await db.collection('sales').findOne({}, { projection: { _id: 0 } });
    const sales = Number(args.sales);
    for (let i = 0; i < sales; i += 1000)
      await db.collection('sales').insertMany(
        Array.from({ length: Math.min(1000, sales - i) }, (_, j) => {
          const n = i + j;
          return {
            ...template,
            _id: `synthetic-sale-${n}`,
            id: `synthetic-sale-${n}`,
            date: `2026-09-${String(1 + (n % 28)).padStart(2, '0')}`,
            createdAt: new Date(Date.UTC(2026, 8, 1) + n * 60000).toISOString(),
            _order: n + 1,
            ...(n % 10 === 0 ? { orderId: `synthetic-order-${n / 10}` } : {}),
          };
        }),
      );
    await db.collection('orders').insertMany(
      Array.from({ length: Math.ceil(sales / 10) }, (_, n) => ({
        _id: `synthetic-order-${n}`,
        id: `synthetic-order-${n}`,
        tableId: `table-${n % 12}`,
        status: n % 7 === 0 ? 'open' : 'paid',
        businessDay: `2026-09-${String(1 + (n % 28)).padStart(2, '0')}`,
        openedAt: new Date(Date.UTC(2026, 8, 1) + n * 600000).toISOString(),
        openedBy: { id: 'owner', name: 'Owner' },
        total: 900,
        _order: n,
      })),
    );
    await db.collection('users').insertMany(
      ['owner', 'worker'].map((role) => ({
        _id: role,
        id: role,
        username: role,
        fullName: role,
        email: '',
        phone: '',
        role,
        active: true,
        createdAt: '2026-09-01T00:00:00.000Z',
        passwordHash: 'disabled',
      })),
    );
    await db.collection('sessions').insertOne({
      _id: createHash('sha256').update(randomBytes(32)).digest('hex'),
      userId: 'owner',
      expiresAt: new Date(Date.now() + 86400000),
      authVersion: 0,
    });
    return db;
  }

  async function copy(source, target) {
    const names = (await source.listCollections({ type: 'collection' }, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((n) => !n.startsWith('system.') && !(args['without-markers'] && n === 'appMigrations'));
    for (const name of names) {
      const rows = source.collection(name).find();
      let batch = [];
      for await (const row of rows) {
        batch.push(row);
        if (batch.length === 1000) {
          await target.collection(name).insertMany(batch);
          batch = [];
        }
      }
      if (batch.length) await target.collection(name).insertMany(batch);
      else
        await target
          .createCollection(name)
          .catch((error) => (error.code === 48 ? null : Promise.reject(error)));
      // TTL indexes are left out: expiring sessions or queue rows would change the copy during the check.
      const indexes = (await source.collection(name).indexes())
        .filter((i) => i.name !== '_id_' && i.expireAfterSeconds === undefined)
        .map(({ v: _v, ns: _ns, ...spec }) => spec);
      if (indexes.length) await target.collection(name).createIndexes(indexes);
    }
  }

  async function snapshot(db) {
    const result = {};
    for (const name of checked) {
      const total = createHash('sha256'),
        docs = new Map();
      for await (const row of db.collection(name).find().sort({ _id: 1 })) {
        const json = BSON.EJSON.stringify(row, { relaxed: false });
        total.update(json).update('\n');
        docs.set(BSON.EJSON.stringify(row._id), createHash('sha256').update(json).digest('hex'));
      }
      result[name] = { count: docs.size, hash: total.digest('hex'), docs };
    }
    const markers = await db.collection('appMigrations').find().sort({ _id: 1 }).toArray();
    return { collections: result, markers };
  }
  const diff = (before, after) => {
    let removed = 0,
      changed = 0;
    for (const [key, hash] of before.docs)
      if (!after.docs.has(key)) removed++;
      else if (after.docs.get(key) !== hash) changed++;
    return { removed, changed, added: [...after.docs.keys()].filter((k) => !before.docs.has(k)).length };
  };
  const summary = (state) =>
    Object.fromEntries(
      Object.entries(state.collections).map(([name, { count, hash }]) => [
        name,
        { count, hash: hash.slice(0, 16) },
      ]),
    );

  let lookups = 0;
  client.on('commandStarted', (event) => {
    if (event.databaseName === checkName && event.command.find === 'appMigrations') lookups++;
  });
  // A new Db handle and repository are a new Functions instance; the ledger must never be imported again.
  const coldStart = async () => {
    const handle = client.db(checkName);
    await mongoRepository(client, handle, async () => {
      throw new Error('The copy has no ledger state: refusing to import seed data');
    }).readRevision();
    await runMigrations(handle, registry);
  };
  async function phase(name, run) {
    lookups = 0;
    const started = performance.now();
    await run();
    return {
      name,
      ms: Math.round(performance.now() - started),
      markerReads: lookups,
      state: await snapshot(target),
    };
  }

  const source = args.source ? client.db(args.source) : await synthetic();
  if (!(await source.collection('state').findOne({ _id: 'state' })))
    throw new Error(`${source.databaseName} has no ledger state`);
  const target = client.db(checkName);
  created.push(checkName);
  await copy(source, target);
  const baseline = await snapshot(target);
  const phases = [
    await phase('first cold start', coldStart),
    await phase('second cold start', coldStart),
    await phase('three concurrent cold starts', () => Promise.all([coldStart(), coldStart(), coldStart()])),
  ];
  const [first] = phases;
  const ranIds = first.state.markers
    .map((m) => m._id)
    .filter((m) => !baseline.markers.some((b) => b._id === m));
  const dataRan = ranIds.some((m) => dataMigrations.some((d) => d.id === m));
  const problems = [];
  const changes = {};
  for (const name of checked) {
    const change = diff(baseline.collections[name], first.state.collections[name]);
    if (change.removed || change.changed || change.added) changes[name] = change;
    if (
      (strict.includes(name) || !dataRan) &&
      first.state.collections[name].hash !== baseline.collections[name].hash
    )
      problems.push(`${name} changed in the first cold start: ${JSON.stringify(change)}`);
    for (const later of phases.slice(1))
      if (later.state.collections[name].hash !== first.state.collections[name].hash)
        problems.push(`${name} changed in "${later.name}"`);
  }
  for (const later of phases.slice(1))
    if (BSON.EJSON.stringify(later.state.markers) !== BSON.EJSON.stringify(first.state.markers))
      problems.push(`migration markers changed in "${later.name}"`);
  const missing = registry.map((m) => m.id).filter((m) => !first.state.markers.some((b) => b._id === m));
  if (missing.length)
    problems.push(`steps without a marker after the first cold start: ${missing.join(', ')}`);
  const result = {
    source: args.source
      ? `local database ${args.source} (read only)`
      : `synthetic ledger, ${args.sales} sales`,
    markers: args['without-markers'] ? 'removed, as after db:restore' : 'copied from the source',
    baseline: summary(baseline),
    stepsRun: first.state.markers
      .filter((m) => ranIds.includes(m._id))
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((m) => ({ id: m._id, durationMs: m.durationMs })),
    firstRunChanges: changes,
    phases: phases.map((p) => ({
      name: p.name,
      ms: p.ms,
      markerReads: p.markerReads,
      changedSinceBaseline: checked.filter(
        (name) => p.state.collections[name].hash !== baseline.collections[name].hash,
      ),
    })),
    verdict: problems.length ? 'FAILED' : 'passed',
    problems,
  };
  failed = problems.length > 0;
  const text = JSON.stringify(result, null, 2);
  console.log(text);
  if (args.out) await writeFile(args.out, text + '\n');
} finally {
  for (const name of created) if (disposable(name)) await client.db(name).dropDatabase();
  await client.close();
  await server.close();
}
if (failed) process.exit(1);
