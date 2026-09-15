import { barConfig } from '../config';
import type { StockMovement } from './types';

export interface PreparationBatch {
  id: string;
  outputId: string;
  reason: string;
  date: string;
  createdAt: string;
  expiresOn?: string;
  produced: number;
  remaining: number;
  cost: number;
}
export interface BatchStock {
  outputId: string;
  balance: number;
  batches: PreparationBatch[];
  /** Stock not explained by recorded batches, e.g. a purchase or a count surplus. */
  unassigned: number;
}
type Preparation = Pick<
  StockMovement,
  'id' | 'kind' | 'outputId' | 'outputQuantity' | 'reason' | 'date' | 'createdAt' | 'expiresOn' | 'lines'
>;

const expiryOrder = (a: Preparation, b: Preparation) =>
  (a.expiresOn || '9999-12-31').localeCompare(b.expiresOn || '9999-12-31') ||
  a.date.localeCompare(b.date) ||
  a.createdAt.localeCompare(b.createdAt);

/**
 * FEFO view of prepared stock. Use and write-offs leave the earliest-expiring batch first, so the
 * current balance sits in the latest-expiring batches. Costs stay weighted-average in the ledger.
 */
export function batchStock(movements: Preparation[], balances: Map<string, number>): BatchStock[] {
  const outputs = new Map<string, Preparation[]>();
  for (const m of movements)
    if (m.kind === 'prepare' && m.outputId && (m.outputQuantity || 0) > 0)
      outputs.set(m.outputId, [...(outputs.get(m.outputId) || []), m]);
  return [...outputs.entries()]
    .map(([outputId, list]) => {
      const balance = Math.max(0, balances.get(outputId) || 0);
      let left = balance;
      const batches = [...list]
        .sort(expiryOrder)
        .reverse()
        .map((m) => {
          const remaining = Math.min(m.outputQuantity!, left);
          left = Math.round((left - remaining) * 1e8) / 1e8;
          return {
            id: m.id,
            outputId,
            reason: m.reason,
            date: m.date,
            createdAt: m.createdAt,
            ...(m.expiresOn ? { expiresOn: m.expiresOn } : {}),
            produced: m.outputQuantity!,
            remaining,
            cost: m.lines.find((l) => l.alcoholId === outputId)?.cost || 0,
          };
        })
        .reverse();
      return { outputId, balance, batches: batches.filter((b) => b.remaining > 0), unassigned: left };
    })
    .filter((item) => item.balance > 0);
}

export function batchStatus(
  batch: Pick<PreparationBatch, 'expiresOn'>,
  today: string,
  soonDays = barConfig.presets.batchExpirySoonDays,
) {
  if (!batch.expiresOn) return 'none' as const;
  if (batch.expiresOn < today) return 'expired' as const;
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + soonDays * 86400000).toISOString().slice(0, 10);
  return batch.expiresOn <= soon ? ('soon' as const) : ('ok' as const);
}
