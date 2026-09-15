import { aggregatedPerformance } from './aggregated';
import type { SalesGroup } from './server-types';
import type { BarData, Sale } from '../types';
import { inReportPeriod, type ReportPeriod } from './period';
export interface ProductPerformance {
  id: string;
  name: string;
  unit: string;
  servingMl?: number;
  quantity: number;
  operations: number;
  revenue: number;
  cost: number;
  costKnown: boolean;
  outOfStock: boolean;
  averagePrice: number;
  currentPrice: number | null;
  profit: number;
  margin: number | null;
}
export function salesPerformance(data: BarData, period: ReportPeriod): ProductPerformance[] {
  const groups = new Map<string, SalesGroup & { ingredientIds: string[][] }>();
  for (const s of data.sales) {
    if (s.voided || !inReportPeriod(s.date, period)) continue;
    const id = `${s.kind}:${s.productId}:${s.unit || ''}:${s.servingMl || ''}`;
    const row = groups.get(id) || {
      productId: s.productId,
      kind: s.kind,
      name: s.name,
      unit: s.unit,
      servingMl: s.servingMl,
      quantity: 0,
      operations: 0,
      revenue: 0,
      cost: 0,
      knownCost: true,
      ingredientIds: [],
    };
    row.quantity += s.quantity;
    row.operations++;
    row.revenue! += s.revenue;
    row.cost! += s.cost;
    row.knownCost &&= saleCostKnown(s);
    row.ingredientIds.push(s.ingredients.map((i) => i.alcoholId));
    groups.set(id, row);
  }
  return aggregatedPerformance(data, [...groups.values()]);
}

export function saleCostKnown(s: Sale) {
  if (s.withoutIngredients) return s.cost > 0;
  return (
    s.ingredients.length + (s.extraCosts?.length || 0) > 0 &&
    s.ingredients.every((i) => i.cost > 0) &&
    (s.extraCosts || []).every((i) => i.cost > 0)
  );
}
export interface PriceAdvice {
  product: ProductPerformance;
  kind: 'raise' | 'lower' | 'review' | 'insufficient';
  suggested: number | null;
  reason: string;
}
export function priceAdvice(rows: ProductPerformance[], targetMargin = 50): PriceAdvice[] {
  const margin = Math.min(90, Math.max(10, targetMargin));
  const counts = rows.map((r) => r.operations).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  const popular = counts.length ? counts[Math.floor((counts.length - 1) * 0.75)] : 0;
  return rows.map((product) => {
    const current = product.currentPrice;
    if (!product.costKnown || product.operations < 5 || !current || product.quantity <= 0)
      return {
        product,
        kind: 'insufficient',
        suggested: null,
        reason: !product.costKnown
          ? 'Сначала заполните себестоимость.'
          : 'Нужно хотя бы 5 операций с полной себестоимостью.',
      };
    const increment = current < 1000 ? 10 : 50;
    const unitCost = product.cost / product.quantity;
    const currentMargin = ((current - unitCost) / current) * 100;
    if (currentMargin < margin) {
      const needed = Math.ceil(unitCost / (1 - margin / 100) / 50) * 50;
      if (needed > current * 1.1)
        return {
          product,
          kind: 'review',
          suggested: needed,
          reason:
            'Для целевой маржи требуется заметное повышение. Сначала проверьте рецепт, закупочную цену и порцию.',
        };
      return {
        product,
        kind: 'raise',
        suggested: needed,
        reason: 'Текущая цена ниже выбранной целевой маржи при себестоимости периода.',
      };
    }
    if (product.outOfStock)
      return {
        product,
        kind: 'review',
        suggested: null,
        reason: 'Сейчас нет запаса. Сначала восстановите наличие, затем оценивайте спрос.',
      };
    if (product.operations >= 10 && product.operations >= popular)
      return {
        product,
        kind: 'raise',
        suggested: Math.ceil((current * 1.05) / increment) * increment,
        reason:
          'Позицию часто выбирали. Можно проверить небольшое повышение и сравнить продажи следующего периода.',
      };
    const reduced = Math.floor((current * 0.95) / increment) * increment;
    if (product.operations < median && reduced > 0 && ((reduced - unitCost) / reduced) * 100 >= margin)
      return {
        product,
        kind: 'lower',
        suggested: reduced,
        reason:
          'Позицию выбирали реже остальных. Можно протестировать небольшое снижение без падения ниже целевой маржи.',
      };
    return {
      product,
      kind: 'review',
      suggested: null,
      reason: 'Явного основания менять цену по этим данным нет. Продолжайте наблюдение.',
    };
  });
}
