---
name: barbar-netlify-functions
description: Diagnose and change Barbar Cafe Netlify Functions (`netlify/functions`), especially the server-rendered `/menu` page: how Netlify bundles and routes them, why `/menu` answered an empty 500 for a day, how to read function and deploy logs and test with draft deploys. Use for any 5xx from a function, a new function path or a change to function imports.
---

## The `/menu` 500 (25–26 Sep 2026) and its rule
- Symptom: `GET /menu` → HTTP 500, empty body, `Content-Type: text/plain`, in ~0.4 s; `POST /menu` also 500 (the handler's own 405 never appeared). On phones the text/plain answer was saved as a `.txt` download. `/api/menu`, `/menu.html` and `/` worked.
- Cause: Netlify's routing fails **before the function is invoked** when a v2 function's `config.path` equals a static page `<path>.html` in the publish dir (`/menu` ↔ `dist/menu.html`, and a test function on `/index` ↔ `index.html` failed the same way). The function never logs a line. `rateLimit`, the function code, bundling and `pretty_urls` are irrelevant (all bisected with draft deploys).
- Fix: the guest template is built as `guest-menu.html`; the public URL stays `/menu` (printed QR codes use `/menu?table=<code>`). **Rule:** a function path must never coincide with a static file `<path>.html` or `<path>/index.html`; a unit test in `netlify/lib` guards it. Details and verification: `docs/release-2026-09-26-guest-menu-500.md`.
- Wrong leads that cost hours: module-initialisation failures (lazy `import()` cannot isolate packages anyway, see below), Node version, Linux vs macOS, `NODE_ENV`. Check routing first: is the function invoked at all (`netlify logs`)?

## Reading the truth: Netlify CLI
- Login once: `npx netlify-cli login` (the owner runs it; the folder is linked to site `barbar-cafe`, `.netlify/` is git-ignored; if unlinked: `npx netlify-cli link --id cfac3277-bc99-4e70-9f96-eb8882da8620`).
- Function logs: `npx netlify-cli logs --source functions --function barbar-menu-page --since 30m` (`--deploy-id <id>` for one deploy). `netlify/lib/observability.ts` writes one JSON line per request (`barbar.api`) and one per caught failure (`barbar.error` with `stage`, `message`, first stack lines; never bodies, cookies or guest data). **No lines at all while requests arrive = the request never reaches the function.**
- Deploys and build logs: `npx netlify-cli api listSiteDeploys --data '{"site_id":"cfac3277-bc99-4e70-9f96-eb8882da8620","per_page":6}'` (state, commit, id), then `npx netlify-cli logs --source deploy --deploy-id <id> --since 6h`. "Too many rules defined, max for your account tier is 2" appears in every deploy and is harmless.
- Asset hashes only change when `src/` changes; a commit touching only `netlify/` or `docs/` cannot be recognised by hashes. Use the deploy list.
- A function's own error gives **502**; the empty **500** comes from routing.

## Draft deploys: bisect without touching production
- `npx netlify-cli deploy --no-build --dir dist --functions netlify/functions --site cfac3277-bc99-4e70-9f96-eb8882da8620 --message "draft: <label>" --json` publishes a draft URL (`deploy_url` in the JSON) and leaves production alone. **Never pass `--prod`.** Without `--no-build` the CLI runs `npm run build` first and recreates every file in `dist`, which silently undid a "remove menu.html" experiment.
- Work in a scratch worktree (`git worktree add --detach <dir> <commit>`, symlink `node_modules`), replace the function with a trivial `export default () => new Response('ok')` keeping the same `config`, then vary one thing per deploy (path, config, files). Each draft takes about 30 s.
- In zsh never name a shell variable `path`: it is bound to `PATH` and every command disappears.
- Draft functions may 502 for other reasons (environment); a change from 500 to anything else already proves the routing point.

## How Netlify builds these functions
- Every function here is v2 (default export + `config`). For v2 Netlify ignores `node_bundler = "esbuild"` and uses **nft**: the function's own code (including everything under `src/` it imports) is bundled by esbuild into one `netlify/functions/<name>.mjs`; packages (`react`, `react-dom/server`, `lucide-react`, `mongodb`) stay external and are copied file by file.
- A dynamic `import()` of a local module is inlined, so its package imports are hoisted to the top level. Only a dynamic import with a runtime-computed specifier stays a real import: that is why the `/menu` renderer is pre-built by `scripts/build-menu-renderer.mjs` into `netlify/generated/guest-menu-renderer.mjs` (React bundled in, shipped via `included_files`) and loaded at request time; a renderer failure is logged and the guest gets the built template.
- Reproduce a bundle locally: install `@netlify/zip-it-and-ship-it` in a scratch dir, call `zipFunctions(['netlify/functions'], out, { basePath, archiveFormat: 'none', config: { '*': { nodeBundler: 'esbuild', nodeVersion: '22' } }, configFileDirectories: [basePath] })`, grep `^import` in the output and run it in Docker `node:22`. `npx netlify-cli dev --offline --dir dist --functions netlify/functions` runs the real bootstrap without login (use a worktree without `.env`).

## The guest page `/menu`
- `netlify/functions/barbar-menu-page.ts` → `netlify/lib/guest-menu-entry.ts` → renderer (`netlify/lib/guest-menu-page.tsx`, React `renderToString` of `GuestMenu`). Template and fallback: the built `guest-menu.html`; on any failure the guest gets it with `Cache-Control: no-store` and the error is logged.
- Every response a guest can see must be `text/html`; mobile and in-app browsers save `text/plain` as a file.
- Proof that the function runs: `POST /menu` → 405 (from the handler) and a `barbar.api` line in the log.
