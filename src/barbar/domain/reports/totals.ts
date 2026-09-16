import { round, unitBasis } from '../model';
import { byId } from '../lookup';
import type { BarData, MenuCategory, Purchase, Sale } from '../types';
import type { SalesGroup, ServerReport } from './server-types';

export interface ReportRow {
  name: string;
  servingMl?: number;
  unit?: Sale['unit'];
  category?: MenuCategory;
  kind: string;
  quantity: number;
  revenue: number;
  cost: number;
}

/** Sales of the period grouped by position and serving, as the server groups them. */
export function groupSales(sales: Sale[]): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const s of sales) {
    const key = `${s.kind}-${s.productId}-${s.unit || ''}-${s.servingMl || ''}`;
    const row = groups.get(key) || {
      name: s.name,
      category: s.category,
      kind: s.kind,
      unit: s.unit,
      servingMl: s.servingMl,
      quantity: 0,
      revenue: 0,
      cost: 0,
    };
    row.quantity += s.quantity;
    row.revenue += s.revenue;
    row.cost += s.cost;
    groups.set(key, row);
  }
  return [...groups.values()];
}

/**
 * The report's headline figures from one source: the server report when the ledger is paged,
 * otherwise the loaded sales and purchases. Every figure follows the same branch.
 */
export function reportTotals(
  report: ServerReport | null,
  sales: Sale[],
  purchases: Purchase[],
  data: Pick<BarData, 'alcohol'>,
) {
  const groups: (SalesGroup | ReportRow)[] = report ? report.groups : groupSales(sales);
  const alcohol = byId(data.alcohol);
  return {
    revenue: round(groups.reduce((sum, g) => sum + (g.revenue || 0), 0)),
    cost: round(groups.reduce((sum, g) => sum + (g.cost || 0), 0)),
    bought: round(
      report
        ? report.purchaseTotal
        : purchases.reduce(
            (sum, p) => sum + (p.ml * p.costPerLiter) / unitBasis(alcohol.get(p.alcoholId)?.unit),
            0,
          ),
    ),
    cocktailCount: groups.filter((g) => g.kind === 'cocktail').reduce((sum, g) => sum + g.quantity, 0),
    operationCount: report ? report.groups.reduce((sum, g) => sum + g.operations, 0) : sales.length,
    rows: groups
      .map((g) => ({ ...g, revenue: g.revenue || 0, cost: g.cost || 0 }))
      .sort((a, b) => b.revenue - a.revenue),
    consumed: report
      ? { ...report.consumed }
      : sales.reduce<Record<string, number>>((acc, s) => {
          for (const i of s.ingredients) acc[i.alcoholId] = (acc[i.alcoholId] || 0) + i.ml;
          return acc;
        }, {}),
  };
}
