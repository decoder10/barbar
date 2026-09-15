import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { businessToday } from '../../src/barbar/domain/business-day';
import { inventoryCalculations } from '../../src/barbar/domain/inventory-calculations';
import { applyCommand, initialData } from '../../src/barbar/domain/model';
import type { Command } from '../../src/barbar/domain/types';
import { identity } from '../../tests/identity-fixture';
import { mongoRepository } from './barbar-mongo';

const uri = process.env.BARBAR_TEST_MONGODB_URI;
const day = (offset: number) =>
  new Date(Date.parse(`${businessToday()}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);

describe.skipIf(!uri)('historical corrections without a full ledger read (isolated MongoDB)', () => {
  if (uri && !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(uri))
    throw new Error('Local test URI required');
  const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017');
  const db = client.db(`barbar_test_history_${crypto.randomUUID().replaceAll('-', '')}`);
  const repo = mongoRepository(client, db, async () => initialData());
  beforeAll(async () => {
    await client.connect();
    vi.stubEnv('BARBAR_ADMIN_PASSWORD', 'test-admin-password-123');
  });
  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
    vi.unstubAllEnvs();
  });
  const sale = (id: string, quantity: number, date: string): Command => ({
    type: 'sale',
    id,
    value: { kind: 'alcohol', productId: 'vodka', quantity, date },
  });
  // Both paths must agree: the incremental server path and the full in-memory ledger.
  const agree = async (command: Command, accepted: boolean) => {
    const full = (await repo.read()).data;
    const actor = (await identity.resolve('admin'))!;
    if (accepted) {
      expect(() => applyCommand(full, command)).not.toThrow();
      expect(await repo.execute!(command, actor)).not.toBeNull();
    } else {
      expect(() => applyCommand(full, command)).toThrow();
      await expect(repo.execute!(command, actor)).rejects.toMatchObject({ status: 400 });
    }
  };
  const balancesMatchFullLedger = async () => {
    const full = inventoryCalculations((await repo.read()).data);
    const saved = await db
      .collection<{ _id: string; ml: number; cost: number }>('stockBalances')
      .findOne({ _id: 'vodka' });
    expect(saved!.ml).toBeCloseTo(full.stock('vodka'), 6);
    expect(saved!.cost).toBeCloseTo(full.stockValue('vodka'), 4);
  };

  it('accepts and rejects historical sales exactly like the full ledger', async () => {
    const actor = (await identity.resolve('admin'))!;
    await repo.read();
    await repo.execute!(
      {
        type: 'purchase',
        id: 'p-old',
        value: { id: 'p-old', alcoholId: 'vodka', date: day(-5), ml: 200, costPerLiter: 4000 },
      },
      actor,
    );
    await agree(sale('s-2', 150, day(-2)), true);
    // Current stock would allow 100 ml more after today's purchase, but day -2 would go negative.
    await repo.execute!(
      {
        type: 'purchase',
        id: 'p-now',
        value: { id: 'p-now', alcoholId: 'vodka', date: day(0), ml: 1000, costPerLiter: 4200 },
      },
      actor,
    );
    await agree(sale('s-4', 100, day(-4)), false);
    // Before the first purchase there was no stock at all.
    await agree(sale('s-6', 10, day(-6)), false);
    await agree(sale('s-3', 50, day(-3)), true);
    await balancesMatchFullLedger();
  });

  it('corrects purchases incrementally with the same stock and cost checks', async () => {
    const correction = (id: string, expectedMl: number, ml: number): Command => ({
      type: 'correctPurchase',
      id,
      purchaseId: 'p-old',
      expectedMl,
      ml,
    });
    // 200 ml bought on day -5, 200 ml sold by day -2: nothing can be removed from that purchase.
    await agree(correction('c-1', 200, 150), false);
    await agree(correction('c-2', 200, 260), true);
    await agree(correction('c-3', 260, 230), true);
    await agree(correction('c-stale', 200, 250), false);
    await balancesMatchFullLedger();
    const purchase = await db.collection('purchases').findOne({ _id: 'p-old' as never });
    expect(purchase?.ml).toBe(230);
  });
});
