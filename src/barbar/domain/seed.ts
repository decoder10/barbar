import alcoholDefaults from '../data/alcohol.json' with { type: 'json' };
import cocktailDefaults from '../data/cocktails.json' with { type: 'json' };
import salesDefaults from '../data/sales/initial.json' with { type: 'json' };
import type { Alcohol, BarData, Cocktail } from './types';

// The bundled bootstrap catalog. The browser imports this module on demand (`services/working-state.ts`),
// so nothing on the workspace's first screen may import it statically; `model.ts` only re-exports it
// for the server and tests.
export const initialData = (): BarData => ({
  version: 1,
  alcohol: alcoholDefaults as Alcohol[],
  cocktails: cocktailDefaults as Cocktail[],
  purchases: [],
  sales: salesDefaults,
  operations: [],
});
