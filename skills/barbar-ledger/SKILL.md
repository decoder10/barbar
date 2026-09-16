---
name: barbar-ledger
description: Modify Barbar Cafe inventory, recipes, sales, MongoDB persistence or user permissions while preserving its accounting and role contracts. Applies only to the Barbar Cafe project.
---

Work from the repository root. Read `docs/architecture.md` when locating modules.

- Accounting and saved prices use AMD. Display conversion belongs in presentation code, never in ledger mutations.
- The business day begins at 06:00 Asia/Yerevan. Preserve existing historical dates; use the shared business-day functions for new sales.
- Bottle quantity, bottle size and glass serving size are distinct. A glass sale records its chosen ml and immutable ingredient/cost snapshot. Cancellation reverses that snapshot.
- `domain/model.ts` validates commands; `netlify/lib/barbar-handler.ts` enforces role permissions before repository writes. UI visibility is not authorization.
- Workers receive only `barbar-access.ts` allowlisted data. Selling prices and saved sale revenues are allowed in Sales and its daily summary. Never expose costs, purchase prices, profit, report totals or full ledger objects. They can edit recipes, but cannot change stock, purchases or financial fields.
- Keep command IDs stable on retries. MongoDB transactions and revision checks prevent double sales and lost updates.
- Existing user identities, custom catalog entries and recipes take precedence over bootstrap defaults. Image changes must not reseed data.
- Test ledger changes in an isolated database. `test:db` creates disposable databases; verify their names before adding cleanup code. Do not use production sales as test fixtures.
- Stock `category` drives accounting (`mixer`/`food` are recipe ingredients, `goods` are sold whole); the product `group` (fruit, snacks, soft drinks…) only organises tabs and ingredient pickers. Keep one physical product as one stock item.
- Goods link to one menu item: each sale deducts `saleAmount` in the item's unit (1 bottle/pc, or grams/ml); `pricePerLiter` of goods is the price of one sale. Bottled goods with `bottleSizeMl` enter recipes in ml as a share of one piece.
- Sets store `components` (tinctures × shots); a set sale expands the tincture recipes and their extra costs. A tincture used in a set keeps its category.
- Catalog upgrades run once per database (`appMigrations`) and must be insert-only or remove only items without purchases, movements, resets, sales, balances or recipe references. Bump the key when the definition changes; never run them for `dev:production-db`.
- Purchase notifications are written in the purchase transaction (`purchaseEvents`, ID = command ID) and delivered to active owners only.
- `GET /api/barbar/catalog/cards` accepts `resources=cocktails,alcohol` (≤2, unique) through `parseCardQueries`; the response is `{ pages, catalogRevision, revision, role }`, stock and the popularity window are read once. Single-resource requests keep the flat shape.
- History pages: `total` and `groups` ride with the first page only; a cursor page is one indexed find and the client keeps the loaded totals (`use-history.ts`). `salesPopularity(from, to)` counts a window of `presets.popularityDays` business days.
- `GET /api/barbar/notifications` (`netlify/lib/notifications/feed.ts`) lists TTL-bound queued events, newest first: owners get purchases and stock, workers stock only. It is a recent feed, not a history.
- Report aggregations run sequentially inside one snapshot transaction on purpose: a MongoDB driver session is not safe for concurrent operations. Do not "parallelise" them inside the session.
- Every public function declares a Netlify `rateLimit` (including `/api/menu` and `/api/barbar/push`); `netlify.toml` sends HSTS. Sale, `createCocktail` and `updateRecipe` pick fields explicitly on the server — keep it that way for any new worker command.
- Server transport lives in `netlify/lib/barbar-handler.ts` (auth, method, origin, route choice) and `netlify/lib/http.ts` (`HttpError`, `respondError`); the work is in `netlify/lib/routes/{cards,catalog,working,commands}.ts`. New routes get their own module and throw `HttpError` for user-facing failures. `salesPopularity` is cached per revision through `queries/cache.ts` — do not add a second cache in front of it.
