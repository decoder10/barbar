import { barConfig } from '../../config';
import { businessDaysBefore } from '../business-day';

interface CountedSale {
  kind: string;
  productId: string;
  date: string;
  voided?: boolean;
}

/**
 * Active sales per `kind:productId` over the window of business days ending on `date`.
 * One definition for both roles: the owner counts the ledger, a worker their allowlisted sales.
 */
export function popularityWindow(
  sales: CountedSale[],
  date: string,
  days = barConfig.presets.popularityDays,
) {
  const from = businessDaysBefore(date, days - 1);
  const counts = new Map<string, number>();
  for (const sale of sales)
    if (!sale.voided && sale.date >= from && sale.date <= date) {
      const key = `${sale.kind}:${sale.productId}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  return counts;
}
