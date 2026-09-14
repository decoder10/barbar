import type { BarData } from '../types';
import type { SalesGroup } from './server-types';
import type { ProductPerformance } from './pricing';
import type { ReportInsight, reportAnalytics } from './analytics';
import { stockTotals } from '../model';
export function aggregatedPerformance(
  data: BarData,
  groups: (SalesGroup & { ingredientIds?: string[][] })[],
): ProductPerformance[] {
  const quantities = stockTotals(data);
  const cocktails = new Map(data.cocktails.map((c) => [c.id, c]));
  const alcohol = new Map(data.alcohol.map((a) => [a.id, a]));
  return groups.map((s) => {
    const c = cocktails.get(s.productId),
      a = alcohol.get(s.productId),
      linked = c?.stockAlcoholId ? alcohol.get(c.stockAlcoholId) : undefined;
    const currentPrice =
      s.kind === 'alcohol'
        ? a
          ? a.pricePerLiter / 20
          : null
        : c
          ? c.price * (s.servingMl && linked?.glassSizeMl ? s.servingMl / linked.glassSizeMl : 1)
          : null;
    const quantity = s.kind === 'alcohol' ? s.quantity / 50 : s.quantity,
      revenue = s.revenue || 0,
      cost = s.cost || 0;
    return {
      id: `${s.kind}:${s.productId}:${s.unit || ''}:${s.servingMl || ''}`,
      name: s.name,
      unit:
        s.kind === 'alcohol' ? '50 мл' : s.unit === 'bottle' ? 'бут.' : s.unit === 'glass' ? 'бок.' : 'порц.',
      servingMl: s.servingMl,
      quantity,
      operations: s.operations,
      revenue,
      cost,
      costKnown: !!s.knownCost,
      outOfStock: (s.ingredientIds || []).flat().some((id) => (quantities.get(id) || 0) <= 0),
      averagePrice: quantity ? revenue / quantity : 0,
      currentPrice,
      profit: revenue - cost,
      margin: s.knownCost && revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
    };
  });
}
export function aggregatedAnalytics(
  rows: ProductPerformance[],
  cancellations: number,
  knownTotals?: { operations: number; revenue: number; cost: number },
): ReturnType<typeof reportAnalytics> {
  const operations = rows.reduce((s, r) => s + r.operations, 0),
    revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const known = rows.filter((r) => r.costKnown),
    knownOps = knownTotals?.operations ?? known.reduce((s, r) => s + r.operations, 0),
    knownRevenue = knownTotals?.revenue ?? known.reduce((s, r) => s + r.revenue, 0),
    knownCost = knownTotals?.cost ?? known.reduce((s, r) => s + r.cost, 0);
  const leader = [...rows].sort((a, b) => b.revenue - a.revenue)[0];
  const insights: ReportInsight[] = [];
  if (leader)
    insights.push({
      id: 'leader',
      title: 'Лидер по выручке',
      detail: `${leader.name} — ${Math.round((leader.revenue / revenue) * 100)}% выручки периода. Проверьте запас перед сменой.`,
      action: 'Проверить склад',
      href: '/inventory',
      tone: 'good',
    });
  if (knownOps < operations)
    insights.push({
      id: 'cost',
      title: 'Себестоимость заполнена не везде',
      detail: 'Уточните закупочные цены и состав. Прибыль по неполным данным может быть завышена.',
      action: 'Проверить рецепты',
      href: '/cocktails',
      tone: 'attention',
    });
  if (rows.some((r) => r.outOfStock))
    insights.push({
      id: 'stock',
      title: 'Продавались, но сейчас нет запаса',
      detail: 'Восстановите остатки популярных напитков перед следующей сменой.',
      action: 'Открыть склад',
      href: '/inventory',
      tone: 'attention',
    });
  if (cancellations)
    insights.push({
      id: 'void',
      title: 'Отмены продаж',
      detail: `Отменено записей: ${cancellations}. Проверьте журнал действий.`,
      action: 'Открыть журнал',
      href: '/audit',
      tone: 'neutral',
    });
  return {
    insights,
    costCoverage: operations ? (knownOps / operations) * 100 : 0,
    averageOperation: operations ? revenue / operations : 0,
    knownMargin: knownRevenue ? ((knownRevenue - knownCost) / knownRevenue) * 100 : null,
    cancelRate: operations + cancellations ? (cancellations / (operations + cancellations)) * 100 : 0,
    top: [],
    revenue,
  };
}
