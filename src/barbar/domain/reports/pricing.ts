import { stockTotals } from '../model';
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
  const quantities = stockTotals(data),
    groups = new Map<string, ProductPerformance>();
  const cocktails = new Map(data.cocktails.map((c) => [c.id, c]));
  const alcohol = new Map(data.alcohol.map((a) => [a.id, a]));
  for (const s of data.sales) {
    if (s.voided || !inReportPeriod(s.date, period)) continue;
    const id = `${s.kind}:${s.productId}:${s.unit || ''}:${s.servingMl || ''}`;
    const c = cocktails.get(s.productId),
      a = alcohol.get(s.productId);
    const linked = c?.stockAlcoholId ? alcohol.get(c.stockAlcoholId) : undefined;
    const currentPrice =
      s.kind === 'alcohol'
        ? a
          ? a.pricePerLiter / 20
          : null
        : c
          ? c.price * (s.servingMl && linked?.glassSizeMl ? s.servingMl / linked.glassSizeMl : 1)
          : null;
    const row = groups.get(id) || {
      id,
      name: s.name,
      unit:
        s.kind === 'alcohol' ? '50 мл' : s.unit === 'bottle' ? 'бут.' : s.unit === 'glass' ? 'бок.' : 'порц.',
      servingMl: s.servingMl,
      quantity: 0,
      operations: 0,
      revenue: 0,
      cost: 0,
      costKnown: true,
      outOfStock: false,
      averagePrice: 0,
      currentPrice,
      profit: 0,
      margin: null,
    };
    row.quantity += s.kind === 'alcohol' ? s.quantity / 50 : s.quantity;
    row.operations++;
    row.revenue += s.revenue;
    row.cost += s.cost;
    row.costKnown &&= saleCostKnown(s);
    row.outOfStock ||= s.ingredients.some((i) => (quantities.get(i.alcoholId) || 0) <= 0);
    groups.set(id, row);
  }
  return [...groups.values()].map((row) => ({
    ...row,
    averagePrice: row.quantity ? row.revenue / row.quantity : 0,
    profit: row.revenue - row.cost,
    margin: row.costKnown && row.revenue > 0 ? ((row.revenue - row.cost) / row.revenue) * 100 : null,
  }));
}
export function saleCostKnown(s: Sale) {
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
