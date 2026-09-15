import { describe, expect, it } from 'vitest';
import { batchStatus, batchStock } from '../batches';

const batch = (id: string, date: string, quantity: number, expiresOn?: string) => ({
  id,
  kind: 'prepare' as const,
  outputId: 'plum-tincture',
  outputQuantity: quantity,
  reason: `Партия ${id}`,
  date,
  createdAt: `${date}T10:00:00.000Z`,
  ...(expiresOn ? { expiresOn } : {}),
  lines: [
    { alcoholId: 'vodka', ml: -quantity, cost: -quantity * 4 },
    { alcoholId: 'plum-tincture', ml: quantity, cost: quantity * 4 },
  ],
});

describe('FEFO batch balances', () => {
  it('keeps current stock in the latest-expiring batches', () => {
    const [stock] = batchStock(
      [
        batch('a', '2026-09-01', 1000, '2026-09-20'),
        batch('b', '2026-09-05', 1000, '2026-09-10'),
        batch('c', '2026-09-08', 500),
      ],
      new Map([['plum-tincture', 1200]]),
    );
    // Earliest expiry (b) is used first, then a; a batch without a date is used last.
    expect(stock.batches.map((b) => [b.id, b.remaining])).toEqual([
      ['a', 700],
      ['c', 500],
    ]);
    expect(stock.unassigned).toBe(0);
  });

  it('reports stock not explained by batches and hides fully used outputs', () => {
    const result = batchStock(
      [
        batch('a', '2026-09-01', 300, '2026-09-20'),
        { ...batch('x', '2026-09-01', 100), outputId: 'used-up' },
      ],
      new Map([
        ['plum-tincture', 450],
        ['used-up', 0],
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ balance: 450, unassigned: 150 });
  });

  it('marks expired and soon-expiring batches', () => {
    expect(batchStatus({ expiresOn: '2026-09-14' }, '2026-09-15')).toBe('expired');
    expect(batchStatus({ expiresOn: '2026-09-17' }, '2026-09-15')).toBe('soon');
    expect(batchStatus({ expiresOn: '2026-09-30' }, '2026-09-15')).toBe('ok');
    expect(batchStatus({}, '2026-09-15')).toBe('none');
  });
});
