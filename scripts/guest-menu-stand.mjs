// Local stand for the public guest menu: a built `dist`, `/api/menu` and the rendered `/menu` from the
// repository's own handlers, and an in-memory catalog. No database, network or live site is involved.
// Used by `scripts/guest-menu-speed.mjs` and `tests/guest-menu-ssr.spec.ts`.
import { createServer as createHttpServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { createServer } from 'vite';

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
};

export async function startGuestMenuStand({ root = process.cwd(), dist = 'dist', photos } = {}) {
  root = resolve(root);
  dist = resolve(root, dist);
  if (!existsSync(resolve(dist, 'guest-menu.html')))
    throw new Error(`Build first: ${dist}/guest-menu.html is missing`);
  const vite = await createServer({
    root,
    configFile: false,
    cacheDir: '/tmp/barbar-stand-vite',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
  });
  const load = (file) => (existsSync(resolve(root, file.slice(1))) ? vite.ssrLoadModule(file) : undefined);
  const { initialData } = await vite.ssrLoadModule('/src/barbar/domain/model.ts');
  const { handleGuestMenu } = await vite.ssrLoadModule('/netlify/lib/guest-menu-handler.ts');
  // Absent in revisions before server rendering and owner photos: the stand then serves the static page.
  const page = await load('/netlify/lib/guest-menu-page.tsx');
  const photoFiles = photos && (await load('/netlify/lib/photos/serve.ts'));
  const photoStore = photos && (await load('/netlify/lib/photos/store.ts'));
  const state = { data: initialData(), revision: 1 };
  // The page and the API may be given different catalogs, to see the browser replace server prices.
  const catalog = { page: undefined, api: undefined };
  const repository = (kind) => ({
    readCatalog: async () => {
      const data = catalog[kind] || state.data;
      return { catalogRevision: `stand-${kind}-${catalog[kind] ? 'own' : state.revision}`, data };
    },
  });
  const template = readFileSync(resolve(dist, 'guest-menu.html'), 'utf8');
  const compressed = new WeakMap();
  const send = (response, status, body, headers, acceptEncoding) => {
    // Headers of a function `Response` arrive in lower case, those of static files as written here.
    const type = headers['Content-Type'] || headers['content-type'] || '';
    // Netlify compresses text with Brotli; images and fonts are already compressed.
    if (/text|javascript|json|svg/.test(type) && /\bbr\b/.test(acceptEncoding || '') && body.length > 1024) {
      let value = compressed.get(body);
      if (!value) {
        value = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
        compressed.set(body, value);
      }
      headers = { ...headers, 'Content-Encoding': 'br', Vary: 'Accept-Encoding' };
      body = value;
    }
    response.writeHead(status, { ...headers, 'Content-Length': body.length });
    response.end(body);
  };
  const files = new Map();
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const headers = new Headers(
      Object.entries(request.headers).flatMap(([key, value]) => (value ? [[key, String(value)]] : [])),
    );
    const input = new Request(url, { method: request.method, headers });
    const encoding = request.headers['accept-encoding'];
    try {
      let result;
      if (url.pathname === '/api/menu') result = await handleGuestMenu(input, repository('api'));
      else if ((url.pathname === '/menu' || url.pathname === '/menu/') && page)
        result = await page.handleGuestMenuPage(input, repository('page'), async () => template, 'stand');
      else if (url.pathname.startsWith('/api/photos/') && photoFiles)
        result = await photoFiles.handlePhotoFile(input, photoStore.folderPhotoFiles(photos));
      if (result) {
        const body = Buffer.from(await result.arrayBuffer());
        send(response, result.status, body, Object.fromEntries(result.headers), encoding);
        return;
      }
      const path = url.pathname === '/menu' || url.pathname === '/menu/' ? '/guest-menu.html' : url.pathname;
      const file = resolve(dist, `.${decodeURIComponent(path)}`);
      if (!file.startsWith(dist + sep) || !existsSync(file)) {
        send(response, 404, Buffer.from('Not found'), { 'Content-Type': 'text/plain' }, encoding);
        return;
      }
      if (!files.has(file)) files.set(file, readFileSync(file));
      send(
        response,
        200,
        files.get(file),
        { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' },
        encoding,
      );
    } catch (error) {
      send(response, 500, Buffer.from(String(error)), { 'Content-Type': 'text/plain' }, encoding);
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    serverRendering: !!page,
    /** The shared catalog; call `changed()` after editing it so both routes see a new revision. */
    data: state.data,
    changed: () => state.revision++,
    /** Serve a different catalog to the page render or to `/api/menu` only (undefined to share). */
    use: (kind, data) => {
      catalog[kind] = data;
    },
    close: async () => {
      await new Promise((done) => server.close(done));
      await vite.close();
    },
  };
}
