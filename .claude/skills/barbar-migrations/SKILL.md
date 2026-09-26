---
name: barbar-migrations
description: Add or change Barbar Cafe MongoDB migrations (indexes, catalog data steps) so existing data survives. Use when a collection, index or stored shape changes.
---

Read `docs/database-migrations.md` first; it is the source of truth for the rules and the verification table.

- Migrations are `appMigrations` markers. Steps are declared in `netlify/lib/database/registry.ts` (schema/index steps first, then data steps) and executed by `netlify/lib/database/migrations.ts`. A marker key, once shipped, is never renamed, reordered or reused: a database that already holds it will not rerun the step.
- To change something that already shipped, add a new step with a new dated key (e.g. `2026-09-25-price-history-indexes`). Index steps are additive; data steps must be insert-only or remove only unreferenced items.
- Guard shipped keys in `netlify/lib/database/migrations.test.ts`: the registry test compares `shippedSchema` and `shippedData` with the registry by order and needs no database, so it also runs in plain `npm test`. Add each new key there. Never edit `previousRelease` (the six keys of the pre-registry version): the "previous version" test loads only those markers and expects exactly the new steps to run.
- Update the step list and the verification table in `docs/database-migrations.md` in the same change; take numbers only from saved JSON in `docs/perf/` (`*-migrate-check-*.json`).
- Verify with a local rs0 MongoDB (`npm run db:start`), never Atlas: `BARBAR_TEST_MONGODB_URI=... npx vitest run netlify/lib/database/migrations.test.ts` (or `npm run test:db`), and `npm run db:migrate:check`, which restores a copy and checks steps run, marker reads and that data is unchanged. Plain `npm test` skips the database cases; say so when they were not run.
- A new Mongo-backed test file must be added to the `test:db` list in `package.json`.
