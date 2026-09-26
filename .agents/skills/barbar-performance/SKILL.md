---
name: barbar-performance
description: Measure and change Barbar Cafe speed (guest menu LCP, first-screen bundle, database hot paths) with before/after evidence, and avoid time-of-day flaky tests. Use for optimisation work.
---

The report `docs/performance-2026-09-25.md` and raw JSON in `docs/perf/` show how earlier work was measured; every figure in a report must exist in a saved JSON file.

## Measuring
- Guest menu: `npm run speed:menu -- --runs 5 --out docs/perf/<name>.json` (`scripts/guest-menu-speed.mjs`, `--root <dir>` for another build, `--locale` default en-US; run ru-RU too, it differs). Workspace: `npm run speed:app`. First screen size: `npm run perf:bundle`. Database: `npm run test:load`, `npm run benchmark`.
- Baseline: `git archive <commit>` into a temp dir with `node_modules` symlinked, `npm run build`, then alternate baseline and variants in one session, two rounds. Differences of about 20 ms are within round-to-round spread: say "at the before level", not "better". Delete the temp dirs afterwards.
- Record rejected variants with numbers, not only the accepted one.

## Guest menu findings
- The LCP element is the photo of the first card. Card photos are lazy by default; the first two cards of the first section load `eager` with `fetchpriority="high"` through the `priority` prop of `CatalogImage` (`priorityCards` in `GuestMenu.tsx`). `priority` must not change `sizes` (unlike the logo's `eager`). The flag depends only on card index, so server markup and hydration match.
- `netlify/lib/guest-menu-page.test.ts` checks the server HTML (first cards high priority and not lazy, later cards lazy). React writes the attribute as `fetchPriority`, so match case-insensitively.
- Splitting the photo catalog into small chunks made `/menu` preload more files and delayed LCP; the priority fix recovered it. Prioritising one photo measured no better than two.

## Tests that depend on the clock
The business day is 06:00–05:59 Asia/Yerevan. In tests use `businessToday()`, not `today()`, for purchase and sale dates: `resetStock` dates by the business day, so `today()` breaks between 00:00 and 06:00 Yerevan (fixed in `glass-volume.test.ts` and `bottles.test.ts`). Check such tests with a shifted clock.
