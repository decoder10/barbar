import { saleUnit } from './model';
import type { Sale } from './types';
/** Keep bottle, glass and portion totals separate instead of presenting a mixed count as portions. */
export function menuQuantitySummary(
  sales: (Pick<Sale, 'kind' | 'quantity' | 'unit' | 'category'> & { voided?: boolean })[],
): string {
  const totals = new Map<string, number>();
  for (const sale of sales)
    if (!sale.voided && sale.kind === 'cocktail') {
      const unit = saleUnit(sale);
      totals.set(unit, (totals.get(unit) || 0) + sale.quantity);
    }
  return [...totals].map(([unit, count]) => `${count} ${unit}`).join(' · ') || '0 порц.';
}
