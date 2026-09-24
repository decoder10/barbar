import type { Alcohol, BarData, Supplier } from '../types';
import { stockTotals, unitBasis } from '../model';
import { availabilityDays, ledgerChanges, type Availability } from './availability';
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
  const { changes, workedDates } = ledgerChanges(data, from);
  const availability = availabilityDays({ from, to, current: stockTotals(data), changes, workedDates });
  return forecastFromUsage(data, from, to, leadDays, reserveDays, use, preparations, availability);
}
export type ParameterSource = 'item' | 'supplier' | 'default';
export interface ForecastRow {
  id: string;
  name: string;
  unit?: Alcohol['unit'];
  consumed: number;
  daily: number;
  available: number;
  daysLeft: number | null;
  suggested: number;
  preparation: boolean;
  days: number;
  workedDays: number | null;
  availableDays: number | null;
  stockoutDays: number;
  insufficientHistory: boolean;
  supplierId: string | null;
  supplierName: string | null;
  /** Days the bar was open with the item in stock: the base of the daily use. */
  basisDays: number;
  /** Share of the period's days the bar worked; the daily use is scaled by it. */
  workShare: number;
  /** Expected use per calendar day: `daily × workShare`. */
  expectedDaily: number;
  leadDays: number;
  leadSource: ParameterSource;
  safetyDays: number;
  safetySource: ParameterSource;
  safetyStock: number;
  /** Stock the delivery must reach: use over the lead time plus the safety amount. */
  target: number;
}
/**
 * Purchase recommendation per item. Use per open day with stock is scaled by the share of worked days;
 * the lead time comes from the item, else its supplier, else `leadDays`; the safety amount is the item's
 * fixed stock plus its safety days (else `reserveDays`) of expected use. Every parameter says where it came from.
 */
export function forecastFromUsage(
  data: BarData,
  from: string,
  to: string,
  leadDays: number,
  reserveDays: number,
  use: Map<string, number>,
  preparations: Set<string | undefined>,
  availability?: Map<string, Availability>,
  suppliers: Supplier[] = data.suppliers || [],
): ForecastRow[] {
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const quantities = stockTotals(data);
  const supplierById = new Map(suppliers.map((x) => [x.id, x]));
  return data.alcohol
    .map((a) => {
      const consumed = use.get(a.id) || 0;
      const known = availability?.get(a.id);
      // Demand per open day with stock; calendar days only when no sale days are known.
      const basisDays = known?.workedDays ? Math.max(1, known.availableDays) : days;
      const daily = consumed / basisDays;
      const workShare = known?.workedDays ? Math.min(1, known.workedDays / days) : 1;
      const expectedDaily = daily * workShare;
      const supplier = a.supplierId ? supplierById.get(a.supplierId) : undefined;
      const lead =
        a.leadDays !== undefined
          ? { days: a.leadDays, source: 'item' as const }
          : supplier?.leadDays !== undefined
            ? { days: supplier.leadDays, source: 'supplier' as const }
            : { days: Math.max(0, leadDays), source: 'default' as const };
      const safety =
        a.safetyDays !== undefined
          ? { days: a.safetyDays, source: 'item' as const }
          : { days: Math.max(0, reserveDays), source: 'default' as const };
      const safetyStock = a.safetyStock || 0;
      const available = Math.max(0, quantities.get(a.id) || 0);
      const target = expectedDaily * lead.days + safetyStock + expectedDaily * safety.days;
      const raw = Math.max(0, target - available);
      return {
        id: a.id,
        name: a.name,
        unit: a.unit,
        consumed,
        daily,
        available,
        daysLeft: daily > 0 ? available / daily : null,
        suggested: unitBasis(a.unit) === 1 ? Math.ceil(raw) : Math.ceil(raw * 100) / 100,
        preparation: preparations.has(a.id),
        days,
        workedDays: known?.workedDays ?? null,
        availableDays: known?.availableDays ?? null,
        stockoutDays: known?.stockoutDays ?? 0,
        insufficientHistory: basisDays < 7 || consumed === 0,
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? null,
        basisDays,
        workShare,
        expectedDaily,
        leadDays: lead.days,
        leadSource: lead.source,
        safetyDays: safety.days,
        safetySource: safety.source,
        safetyStock,
        target,
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
