---
name: barbar-interface
description: Maintain Barbar Cafe responsive screens, role-specific controls, localized presentation, themes and catalog photography. Applies only to the Barbar Cafe interface.
---

Read `docs/architecture.md` for the current feature and style boundaries.

- Reuse `ui` primitives and feature components. Pages compose workflows; pure calculations belong in `domain`.
- SCSS uses `styles/index.scss`, semantic CSS variables in `_tokens.scss` and shared mixins. Check both themes, compact screens and long Armenian labels. Keep photos contained and stable on hover.
- Language defaults to Russian; theme defaults to light; display currency defaults to AMD. User preferences persist through the authenticated profile API.
- Translate presentation text only. Do not translate identifiers, form option values, API commands, stored product names or destructive confirmation tokens.
- Use indexed inventory calculations for repeated card rendering; avoid rescanning sale history in every card.
- Distinguish actual product packaging from illustrative serving images. Named bottle placeholders are acceptable when a verified product image is unavailable. Never represent an AI illustration as a photo of the bar's actual serving.
- Store photos locally and record source/attribution in `public/barbar/photos/sources.json`. Run `npm run photos:manifest` after asset changes to update versioned URLs and credits.
- Worker screens reuse the owner components (cards, `SaleDialog`, `IngredientRows`, `PhotoPicker`, `RecipeShortages`); hide restricted data by not passing it, never by a separate worker layout.
- Groups, hints, menu category flags, guest menu texts, catalog upgrades and presets live in `src/barbar/config/*.json` (see `docs/configuration.md`); do not hardcode them in components.
- Check modal scroll locking, worker Sales prices and daily amounts while keeping costs/profit and stock prices hidden, unavailable stock highlighting, and grid/list layouts when changing shared styles.
- Dialogs: main text at least 14px, secondary text at least 12px. Category rows use `ui/category-tabs.tsx`: buttons on wide screens, a native dropdown below 760px.
- Phones (below 760px, `ui/use-compact.ts`) keep only daily actions on screen: bottom navigation, one heading row of actions, search with a sort/filter sheet, and a day-receipt bar. Rare actions, histories, row actions, settings and day metrics open in `ui/sheet.tsx` bottom sheets; dialogs open from the bottom edge. Keep desktop markup unchanged when adding phone variants.
- Photos: prefer the brand's or retailer's original packshot with its source page, or a licensed Wikimedia Commons photo with author and licence; owner-supplied photos are recorded as such. Generic packshots of another brand are marked as examples. Run `npm run photos:optimize` after adding files.
- The public guest menu (`/menu`) never loads the workspace or session; it renders only the `guest-menu.ts` allowlist.
- Every new visible string needs EN and HY entries; stored product names, notes and reasons stay untranslated.
- Shared modules first: `domain/sales/day-totals.ts`, `domain/sales/popularity.ts`, `presentation/format-date.ts`, `domain/lookup.ts` (`byId`), `domain/reports/csv.ts`, `domain/catalog/recipe-status.ts`. Pages compose them; never re-implement a total, a label or a predicate inline. Index a catalog with `byId` before mapping rows — no `.find()` inside `.map()`.
- Notifications: the header bell (`features/notifications/NotificationsButton.tsx`) opens `NotificationsPanel.tsx` in `ui/drawer.tsx` with the push toggle and the received feed (newest first, a row opens its full text). Live warnings stay in `StockAlerts.tsx`; state lives in `use-stock-alerts.ts` and `use-notifications-feed.ts`; texts come from `domain/notifications/feed.ts`. Workers see stock warnings only.
- One typeface: Manrope 400–700 through the `--display` token. Do not add Playfair or extra weights; every new visible string still needs EN and HY entries.
- Build chunks (`vite.config.ts`): `react` (framework) and `photo-manifest` are separate, shared by the workspace and `/menu`; routes stay lazy. The photo manifest is not what makes the shared chunk heavy — React is.
- Sales open on `salesSortDefault` («most sold first», 30-day window); card pages ask for both resources in one request (`use-card-pages.ts`, `resources=`). Search inputs `.trim()` on every page.
- Provider context values are memoized (`BarProvider`, `SettingsProvider`); new actions go through `useCallback`, or every screen re-renders on each poll.
