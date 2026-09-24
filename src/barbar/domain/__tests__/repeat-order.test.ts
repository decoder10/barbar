import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanFavorites } from '../favorites';
import { applyCommand, initialData, stock, stockTotals, validateData } from '../model';
import { openOrderAt, orderLines, orderTotal } from '../orders';
import { draftCommandLines, draftTotal, ownerCatalog, repeatDraft, staffCatalog } from '../orders/repeat';
import type { BarData } from '../types';

const worker = { actor: { id: 'w1', fullName: 'Ани' } };
const owner = { actor: { id: 'o1', fullName: 'Арам' } };
const seed = (): BarData => {
  const data = initialData();
  data.alcohol = [
    {
      ...data.alcohol.find((a) => a.unit !== 'bottle')!,
      id: 'vodka',
      name: 'Водка',
      category: 'alcohol',
      pricePerLiter: 9000,
    },
    { ...data.alcohol[0], id: 'lime', name: 'Лайм', unit: 'ml', category: 'mixer' },
  ];
  data.cocktails = [
    {
      id: 'mule',
      name: 'Мул',
      price: 2000,
      image: 0,
      ingredients: [
        { alcoholId: 'vodka', ml: 50 },
        { alcoholId: 'lime', ml: 20 },
      ],
    },
  ];
  data.sales = [];
  let next = data;
  for (const [alcoholId, ml] of [
    ['vodka', 1000],
    ['lime', 1000],
  ] as const)
    next = applyCommand(next, {
      type: 'purchase',
      id: `buy-${alcoholId}`,
      value: { id: `p-${alcoholId}`, alcoholId, ml, costPerLiter: 3000, date: '2026-09-01' },
    });
  return applyCommand(
    next,
    { type: 'saveTable', id: 't', value: { id: 'table-1', name: '1', order: 1, active: true } },
    owner,
  );
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const lines = [
  { kind: 'cocktail' as const, productId: 'mule', quantity: 2 },
  { kind: 'alcohol' as const, productId: 'vodka', quantity: 100 },
];
const total = 2 * 2000 + 100 * 9;

describe('addLines', () => {
  it('opens the table receipt and writes every line with stable ids', () => {
    const data = applyCommand(
      seed(),
      { type: 'addLines', id: 'rep-1', tableId: 'table-1', lines, expectedTotal: total },
      worker,
    );
    const order = openOrderAt(data.orders, 'table-1')!;
    expect(order.id).toBe('rep-1');
    expect(orderLines(data.sales, order.id).map((s) => s.id)).toEqual(['rep-1_0', 'rep-1_1']);
    expect(orderTotal(orderLines(data.sales, order.id))).toBe(total);
    expect(stock(data, 'vodka')).toBe(1000 - 100 - 100);
    expect(validateData(data)).toBe(data);
  });

  it('is idempotent: the same command id changes nothing', () => {
    const command = {
      type: 'addLines' as const,
      id: 'rep-2',
      tableId: 'table-1',
      lines,
      expectedTotal: total,
    };
    const once = applyCommand(seed(), command, worker);
    expect(applyCommand(once, command, worker)).toBe(once);
    expect(once.sales).toHaveLength(2);
  });

  it('adds to the open receipt of the table instead of opening another', () => {
    const open = applyCommand(seed(), { type: 'openOrder', id: 'o-1', tableId: 'table-1' }, worker);
    const data = applyCommand(
      open,
      { type: 'addLines', id: 'rep-3', tableId: 'table-1', lines: [lines[0]], expectedTotal: 4000 },
      worker,
    );
    expect(data.orders).toHaveLength(1);
    expect(orderLines(data.sales, 'o-1')).toHaveLength(1);
    const byOrder = applyCommand(
      data,
      { type: 'addLines', id: 'rep-4', orderId: 'o-1', lines: [lines[0]], expectedTotal: 4000 },
      worker,
    );
    expect(orderLines(byOrder.sales, 'o-1')).toHaveLength(2);
  });

  it('refuses the whole set when a price changed, without a partial write', () => {
    const before = seed();
    const repriced = applyCommand(
      before,
      { type: 'cocktail', id: 'price', value: { ...before.cocktails[0], price: 2500 } },
      owner,
    );
    expect(() =>
      applyCommand(
        repriced,
        { type: 'addLines', id: 'rep-5', tableId: 'table-1', lines, expectedTotal: total },
        worker,
      ),
    ).toThrow('Цены изменились');
    expect(repriced.sales).toHaveLength(0);
  });

  it('refuses a missing item, missing stock and a closed shift', () => {
    const data = seed();
    expect(() =>
      applyCommand(
        data,
        {
          type: 'addLines',
          id: 'r6',
          tableId: 'table-1',
          lines: [{ kind: 'cocktail', productId: 'nope', quantity: 1 }],
          expectedTotal: 1,
        },
        worker,
      ),
    ).toThrow();
    expect(() =>
      applyCommand(
        data,
        {
          type: 'addLines',
          id: 'r7',
          tableId: 'table-1',
          lines: [{ kind: 'alcohol', productId: 'vodka', quantity: 5000 }],
          expectedTotal: 45000,
        },
        worker,
      ),
    ).toThrow('Недостаточно');
    expect(() =>
      applyCommand(
        data,
        { type: 'addLines', id: 'r8', tableId: 'table-1', lines: [], expectedTotal: 1 },
        worker,
      ),
    ).toThrow('Проверьте набор');
    // More lines than a receipt set allows: refused before anything is written.
    const many = Array.from({ length: 21 }, () => ({ ...lines[1], quantity: 10 }));
    expect(() =>
      applyCommand(
        data,
        { type: 'addLines', id: 'r10', tableId: 'table-1', lines: many, expectedTotal: 21 * 90 },
        worker,
      ),
    ).toThrow('Проверьте набор');
    const twenty = applyCommand(
      data,
      { type: 'addLines', id: 'r11', tableId: 'table-1', lines: many.slice(0, 20), expectedTotal: 20 * 90 },
      worker,
    );
    expect(twenty.sales.filter((s) => s.orderId === 'r11')).toHaveLength(20);
    const closed = {
      ...data,
      shifts: [
        {
          id: 's',
          businessDay: '2026-09-12',
          closedAt: '2026-09-12T20:00:00Z',
          count: 0,
          revenue: 0,
          payments: {},
          countedCash: 0,
          difference: 0,
        },
      ],
    };
    expect(() =>
      applyCommand(
        closed,
        { type: 'addLines', id: 'r9', tableId: 'table-1', lines: [lines[0]], expectedTotal: 4000 },
        worker,
      ),
    ).toThrow('Смена закрыта');
  });
});

describe('repeatDraft', () => {
  const past = [
    { kind: 'cocktail' as const, productId: 'mule', name: 'Мул', quantity: 1 },
    { kind: 'cocktail' as const, productId: 'mule', name: 'Мул', quantity: 2 },
    { kind: 'alcohol' as const, productId: 'vodka', name: 'Водка', quantity: 100 },
    { kind: 'cocktail' as const, productId: 'gone', name: 'Старый', quantity: 1 },
  ];
  it("groups the previous set and uses today's price and stock", () => {
    const data = seed();
    const repriced = applyCommand(
      data,
      { type: 'cocktail', id: 'p', value: { ...data.cocktails[0], price: 2500 } },
      owner,
    );
    const draft = repeatDraft(past, ownerCatalog(repriced, stockTotals(repriced)));
    expect(draft.map((l) => [l.productId, l.quantity, l.unitPrice, l.status])).toEqual([
      ['mule', 3, 2500, 'ok'],
      ['vodka', 100, 9, 'ok'],
      ['gone', 0, 0, 'removed'],
    ]);
    expect(draftTotal(draft)).toBe(3 * 2500 + 900);
    expect(draftCommandLines(draft)).toHaveLength(2);
  });
  it('reduces to what is left and drops what is out of stock', () => {
    let data = seed();
    // 1000 ml vodka / 50 ml = 20 portions.
    data = applyCommand(
      data,
      {
        type: 'addLines',
        id: 'big',
        lines: [{ kind: 'cocktail', productId: 'mule', quantity: 10 }],
        expectedTotal: 20000,
      },
      worker,
    );
    const draft = repeatDraft([{ ...past[0], quantity: 5 }], ownerCatalog(data, stockTotals(data)));
    expect(draft[0]).toMatchObject({ quantity: 5, status: 'ok' });
    data = applyCommand(
      data,
      {
        type: 'addLines',
        id: 'big2',
        lines: [{ kind: 'cocktail', productId: 'mule', quantity: 8 }],
        expectedTotal: 16000,
      },
      worker,
    );
    const reduced = repeatDraft([{ ...past[0], quantity: 20 }], ownerCatalog(data, stockTotals(data)));
    expect(reduced[0]).toMatchObject({ quantity: 2, status: 'reduced' });
    data = applyCommand(
      data,
      {
        type: 'addLines',
        id: 'big3',
        lines: [{ kind: 'cocktail', productId: 'mule', quantity: 2 }],
        expectedTotal: 4000,
      },
      worker,
    );
    expect(repeatDraft([past[0]], ownerCatalog(data, stockTotals(data)))[0]).toMatchObject({
      quantity: 0,
      status: 'unavailable',
    });
  });
  it('reads the worker catalog', () => {
    const lookup = staffCatalog([
      {
        id: 'mule',
        kind: 'cocktail',
        name: 'Мул',
        category: 'cocktail',
        price: 2000,
        available: 0,
        ready: true,
      },
      {
        id: 'vodka',
        kind: 'alcohol',
        name: 'Водка',
        category: 'alcohol',
        price: 9,
        available: 500,
        ready: true,
      },
    ]);
    const draft = repeatDraft(past.slice(0, 3), lookup);
    expect(draft.map((l) => [l.productId, l.quantity, l.status])).toEqual([
      ['mule', 0, 'unavailable'],
      ['vodka', 100, 'ok'],
    ]);
  });
});

describe('favorites', () => {
  it('keeps a clean unique list and rejects malformed keys', () => {
    expect(cleanFavorites(['cocktail:a', 'cocktail:a', 'alcohol:b'])).toEqual(['cocktail:a', 'alcohol:b']);
    expect(cleanFavorites(['bad'])).toBeNull();
    expect(cleanFavorites('x')).toBeNull();
    expect(cleanFavorites(Array.from({ length: 61 }, (_, i) => `cocktail:c${i}`))).toBeNull();
  });
  it('lets only an owner command mark the bar favourite', () => {
    const data = seed();
    const next = applyCommand(
      data,
      { type: 'setFavorite', id: 'f1', kind: 'cocktail', productId: 'mule', favorite: true },
      owner,
    );
    expect(next.cocktails[0].favorite).toBe(true);
    expect(validateData(next)).toBe(next);
    const off = applyCommand(
      next,
      { type: 'setFavorite', id: 'f2', kind: 'cocktail', productId: 'mule', favorite: false },
      owner,
    );
    expect(off.cocktails[0].favorite).toBeUndefined();
    expect(() =>
      applyCommand(
        data,
        { type: 'setFavorite', id: 'f3', kind: 'alcohol', productId: 'lime', favorite: true },
        owner,
      ),
    ).toThrow();
  });
});
