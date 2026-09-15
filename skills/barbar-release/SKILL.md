---
name: barbar-release
description: Verify and release authorized Barbar Cafe changes to its Git repository and Netlify, with concrete checks and preservation of live data.
---

- Inspect the working tree and current branch; honor the user's authorized destination. Skill use alone does not authorize a push or deployment.
- Run `npm run check`, `npm run build` and relevant Playwright scenarios. For persistence changes, run `test:db` against a separate local MongoDB test database. Use `scripts/benchmark.mjs` for comparable synthetic inventory measurements.
- Never commit `.env`, credentials, local ledger files or test artifacts. Bootstrap secrets are server environment variables.
- Verify catalog/photo edits preserve existing IDs and recipes. Do not reset production or local business data to make a test pass.
- Netlify uses `netlify.toml` and Functions. Confirm the deployed commit or changed build assets after an authorized push; an HTTP 200 response alone does not prove the new release is live.
- Check the deployed login page and anonymous API behavior without creating production test sales. Report cloud settings that cannot be verified, including backup and network configuration, as unverified.
- Update release notes with actual checks, material limitations and any user action needed. Do not describe incomplete work as finished.
- Before a release also run `npm run test:backup` and `npm run test:scheduled-backup`. Report storage with `npm run db:storage` when Atlas access is available, and latency with `npm run probe:latency` after publishing (anonymous GETs only).
- One-time catalog migrations run on the first API request after deploy; mention them in release notes. `dev:production-db` (port 4002) is never used for tests.
