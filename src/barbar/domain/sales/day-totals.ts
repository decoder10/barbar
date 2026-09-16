import { round } from '../model';

interface DayRow {
  kind: 'alcohol' | 'cocktail';
  quantity: number;
  revenue?: number;
  cost?: number;
  /** Server groups carry their own operation count; a single sale row counts as one. */
  operations?: number;
}

/** The day's figures for both roles. Cost stays zero for rows a worker is allowed to see. */
export function dayTotals(rows: DayRow[]) {
  let revenue = 0,
    cost = 0,
    menuQuantity = 0,
    pouredMl = 0,
    operations = 0;
  for (const row of rows) {
    revenue += row.revenue || 0;
    cost += row.cost || 0;
    operations += row.operations ?? 1;
    if (row.kind === 'cocktail') menuQuantity += row.quantity;
    else pouredMl += row.quantity;
  }
  return { revenue: round(revenue), cost: round(cost), menuQuantity, pouredMl, operations };
}
