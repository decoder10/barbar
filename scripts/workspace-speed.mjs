// Speed of the working app on a phone, from opening the site to the tables board, measured locally with
// real data: a disposable copy of a local database (--source, only read), the repository's own local API
// (`server/local-api.ts` through `vite.config.ts`) connected to that copy, and the page and assets from a
// built `dist` (--dist). Nothing leaves this computer; the copy is dropped at the end.
//
//   npm run build && npm run speed:app -- [--source barbar] [--dist dist] [--runs 5] [--out file.json]
//
// `--dist` measures another build (for example the previous revision, built elsewhere) against the same
// API and data, so the numbers before and after a front-end change come from identical conditions.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { extname, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants } from 'node:zlib';
import { chromium } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { createServer, loadEnv } from 'vite';

const uri = process.env.BARBAR_TEST_MONGODB_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):/.test(uri))
  throw new Error('A local test MongoDB URI is required.');
const { values: args } = parseArgs({
  options: {
    source: { type: 'string', default: 'barbar' },
    dist: { type: 'string', default: 'dist' },
    runs: { type: 'string', default: '5' },
    out: { type: 'string' },
  },
});
const dist = resolve(args.dist);
if (!existsSync(resolve(dist, 'index.html'))) throw new Error(`Build first: ${dist}/index.html is missing`);
const runs = Number(args.runs);
// Lighthouse "slow 4G" mobile profile, as in `scripts/guest-menu-speed.mjs`.
const profile = { latency: 150, download: (1.6 * 1024 * 1024) / 8, upload: (750 * 1024) / 8, cpu: 4 };
const ready = '.tables-board .table-tile';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const source = client.db(args.source);
const copyName = `barbar_speed_${randomUUID().replaceAll('-', '')}`;
const copy = client.db(copyName);
let vite;
let server;
let browser;
try {
  const names = (await source.listCollections({ type: 'collection' }, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'));
  if (!names.includes('state')) throw new Error(`${args.source} is not a Barbar database`);
  const documents = {};
  for (const name of names) {
    const rows = await source.collection(name).find().toArray();
    documents[name] = rows.length;
    if (rows.length) await copy.collection(name).insertMany(rows);
    else await copy.createCollection(name);
    const indexes = (await source.collection(name).indexes())
      .filter((i) => i.name !== '_id_')
      .map(({ v: _v, ns: _ns, ...spec }) => spec);
    if (indexes.length) await copy.collection(name).createIndexes(indexes);
  }

  // Never the production profile of `npm run dev:production-db`: the API must use the copy.
  delete process.env.BARBAR_LOCAL_DATABASE;
  process.env.BARBAR_MONGODB_URI = uri;
  process.env.BARBAR_MONGODB_DATABASE = copyName;
  vite = await createServer({
    logLevel: 'error',
    cacheDir: '/tmp/barbar-speed-vite',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
  });
  const html = readFileSync(resolve(dist, 'index.html'));
  const files = new Map();
  const compressed = new Map();
  // Netlify: hashed assets are immutable (`netlify.toml`), text is served with Brotli.
  const send = (request, response, file, body) => {
    const type = types[extname(file)] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Cache-Control': file.includes(`${sep}assets${sep}`)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate',
    };
    if (/text|javascript|json/.test(type) && /\bbr\b/.test(request.headers['accept-encoding'] || '')) {
      if (!compressed.has(file))
        compressed.set(file, brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }));
      body = compressed.get(file);
      Object.assign(headers, { 'Content-Encoding': 'br', Vary: 'Accept-Encoding' });
    }
    response.writeHead(200, { ...headers, 'Content-Length': body.length });
    response.end(body);
  };
  server = createHttpServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (path.startsWith('/api/'))
      return vite.middlewares(request, response, () => {
        response.writeHead(404);
        response.end();
      });
    const file = resolve(dist, `.${path}`);
    if (file.startsWith(dist + sep) && extname(file) && existsSync(file)) {
      if (!files.has(file)) files.set(file, readFileSync(file));
      return send(request, response, file, files.get(file));
    }
    // Client routes (`/`, `/orders/...`) are the single page.
    send(request, response, resolve(dist, 'index.html'), html);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const environment = await (await fetch(`${origin}/api/barbar/environment`)).json();
  if (environment.database !== 'local' || environment.name !== copyName)
    throw new Error('The local API is not connected to the disposable copy');

  browser = await chromium.launch({ channel: 'chrome' });
  const env = loadEnv('development', process.cwd(), 'BARBAR_');
  const device = {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
  };
  const signIn = async (username, password) => {
    const context = await browser.newContext(device);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    const post = (path, body) =>
      page.evaluate(
        async ([path, body]) =>
          (await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }))
            .status,
        [path, JSON.stringify(body)],
      );
    const status = await post('/api/barbar/auth', { username, password });
    if (status !== 200) throw new Error(`${username} could not sign in (${status})`);
    return { post, state: await context.storageState(), close: () => context.close() };
  };
  if (!env.BARBAR_ADMIN_PASSWORD) throw new Error('BARBAR_ADMIN_PASSWORD is missing in .env');
  const owner = await signIn(env.BARBAR_ADMIN_USERNAME || 'admin', env.BARBAR_ADMIN_PASSWORD);
  // A worker's password is not stored anywhere readable: the owner adds a measurement worker to the
  // disposable copy only, through the same users API as the Team page.
  const login = { username: `speed-${randomUUID().slice(0, 8)}`, password: randomUUID() };
  const created = await owner.post('/api/barbar/users', {
    ...login,
    fullName: 'Замер скорости',
    role: 'worker',
  });
  if (created !== 201) throw new Error(`The measurement worker could not be created (${created})`);
  const worker = await signIn(login.username, login.password);
  const sessions = { owner: owner.state, worker: worker.state };
  await owner.close();
  await worker.close();
  const observe = (selector) => {
    const state = { fcp: 0, readyAt: 0 };
    window.__speed = state;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry.name === 'first-contentful-paint') state.fcp = entry.startTime;
    }).observe({ type: 'paint', buffered: true });
    const check = () => {
      if (!state.readyAt && document.querySelector(selector)) state.readyAt = performance.now();
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
  };
  // `cold`: first visit, nothing cached. `repeat`: the same phone the next time, assets from its cache.
  const measure = async (storageState, repeat) => {
    const context = await browser.newContext({ ...device, storageState });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    if (repeat) {
      await page.goto(`${origin}/`);
      await page.waitForSelector(ready, { timeout: 60000 });
      await page.waitForLoadState('networkidle');
    } else await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.download,
      uploadThroughput: profile.upload,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    await page.addInitScript(observe, ready);
    await page.goto(`${origin}/`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForSelector(ready, { timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => undefined);
    const result = await page.evaluate(() => {
      const bytes = { js: 0, css: 0, api: 0, other: 0 };
      const counts = { js: 0, api: 0 };
      let dataAt = 0;
      for (const entry of performance.getEntriesByType('resource')) {
        const path = new URL(entry.name).pathname;
        const kind = path.endsWith('.js')
          ? 'js'
          : path.endsWith('.css')
            ? 'css'
            : path.startsWith('/api/')
              ? 'api'
              : 'other';
        bytes[kind] += entry.transferSize;
        if (kind in counts) counts[kind]++;
        // The working snapshot: stock and both catalog halves.
        if (/^\/api\/barbar(\/catalog\/(alcohol|cocktails))?$/.test(path))
          dataAt = Math.max(dataAt, entry.responseEnd);
      }
      return { fcp: window.__speed.fcp, tables: window.__speed.readyAt, dataAt, bytes, counts };
    });
    await context.close();
    return { ...result, errors };
  };
  const median = (values) => {
    const sorted = values.filter((v) => typeof v === 'number' && v > 0).sort((a, b) => a - b);
    return sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null;
  };
  const summary = (samples) => ({
    medianMs: {
      fcp: median(samples.map((s) => s.fcp)),
      dataLoaded: median(samples.map((s) => s.dataAt)),
      tablesBoard: median(samples.map((s) => s.tables)),
      afterData: median(samples.map((s) => s.tables - s.dataAt)),
    },
    samplesMs: samples.map((s) => Math.round(s.tables)),
    transferKb: Object.fromEntries(
      Object.keys(samples[0].bytes).map((k) => [
        k,
        Math.round(median(samples.map((s) => s.bytes[k])) / 102.4) / 10,
      ]),
    ),
    requests: samples[0].counts,
    consoleErrors: [...new Set(samples.flatMap((s) => s.errors))],
  });
  const report = {
    dist,
    source: `local database ${args.source} (read only), copied to a disposable database`,
    documents,
    profile: { viewport: '390x844', ...profile, download: '1.6 Mbit/s', upload: '750 kbit/s', runs },
    ready,
  };
  for (const role of ['owner', 'worker']) {
    report[role] = {};
    for (const mode of ['cold', 'repeat']) {
      const samples = [];
      for (let i = 0; i < runs; i++) samples.push(await measure(sessions[role], mode === 'repeat'));
      report[role][mode] = summary(samples);
    }
  }
  console.log(JSON.stringify(report, null, 2));
  if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n');
} finally {
  await browser?.close();
  await new Promise((done) => (server ? server.close(done) : done()));
  await vite?.close();
  await copy.dropDatabase();
  await client.close();
}
// The local API plugin keeps its own MongoDB pool for the lifetime of a dev server; nothing else is pending.
process.exit();
