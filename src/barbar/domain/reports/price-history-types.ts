import type { PriceChange } from '../types';
import type { WindowStats } from './price-history';

/** One price change with its before and after windows, as the price history route returns it. */
export interface PriceChangeRow extends PriceChange {
  windows: { length: number; before: WindowStats; after: WindowStats } | null;
}
