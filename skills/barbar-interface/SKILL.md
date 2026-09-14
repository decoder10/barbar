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
- Check modal scroll locking, worker views without money, unavailable stock highlighting, and grid/list layouts when changing shared styles.
