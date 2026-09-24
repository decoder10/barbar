import { barConfig } from '../config';
import type { BatchShare, StockMovement } from './types';

export interface PreparationBatch {
  id: string;
  outputId: string;
  reason: string;
  date: string;
  createdAt: string;
  expiresOn?: string;
  /** Actual yield. */
  produced: number;
  /** Planned yield; absent for batches recorded before the plan existed. */
  planned?: number;
  /** Planned minus actual yield, never negative; absent without a plan. */
  loss?: number;
  remaining: number;
  /** Cost of the whole batch: the ingredients it consumed. */
  cost: number;
  /** Cost of one unit of the actual yield. */
  unitCost: number;
  /** Cost of what is left of the batch. */
  remainingCost: number;
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
  | 'id'
  | 'kind'
  | 'outputId'
  | 'outputQuantity'
  | 'plannedQuantity'
  | 'batchId'
  | 'reason'
  | 'date'
  | 'createdAt'
  | 'expiresOn'
  | 'lines'
>;

const eps = 1e-8;
const clean = (n: number) => Math.round(n * 1e8) / 1e8;
const expiryOrder = (a: Preparation, b: Preparation) =>
  (a.expiresOn || '9999-12-31').localeCompare(b.expiresOn || '9999-12-31') ||
  a.date.localeCompare(b.date) ||
  a.createdAt.localeCompare(b.createdAt);
const outputCost = (m: Preparation) => m.lines.find((l) => l.alcoholId === m.outputId)?.cost || 0;

interface Share {
  movement: Preparation;
  produced: number;
  /** Yield minus the write-offs aimed at this batch. */
  capacity: number;
  remaining: number;
  unitCost: number;
}
/** Batches of one output in FEFO order (earliest expiry first) with what is left of each. */
function shares(movements: Preparation[], outputId: string, balance: number) {
  const list = movements
    .filter((m) => m.kind === 'prepare' && m.outputId === outputId && (m.outputQuantity || 0) > 0)
    .sort(expiryOrder);
  const targeted = new Map<string, number>();
  for (const m of movements)
    if (m.kind === 'writeoff' && m.batchId && m.lines[0]?.alcoholId === outputId)
      targeted.set(m.batchId, (targeted.get(m.batchId) || 0) - m.lines[0].ml);
  let left = Math.max(0, balance);
  // Use and write-offs leave the earliest-expiring batch first, so the balance sits in the latest ones.
  const result: Share[] = [];
  for (const movement of [...list].reverse()) {
    const produced = movement.outputQuantity!;
    const capacity = Math.max(0, clean(produced - (targeted.get(movement.id) || 0)));
    const remaining = Math.min(capacity, left);
    left = clean(left - remaining);
    result.unshift({ movement, produced, capacity, remaining, unitCost: outputCost(movement) / produced });
  }
  return { batches: result, unassigned: left };
}

/**
 * FEFO view of prepared stock. Use and write-offs leave the earliest-expiring batch first, so the
 * current balance sits in the latest-expiring batches. Include write-offs aimed at a batch in
 * `movements`: they shrink that batch's capacity.
 */
export function batchStock(movements: Preparation[], balances: Map<string, number>): BatchStock[] {
  const outputs = new Set<string>();
  for (const m of movements)
    if (m.kind === 'prepare' && m.outputId && (m.outputQuantity || 0) > 0) outputs.add(m.outputId);
  return [...outputs]
    .map((outputId) => {
      const balance = Math.max(0, balances.get(outputId) || 0);
      const { batches, unassigned } = shares(movements, outputId, balance);
      return {
        outputId,
        balance,
        batches: batches
          .filter((b) => b.remaining > 0)
          .map(({ movement: m, produced, remaining, unitCost }) => ({
            id: m.id,
            outputId,
            reason: m.reason,
            date: m.date,
            createdAt: m.createdAt,
            ...(m.expiresOn ? { expiresOn: m.expiresOn } : {}),
            produced,
            ...(m.plannedQuantity
              ? { planned: m.plannedQuantity, loss: Math.max(0, clean(m.plannedQuantity - produced)) }
              : {}),
            remaining,
            cost: outputCost(m),
            unitCost,
            remainingCost: Math.round(remaining * unitCost * 100) / 100,
          })),
        unassigned,
      };
    })
    .filter((item) => item.balance > 0);
}

export interface BatchConsumption {
  cost: number;
  batches: BatchShare[];
}
/**
 * Cost of using `quantity` of a prepared output that has recorded batches, or null when it has none
 * (the weighted average applies). Stock the batches do not explain goes first at its residual cost, then
 * the earliest-expiring batches at their own unit cost. The cost never exceeds the balance's cost, and
 * emptying the balance takes all of it so no old difference is carried forward.
 */
export function batchConsumption(
  movements: Preparation[],
  outputId: string,
  balance: { ml: number; cost: number },
  quantity: number,
): BatchConsumption | null {
  if (!movements.some((m) => m.kind === 'prepare' && m.outputId === outputId)) return null;
  const { batches, unassigned } = shares(movements, outputId, balance.ml);
  if (!batches.length) return null;
  const balanceCost = Math.max(0, balance.cost);
  const inBatches = batches.reduce((sum, b) => sum + b.remaining * b.unitCost, 0);
  const residual = Math.max(0, balanceCost - inBatches);
  let left = quantity;
  let cost = 0;
  const used: BatchShare[] = [];
  const fromUnassigned = Math.min(left, unassigned);
  cost += unassigned > 0 ? (residual * fromUnassigned) / unassigned : 0;
  left = clean(left - fromUnassigned);
  for (const b of batches) {
    if (left <= eps) break;
    const ml = Math.min(left, b.remaining);
    if (ml <= eps) continue;
    const part = ml * b.unitCost;
    cost += part;
    used.push({ id: b.movement.id, ml: clean(ml), cost: Math.round(part * 100) / 100 });
    left = clean(left - ml);
  }
  const emptied = quantity >= balance.ml - eps;
  return {
    cost: Math.round((emptied ? balanceCost : Math.min(balanceCost, cost)) * 100) / 100,
    batches: used,
  };
}

/** The remaining quantity and unit cost of one batch, or undefined when it is used up or unknown. */
export function batchRemaining(movements: Preparation[], outputId: string, balance: number, batchId: string) {
  const found = shares(movements, outputId, balance).batches.find((b) => b.movement.id === batchId);
  return found && { remaining: found.remaining, capacity: found.capacity, unitCost: found.unitCost };
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
