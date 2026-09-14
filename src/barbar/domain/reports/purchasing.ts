import type { BarData } from '../types';
import { stockTotals } from '../model';
export function purchaseForecast(
  data: BarData,
  from: string,
  to: string,
  leadDays: number,
  reserveDays: number,
) {
  const use = new Map<string, number>();
  const add = (id: string, value: number) => use.set(id, (use.get(id) || 0) + value);
  for (const s of data.sales)
    if (!s.voided && s.date >= from && s.date <= to) for (const i of s.ingredients) add(i.alcoholId, i.ml);
  for (const m of data.stockMovements || [])
    if (m.kind === 'prepare' && m.date >= from && m.date <= to)
      for (const i of m.lines) if (i.ml < 0) add(i.alcoholId, -i.ml);
  const preparations = new Set(
    data.stockMovements?.filter((m) => m.kind === 'prepare').map((m) => m.outputId),
  );
  return forecastFromUsage(data, from, to, leadDays, reserveDays, use, preparations);
}
export function forecastFromUsage(
  data: BarData,
  from: string,
  to: string,
  leadDays: number,
  reserveDays: number,
  use: Map<string, number>,
  preparations: Set<string | undefined>,
) {
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const quantities = stockTotals(data);
  return data.alcohol
    .map((a) => {
      const consumed = use.get(a.id) || 0;
      const daily = consumed / days;
      const available = Math.max(0, quantities.get(a.id) || 0);
      const raw = Math.max(0, daily * (Math.max(0, leadDays) + Math.max(0, reserveDays)) - available);
      return {
        id: a.id,
        name: a.name,
        unit: a.unit,
        consumed,
        daily,
        available,
        daysLeft: daily > 0 ? available / daily : null,
        suggested: a.unit === 'bottle' ? Math.ceil(raw) : Math.ceil(raw * 100) / 100,
        preparation: preparations.has(a.id),
        days,
        insufficientHistory: days < 7 || consumed === 0,
      };
    })
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.name.localeCompare(b.name));
}
export function operatingResult(data: BarData, from: string, to: string) {
  const inPeriod = (date: string) => date >= from && date <= to;
  const sales = data.sales.filter((s) => !s.voided && inPeriod(s.date));
  const revenue = sales.reduce((s, row) => s + row.revenue, 0);
  const cost = sales.reduce((s, row) => s + row.cost, 0);
  const expenses = (data.expenses || [])
    .filter((e) => !e.voided && inPeriod(e.date))
    .reduce((s, e) => s + e.amount, 0);
  const losses =
    (data.stockMovements || [])
      .filter((m) => inPeriod(m.date) && m.kind !== 'prepare')
      .flatMap((m) => m.lines)
      .reduce((s, i) => s + Math.max(0, -i.cost), 0) +
    (data.stockResets || []).filter((m) => inPeriod(m.date)).reduce((s, m) => s + m.cost, 0);
  return { revenue, cost, expenses, losses, result: revenue - cost - expenses - losses };
}
