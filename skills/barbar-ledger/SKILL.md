---
name: barbar-ledger
description: Modify Barbar Cafe inventory, recipes, sales, MongoDB persistence or user permissions while preserving its accounting and role contracts. Applies only to the Barbar Cafe project.
---

Work from the repository root. Read `docs/architecture.md` when locating modules.

- Accounting and saved prices use AMD. Display conversion belongs in presentation code, never in ledger mutations.
- The business day begins at 06:00 Asia/Yerevan. Preserve existing historical dates; use the shared business-day functions for new sales.
- Bottle quantity, bottle size and glass serving size are distinct. A glass sale records its chosen ml and immutable ingredient/cost snapshot. Cancellation reverses that snapshot.
- `domain/model.ts` validates commands; `netlify/lib/barbar-handler.ts` enforces role permissions before repository writes. UI visibility is not authorization.
- Workers receive only `barbar-access.ts` allowlisted data. Never add prices, costs, revenues, report totals or full ledger objects to their response. They can edit recipes, but cannot change stock, purchases or financial fields.
- Keep command IDs stable on retries. MongoDB transactions and revision checks prevent double sales and lost updates.
- Existing user identities, custom catalog entries and recipes take precedence over bootstrap defaults. Image changes must not reseed data.
- Test ledger changes in an isolated database. `test:db` creates disposable databases; verify their names before adding cleanup code. Do not use production sales as test fixtures.
