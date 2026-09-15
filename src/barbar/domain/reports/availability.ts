import type { BarData } from '../types';

export interface DailyChange {
  date: string;
  alcoholId: string;
  /** Net stock change of the day: purchases and surpluses positive; sales, batches, write-offs negative. */
  delta: number;
  /** Quantity used by sales or batch preparation that day. */
  consumed: number;
}
export interface Availability {
  /** Days in the period with at least one active sale: the bar was open. */
  workedDays: number;
  /** Worked days with stock at the start of the day or actual use. */
  availableDays: number;
  stockoutDays: number;
}

const eps = 1e-7;

/** Rebuild daily balances backwards from today's balance: no ledger replay from the beginning. */
export function availabilityDays(input: {
  from: string;
  to: string;
  current: Map<string, number>;
  changes: DailyChange[];
  workedDates: Iterable<string>;
}): Map<string, Availability> {
  const worked = [...new Set(input.workedDates)].filter((d) => d >= input.from && d <= input.to).sort();
  const byItem = new Map<string, Map<string, { delta: number; consumed: number }>>();
  for (const change of input.changes) {
    if (change.date < input.from) continue;
    const days = byItem.get(change.alcoholId) || new Map();
    const day = days.get(change.date) || { delta: 0, consumed: 0 };
    day.delta += change.delta;
    day.consumed += change.consumed;
    days.set(change.date, day);
    byItem.set(change.alcoholId, days);
  }
  const result = new Map<string, Availability>();
  for (const [id, balance] of input.current) {
    const days = byItem.get(id) || new Map<string, { delta: number; consumed: number }>();
    // Changes after each worked day, accumulated from the newest date backwards.
    const dates = [...days.keys()].sort().reverse();
    let later = 0;
    let index = 0;
    let available = 0;
    for (const date of [...worked].reverse()) {
      while (index < dates.length && dates[index] > date) later += days.get(dates[index++])!.delta;
      const today = days.get(date);
      const start = balance - later - (today?.delta || 0);
      if (start > eps || (today?.consumed || 0) > eps) available++;
    }
    result.set(id, {
      workedDays: worked.length,
      availableDays: available,
      stockoutDays: worked.length - available,
    });
  }
  return result;
}

/** The same daily changes for a complete in-memory ledger. */
export function ledgerChanges(data: BarData, from: string) {
  const changes: DailyChange[] = [];
  const add = (date: string, alcoholId: string, delta: number, consumed = 0) => {
    if (date >= from) changes.push({ date, alcoholId, delta, consumed });
  };
  const worked = new Set<string>();
  for (const sale of data.sales)
    if (!sale.voided) {
      worked.add(sale.date);
      for (const i of sale.ingredients) add(sale.date, i.alcoholId, -i.ml, i.ml);
    }
  for (const p of data.purchases) add(p.date, p.alcoholId, p.ml);
  for (const m of data.stockMovements || [])
    for (const line of m.lines)
      add(m.date, line.alcoholId, line.ml, m.kind === 'prepare' && line.ml < 0 ? -line.ml : 0);
  for (const r of data.stockResets || []) add(r.date, r.alcoholId, -r.ml);
  return { changes, workedDates: worked };
}
