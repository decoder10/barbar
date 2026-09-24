import { describe, expect, it } from 'vitest';
import { batchConsumption, batchStock } from '../batches';
import { applyCommand, averageCost, initialData, stock, validateData } from '../model';
import { businessToday } from '../business-day';
import type { BarData, Command } from '../types';

const later = (days: number) =>
  new Date(Date.parse(`${businessToday()}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
let counter = 0;
const id = () => `c${++counter}`;

/** Vodka at 2 per ml, and a prepared output `prep` (a mixer) sold in a 100 ml cocktail. */
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
    { ...data.alcohol[0], id: 'prep', name: 'Заготовка', unit: 'ml', category: 'mixer' },
  ];
  data.cocktails = [
    { id: 'drink', name: 'Напиток', price: 900, image: 0, ingredients: [{ alcoholId: 'prep', ml: 100 }] },
  ];
  data.sales = [];
  return applyCommand(data, {
    type: 'purchase',
    id: id(),
    value: { id: id(), alcoholId: 'vodka', ml: 2000, costPerLiter: 2000, date: businessToday() },
  });
};
const prepare = (
  data: BarData,
  batch: string,
  vodka: number,
  quantity: number,
  days?: number,
  plan?: number,
) =>
  applyCommand(data, {
    type: 'prepare',
    id: batch,
    reason: `Партия ${batch}`,
    outputId: 'prep',
    quantity,
    ...(plan ? { plannedQuantity: plan } : {}),
    ingredients: [{ alcoholId: 'vodka', ml: vodka }],
    ...(days === undefined ? {} : { expiresOn: later(days) }),
  });
const sell = (data: BarData, quantity = 1, saleId = id()) =>
  applyCommand(data, {
    type: 'sale',
    id: saleId,
    value: { kind: 'cocktail', productId: 'drink', quantity, date: businessToday(), businessDay: true },
  });
/** A cheap batch (unit cost 1) that expires late and a dear one (unit cost 2) that expires first. */
const twoBatches = () => prepare(prepare(seed(), 'cheap', 200, 400, 20), 'dear', 400, 400, 5);

describe('cost of a prepared batch', () => {
  it('records plan, actual yield and loss, and values a unit by the actual yield', () => {
    const data = prepare(seed(), 'b1', 300, 500, 10, 600);
    expect(data.stockMovements![0]).toMatchObject({ outputQuantity: 500, plannedQuantity: 600 });
    const [item] = batchStock(data.stockMovements!, new Map([['prep', stock(data, 'prep')]]));
    expect(item.batches[0]).toMatchObject({
      produced: 500,
      planned: 600,
      loss: 100,
      cost: 600,
      unitCost: 1.2,
      remainingCost: 600,
    });
    expect(validateData(data)).toBe(data);
  });

  it('charges a portion the unit cost of the batch that leaves first (FEFO)', () => {
    const data = sell(twoBatches());
    // «dear» expires first: 100 ml × 2, not the weighted average of 1.5.
    expect(averageCost(twoBatches(), 'prep')).toBe(1500);
    expect(data.sales[0].cost).toBe(200);
    expect(data.sales[0].ingredients[0].batches).toEqual([{ id: 'dear', ml: 100, cost: 200 }]);
    expect(stock(data, 'prep')).toBe(700);
    expect(validateData(data)).toBe(data);
  });

  it('spans two batches and keeps the ledger cost exact', () => {
    let data = twoBatches();
    data = sell(data, 3); // 300 of dear
    data = sell(data, 2); // 100 of dear + 100 of cheap
    const last = data.sales[1];
    expect(last.cost).toBe(300);
    expect(last.ingredients[0].batches).toEqual([
      { id: 'dear', ml: 100, cost: 200 },
      { id: 'cheap', ml: 100, cost: 100 },
    ]);
    // What remains is 300 ml of the cheap batch.
    expect(stock(data, 'prep')).toBe(300);
    expect(averageCost(data, 'prep')).toBe(1000);
  });

  it('gives back exactly the stored quantity and cost when a sale is cancelled', () => {
    const sold = sell(twoBatches(), 3);
    const voided = applyCommand(sold, { type: 'void', id: id(), saleId: sold.sales[0].id });
    expect(stock(voided, 'prep')).toBe(800);
    expect(averageCost(voided, 'prep')).toBe(1500);
    // The next sale is charged as if the first never happened.
    expect(sell(voided).sales.at(-1)!.cost).toBe(200);
  });

  it('keeps average costing for items without batches and for legacy sales', () => {
    const data = applyCommand(seed(), {
      type: 'sale',
      id: id(),
      value: { kind: 'alcohol', productId: 'vodka', quantity: 100, date: businessToday(), businessDay: true },
    });
    expect(data.sales[0].cost).toBe(200);
    expect(data.sales[0].ingredients[0].batches).toBeUndefined();
  });

  it('takes the whole remaining cost when the balance is emptied', () => {
    let data = prepare(seed(), 'only', 300, 300, 10); // unit cost 2
    data = sell(sell(data, 2), 1);
    expect(stock(data, 'prep')).toBe(0);
    expect(data.sales.reduce((sum, s) => sum + s.cost, 0)).toBe(600);
  });

  it('spends stock the batches do not explain first, at its residual cost', () => {
    const data = applyCommand(prepare(seed(), 'b', 200, 200, 10), {
      type: 'purchase',
      id: id(),
      value: { id: id(), alcoholId: 'prep', ml: 100, costPerLiter: 500, date: businessToday() },
    });
    // 100 ml bought at 0.5 sit outside batches; they are used before the batch.
    expect(batchStock(data.stockMovements!, new Map([['prep', 300]]))[0].unassigned).toBe(100);
    const sold = sell(data);
    expect(sold.sales[0].cost).toBe(50);
    expect(sold.sales[0].ingredients[0].batches).toBeUndefined();
    expect(batchConsumption(data.stockMovements!, 'prep', { ml: 300, cost: 450 }, 150)).toMatchObject({
      cost: 50 + 50 * 2,
    });
  });
});

describe('batch write-off and yield correction', () => {
  it('writes off a chosen batch at its own unit cost and shrinks its capacity', () => {
    const data = twoBatches();
    const next = applyCommand(data, {
      type: 'writeoff',
      id: id(),
      reason: 'Испортилась',
      alcoholId: 'prep',
      quantity: 150,
      expected: 800,
      batchId: 'cheap',
    });
    expect(next.stockMovements!.at(-1)).toMatchObject({
      batchId: 'cheap',
      lines: [{ ml: -150, cost: -150 }],
    });
    const [item] = batchStock(next.stockMovements!, new Map([['prep', stock(next, 'prep')]]));
    expect(Object.fromEntries(item.batches.map((b) => [b.id, b.remaining]))).toEqual({
      dear: 400,
      cheap: 250,
    });
    expect(validateData(next)).toBe(next);
    expect(() =>
      applyCommand(next, {
        type: 'writeoff',
        id: id(),
        reason: 'ещё',
        alcoholId: 'prep',
        quantity: 300,
        expected: 650,
        batchId: 'cheap',
      }),
    ).toThrow('меньше');
    expect(() =>
      applyCommand(next, {
        type: 'writeoff',
        id: id(),
        reason: 'нет',
        alcoholId: 'prep',
        quantity: 1,
        expected: 650,
        batchId: 'missing',
      }),
    ).toThrow('Партия не найдена');
  });

  it('corrects the yield of an untouched batch only, keeping its cost', () => {
    const data = twoBatches();
    const next = applyCommand(data, {
      type: 'correctBatchYield',
      id: id(),
      batchId: 'cheap',
      expected: 400,
      actual: 350,
      reason: 'Взвесили',
    });
    expect(stock(next, 'prep')).toBe(750);
    expect(next.stockMovements!.find((m) => m.id === 'cheap')!.lines.at(-1)).toMatchObject({
      ml: 350,
      cost: 400,
    });
    expect(validateData(next)).toBe(next);
    expect(() =>
      applyCommand(data, {
        type: 'correctBatchYield',
        id: id(),
        batchId: 'cheap',
        expected: 999,
        actual: 1,
        reason: 'x',
      }),
    ).toThrow('Проверьте');
    // A batch that has been used cannot be corrected any more.
    const used = sell(sell(sell(sell(data, 4), 1))); // the dear batch is gone, one portion of cheap is out
    expect(() =>
      applyCommand(used, {
        type: 'correctBatchYield',
        id: id(),
        batchId: 'cheap',
        expected: 400,
        actual: 350,
        reason: 'x',
      }),
    ).toThrow('уже использована');
  });

  it('refuses the yield correction of a batch a sale drew from, even when FEFO shows it full', () => {
    let data = sell(prepare(seed(), 'first', 200, 400, 20)); // one portion from the only batch
    expect(data.sales[0].ingredients[0].batches).toEqual([{ id: 'first', ml: 100, cost: 100 }]);
    // A batch expiring earlier takes the use, so the balance now fills the first batch again.
    data = prepare(data, 'second', 400, 400, 5);
    const [item] = batchStock(data.stockMovements!, new Map([['prep', stock(data, 'prep')]]));
    expect(item.batches.find((b) => b.id === 'first')!.remaining).toBe(400);
    const correct: Command = {
      type: 'correctBatchYield',
      id: id(),
      batchId: 'first',
      expected: 400,
      actual: 350,
      reason: 'x',
    };
    expect(() => applyCommand(data, correct)).toThrow('уже использована');
    // Once the sale is cancelled the batch is untouched again.
    const voided = applyCommand(data, { type: 'void', id: id(), saleId: data.sales[0].id });
    expect(stock(applyCommand(voided, { ...correct, id: id() }), 'prep')).toBe(750);
  });

  it('caps a batch write-off at the balance cost when the balance and its batches disagree', () => {
    // The dear batch expires last, so after a shortage costed at the average the balance sits in it.
    const data = applyCommand(prepare(prepare(seed(), 'cheap', 200, 400, 5), 'dear', 400, 400, 20), {
      type: 'count',
      id: id(),
      reason: 'Пересчёт',
      lines: [{ alcoholId: 'prep', expected: 800, actual: 400 }],
    });
    const prepCost = (d: BarData) =>
      d
        .stockMovements!.flatMap((m) => m.lines)
        .filter((l) => l.alcoholId === 'prep')
        .reduce((sum, l) => sum + l.cost, 0);
    expect(prepCost(data)).toBe(600); // 400 ml at 1.5, while the dear batch costs 2 per ml
    const writeoff = (quantity: number) =>
      applyCommand(data, {
        type: 'writeoff',
        id: id(),
        reason: 'Испортилась',
        alcoholId: 'prep',
        quantity,
        expected: 400,
        batchId: 'dear',
      });
    // Emptying the item takes exactly the balance's cost: no negative remainder is left behind.
    const emptied = writeoff(400);
    expect(emptied.stockMovements!.at(-1)!.lines).toEqual([{ alcoholId: 'prep', ml: -400, cost: -600 }]);
    expect(stock(emptied, 'prep')).toBe(0);
    expect(prepCost(emptied)).toBe(0);
    expect(validateData(emptied)).toBe(emptied);
    // A part never costs more than the balance holds.
    expect(writeoff(350).stockMovements!.at(-1)!.lines[0].cost).toBe(-600);
    expect(writeoff(200).stockMovements!.at(-1)!.lines[0].cost).toBe(-400);
  });
});
