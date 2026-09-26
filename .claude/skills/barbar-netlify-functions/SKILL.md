---
name: barbar-netlify-functions
description: Diagnose and change Barbar Cafe Netlify Functions (`netlify/functions`), especially the server-rendered `/menu` page: how Netlify bundles them, why a function can fail before its handler runs, how to reproduce that locally and what a guest must never receive. Use for any 5xx from a function or a change to function imports.
---

## How Netlify builds these functions
- Every function here is a v2 function (default export + `config`). For v2 Netlify ignores `node_bundler = "esbuild"` and always uses the **nft** bundler: the function's own code (including everything under `src/` it imports) is bundled by esbuild into one `netlify/functions/<name>.mjs`, while packages from `node_modules` (`react`, `react-dom/server`, `lucide-react`, `mongodb`) stay **external** and are copied file by file by node-file-trace.
- A dynamic `import()` of a local module is inlined into that single file, so its package imports are hoisted to the top level of the bundle. Only a dynamic import with a non-literal specifier (a runtime `new URL(...).href`) stays a real runtime import.
- A failure while the bundle's top-level imports load happens before the handler and before any `try/catch` in it: Netlify answers **HTTP 500, empty body, `Content-Type: text/plain`** and nothing of the function's own logging runs. `/api/menu` sharing `guest-repository` and `mongodb` proves those parts; anything else in the failing function's import graph is suspect.

## Telling "not deployed" from "handler never runs"
- Asset hashes in `index.html`/`menu.html` only change when `src/` changes. A commit that touches only `netlify/` or `docs/` produces the same hashes, so hashes cannot show whether such a deploy is live.
- `POST /menu` (or any route) returning the handler's own 405 proves the handler runs; a 500 on POST means module initialisation or bootstrap failed.
- Function logs are only in the Netlify panel: Site → Logs → Functions → `barbar-menu-page`. `netlify/lib/observability.ts` writes one JSON line per request (`barbar.api`) and one per caught failure (`barbar.error` with `stage`, `message`, first stack lines; never bodies, cookies or guest data). Without CLI login or a token nothing can be read from this machine.

## Reproducing locally
- Netlify's own bundler: install `@netlify/zip-it-and-ship-it` in a scratch dir and call `zipFunctions(['netlify/functions'], out, { basePath, archiveFormat: 'none', config: { '*': { nodeBundler: 'esbuild', nodeVersion: '22' } }, configFileDirectories: [basePath] })`. Then grep `^import` in `out/<name>/netlify/functions/<name>.mjs` for top-level package imports and run the file in Docker `node:22` (Linux, the Lambda runtime), also with `NODE_ENV=production`.
- `npx netlify-cli@latest dev --offline --dir dist --functions netlify/functions` runs the real Netlify bootstrap without login; use a worktree without `.env` so no database is touched.
- Both reproductions can pass while production fails: the trace copied on Netlify's Linux build is not the local one. Then the only evidence is the panel log.

## The guest page `/menu`
- Rendered by `netlify/functions/barbar-menu-page.ts` → `netlify/lib/guest-menu-entry.ts` → `netlify/lib/guest-menu-page.tsx` (React `renderToString` of `GuestMenu`). The built `menu.html` is the template and the fallback: on any failure the guest gets the built page with `Cache-Control: no-store` (the browser then loads the menu from `/api/menu` as before server rendering), and the error is logged.
- Every response a guest can see must be `text/html`. Mobile and in-app browsers (a QR link opened from a messenger) save a `text/plain` answer as a `.txt` download instead of showing it; this is what the empty 500 looked like on phones.
- History: `/menu` returned 500 from the first server-rendered release (1438c29, 25 Sep 2026) until 26 Sep 2026; see `docs/release-2026-09-26-guest-menu-500.md` for the fix and what was verified.
