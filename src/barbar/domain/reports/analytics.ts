import { stockTotals } from '../model';
import type { BarData } from '../types';
import { inReportPeriod, type ReportPeriod } from './period';
import { saleCostKnown } from './pricing';

export interface ReportInsight {
  id: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  tone: 'good' | 'attention' | 'neutral';
}
export function reportAnalytics(data: BarData, period: ReportPeriod) {
  const records = data.sales.filter((s) => inReportPeriod(s.date, period));
  const sales = records.filter((s) => !s.voided);
  const groups = new Map<
    string,
    {
      name: string;
      revenue: number;
      cost: number;
      operations: number;
      costKnown: boolean;
      ingredients: Set<string>;
    }
  >();
  const costKnown = saleCostKnown;
  for (const s of sales) {
    const key = `${s.kind}:${s.productId}`;
    const row = groups.get(key) || {
      name: s.name,
      revenue: 0,
      cost: 0,
      operations: 0,
      costKnown: true,
      ingredients: new Set<string>(),
    };
    row.revenue += s.revenue;
    row.cost += s.cost;
    row.operations++;
    row.costKnown &&= costKnown(s);
    s.ingredients.forEach((i) => row.ingredients.add(i.alcoholId));
    groups.set(key, row);
  }
  const ranked = [...groups.values()].sort((a, b) => b.revenue - a.revenue);
  const revenue = sales.reduce((sum, s) => sum + s.revenue, 0);
  const complete = sales.filter(costKnown);
  const knownRevenue = complete.reduce((sum, s) => sum + s.revenue, 0);
  const knownCost = complete.reduce((sum, s) => sum + s.cost, 0);
  const costCoverage = sales.length ? (complete.length / sales.length) * 100 : 0;
  const cancellations = records.filter((s) => s.voided).length;
  const insights: ReportInsight[] = [];
  if (!sales.length)
    insights.push({
      id: 'empty',
      title: 'Начните с продаж',
      detail:
        'За выбранный период нет завершённых продаж. После первых записей появятся лидеры и показатели.',
      action: 'Открыть продажи',
      href: '/',
      tone: 'neutral',
    });
  if (ranked[0])
    insights.push({
      id: 'leader',
      title: 'Лидер по выручке',
      detail: `${ranked[0].name} — ${revenue > 0 ? Math.round((ranked[0].revenue / revenue) * 100) : 0}% выручки периода. Проверьте запас ингредиентов перед следующей сменой.`,
      action: 'Проверить склад',
      href: '/inventory',
      tone: 'good',
    });
  const lowMargin = ranked.filter(
    (r) => r.costKnown && r.revenue > 0 && (r.revenue - r.cost) / r.revenue < 0.3,
  );
  if (lowMargin.length)
    insights.push({
      id: 'margin',
      title: 'Проверьте маржу',
      detail: `${lowMargin
        .slice(0, 3)
        .map((r) => r.name)
        .join(
          ', ',
        )}: валовая маржа ниже 30%. Сверьте закупочную цену, состав и размер порции перед изменением цены.`,
      action: 'Открыть рецепты',
      href: '/cocktails',
      tone: 'attention',
    });
  if (sales.length && costCoverage < 100)
    insights.push({
      id: 'costs',
      title: 'Себестоимость заполнена не везде',
      detail: `У ${sales.length - complete.length} операций есть ингредиенты без стоимости или нет состава. Прибыль по таким записям может быть завышена; уточнение справочника не меняет прошлые продажи.`,
      action: 'Проверить рецепты',
      href: '/cocktails',
      tone: 'attention',
    });
  const stock = stockTotals(data);
  const unavailable = ranked.filter((r) => [...r.ingredients].some((id) => (stock.get(id) || 0) <= 0));
  if (unavailable.length)
    insights.push({
      id: 'stock',
      title: 'Продавались, но сейчас нет запаса',
      detail: `${unavailable
        .slice(0, 3)
        .map((r) => r.name)
        .join(', ')}. На текущем складе закончился хотя бы один ингредиент.`,
      action: 'Открыть склад',
      href: '/inventory',
      tone: 'attention',
    });
  if (cancellations)
    insights.push({
      id: 'voids',
      title: 'Отмены продаж',
      detail: `${cancellations} из ${records.length} записей отменены. Проверьте причины ошибок и удобство выбора позиции; отмены исключены из выручки.`,
      action: 'Посмотреть продажи',
      href: '/',
      tone: 'neutral',
    });
  return {
    insights,
    costCoverage,
    averageOperation: sales.length ? revenue / sales.length : 0,
    knownMargin: knownRevenue > 0 ? ((knownRevenue - knownCost) / knownRevenue) * 100 : null,
    cancelRate: records.length ? (cancellations / records.length) * 100 : 0,
    top: ranked.slice(0, 5),
    revenue,
  };
}
