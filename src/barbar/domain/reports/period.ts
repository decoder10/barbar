export type ReportPeriod = string | { from: string; to: string };
export function inReportPeriod(date: string, period: ReportPeriod) {
  return typeof period === 'string' ? date.startsWith(period) : date >= period.from && date <= period.to;
}
/** At most 62 visible columns; every sale remains included, even in multi-year ranges. */
export function revenueSeries(sales: { date: string; revenue: number }[], from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`),
    end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const day = 86400000,
    count = Math.floor((end - start) / day) + 1,
    step = Math.max(1, Math.ceil(count / 62));
  const bins = Array.from({ length: Math.ceil(count / step) }, (_, i) => ({
    date: new Date(start + i * step * day).toISOString().slice(0, 10),
    end: new Date(Math.min(end, start + ((i + 1) * step - 1) * day)).toISOString().slice(0, 10),
    amount: 0,
  }));
  for (const sale of sales) {
    const index = Math.floor((Date.parse(`${sale.date}T00:00:00Z`) - start) / day / step);
    if (sale.date >= from && sale.date <= to && bins[index]) bins[index].amount += sale.revenue;
  }
  return bins;
}
