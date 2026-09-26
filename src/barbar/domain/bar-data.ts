import type { BarData } from './types';

// What the workspace provider needs before any ledger code: kept apart from `model.ts` (which
// re-exports both) so the entry chunk does not carry command validation.
export const uid = () => crypto.randomUUID();
/** The workspace placeholder until the first server snapshot; it carries no bundled catalog. */
export const emptyBarData = (): BarData => ({
  version: 1,
  alcohol: [],
  cocktails: [],
  purchases: [],
  sales: [],
  operations: [],
});
