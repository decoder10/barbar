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
- Photos: prefer the brand's or retailer's original packshot with its source page, or a licensed Wikimedia Commons photo with author and licence; owner-supplied photos are recorded as such. Generic packshots of another brand are marked as examples. Run `npm run photos:optimize` after adding files.
- The public guest menu (`/menu`) never loads the workspace or session; it renders only the `guest-menu.ts` allowlist.
- Every new visible string needs EN and HY entries; stored product names, notes and reasons stay untranslated.
