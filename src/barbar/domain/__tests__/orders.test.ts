import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCommand, initialData, stock, validateData } from '../model';
import { changeDue, groupReceipt, orderLines, orderTotal, splitEvenly } from '../orders';
import type { BarData, Command } from '../types';

let counter = 0;
const id = () => `op-${++counter}`;
const actor = { id: 'worker-1', fullName: 'Ани' };
const owner = { actor: { id: 'owner-1', fullName: 'Арам' } };
const worker = { actor };
const buy = (data: BarData, alcoholId = 'vodka', ml = 1000) =>
  applyCommand(data, {
    type: 'purchase',
    id: id(),
    value: { id: id(), alcoholId, ml, costPerLiter: 4000, date: '2026-09-01' },
  });
const table = (data: BarData, name = '1', tableId = 'table-1', extra: Partial<Command> = {}) =>
  applyCommand(
    data,
    {
      type: 'saveTable',
      id: id(),
      value: { id: tableId, name, order: 1, active: true },
      ...extra,
    } as Command,
    owner,
  );
const open = (data: BarData, tableId?: string, orderId = id(), context = worker) =>
  applyCommand(data, { type: 'openOrder', id: orderId, tableId }, context);
const line = (data: BarData, orderId: string, quantity = 50, saleId = id()) =>
  applyCommand(
    data,
    {
      type: 'sale',
      id: saleId,
      value: { kind: 'alcohol', productId: 'vodka', quantity, date: '2026-09-01', orderId },
    },
    worker,
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('tables', () => {
  it('creates a table with a stable QR code and reissues it only on request', () => {
    const first = table(initialData());
    const code = first.tables![0].code;
    expect(code).toMatch(/^[a-z0-9]{32}$/);
    const renamed = table(first, 'Терраса');
    expect(renamed.tables![0]).toMatchObject({ name: 'Терраса', code });
    const reissued = table(renamed, 'Терраса', 'table-1', { newCode: true });
    expect(reissued.tables![0].code).not.toBe(code);
  });
  it('rejects duplicate names and disabling a table with an open receipt', () => {
    const data = table(table(initialData()), '2', 'table-2');
    expect(() => table(data, ' 1 ', 'table-3')).toThrow('уже есть');
    const busy = open(data, 'table-1');
    expect(() =>
      applyCommand(busy, {
        type: 'saveTable',
        id: id(),
        value: { id: 'table-1', name: '1', order: 1, active: false },
      }),
    ).toThrow('открытый заказ');
  });
});

describe('receipts', () => {
  it('opens one receipt per table, records who opened it and the business day', () => {
    const data = open(table(initialData()), 'table-1', 'order-1');
    expect(data.orders![0]).toMatchObject({
      id: 'order-1',
      tableId: 'table-1',
      status: 'open',
      businessDay: '2026-09-12',
      openedBy: actor,
    });
    expect(() => open(data, 'table-1')).toThrow('уже есть открытый заказ');
    expect(() => open(data, 'missing')).toThrow('Стол не найден');
    expect(open(data).orders).toHaveLength(2);
  });
  it('adds lines as ordinary sales of the current shift and deducts stock at once', () => {
    let data = open(buy(table(initialData())), 'table-1', 'order-1');
    data = line(data, 'order-1', 50, 'sale-1');
    expect(stock(data, 'vodka')).toBe(950);
    expect(data.sales.at(-1)).toMatchObject({ id: 'sale-1', orderId: 'order-1', date: '2026-09-12' });
    expect(orderTotal(orderLines(data.sales, 'order-1'))).toBe(900);
    expect(() => line(data, 'order-9')).toThrow('Заказ не найден');
  });
  it('removes a line only from an open receipt; a plain sale is voided by the owner command', () => {
    let data = line(open(buy(table(initialData())), 'table-1', 'order-1'), 'order-1', 50, 'sale-1');
    data = applyCommand(data, { type: 'removeLine', id: id(), saleId: 'sale-1' }, worker);
    expect(data.sales.find((s) => s.id === 'sale-1')?.voided).toBe(true);
    expect(stock(data, 'vodka')).toBe(1000);
    const plain = applyCommand(buy(initialData()), {
      type: 'sale',
      id: 'plain',
      value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-10' },
    });
    expect(() => applyCommand(plain, { type: 'removeLine', id: id(), saleId: 'plain' }, worker)).toThrow(
      'владельцу',
    );
    expect(applyCommand(plain, { type: 'void', id: id(), saleId: 'plain' }, owner).sales[0].voided).toBe(
      true,
    );
  });
  it('pays a receipt only for the exact total and keeps the payments', () => {
    let data = line(open(buy(table(initialData())), 'table-1', 'order-1'), 'order-1', 50);
    data = line(data, 'order-1', 100);
    const total = orderTotal(orderLines(data.sales, 'order-1'));
    expect(total).toBe(2700);
    const pay = (
      payments: { method: string; amount: number; receivedCash?: number }[],
      expectedTotal = total,
    ) =>
      applyCommand(data, { type: 'payOrder', id: id(), orderId: 'order-1', expectedTotal, payments }, worker);
    expect(() => pay([{ method: 'cash', amount: 2700 }], 2000)).toThrow('изменился');
    expect(() => pay([{ method: 'cash', amount: 2000 }])).toThrow('не совпадает');
    expect(() => pay([{ method: 'gold', amount: 2700 }])).toThrow('способы');
    expect(() => pay([{ method: 'card', amount: 2700, receivedCash: 3000 }])).toThrow('способы');
    expect(() => pay([{ method: 'cash', amount: 2700, receivedCash: 2000 }])).toThrow('способы');
    const paid = pay([
      { method: 'cash', amount: 1700, receivedCash: 2000 },
      { method: 'idram', amount: 1000 },
    ]);
    expect(paid.orders![0]).toMatchObject({
      status: 'paid',
      total: 2700,
      closedBy: actor,
      payments: [
        { method: 'cash', amount: 1700, receivedCash: 2000 },
        { method: 'idram', amount: 1000 },
      ],
    });
    expect(paid.orders![0].payments![0].receivedCash).toBe(2000);
    expect(paid.orders![0].payments![1].receivedCash).toBeUndefined();
    expect(() => line(paid, 'order-1')).toThrow('уже закрыт');
    expect(() => pay([{ method: 'cash', amount: 2700 }])).not.toThrow();
    expect(validateData({ ...paid, opening: undefined })).toBeTruthy();
  });
  it('refuses to pay an empty receipt and cancels a receipt by returning every line', () => {
    let data = open(buy(table(initialData())), 'table-1', 'order-1');
    expect(() =>
      applyCommand(data, { type: 'payOrder', id: id(), orderId: 'order-1', expectedTotal: 1, payments: [] }),
    ).toThrow('нет позиций');
    data = line(line(data, 'order-1', 50), 'order-1', 50);
    expect(stock(data, 'vodka')).toBe(900);
    const cancelled = applyCommand(data, { type: 'cancelOrder', id: id(), orderId: 'order-1' }, worker);
    expect(cancelled.orders![0]).toMatchObject({ status: 'cancelled', closedBy: actor });
    expect(cancelled.sales.filter((s) => s.orderId === 'order-1').every((s) => s.voided)).toBe(true);
    expect(stock(cancelled, 'vodka')).toBe(1000);
    expect(open(cancelled, 'table-1').orders).toHaveLength(2);
  });
  it('keeps retries idempotent for every receipt command', () => {
    const data = line(open(buy(table(initialData())), 'table-1', 'order-1'), 'order-1', 50, 'sale-1');
    expect(applyCommand(data, { type: 'openOrder', id: 'order-1', tableId: 'table-1' })).toBe(data);
    const pay: Command = {
      type: 'payOrder',
      id: 'pay-1',
      orderId: 'order-1',
      expectedTotal: 900,
      payments: [{ method: 'card', amount: 900 }],
    };
    const paid = applyCommand(data, pay);
    expect(applyCommand(paid, pay)).toBe(paid);
  });
  it('validates tables and receipts in a backup', () => {
    const data = line(open(buy(table(initialData())), 'table-1', 'order-1'), 'order-1');
    expect(validateData(JSON.parse(JSON.stringify(data)))).toBeTruthy();
    expect(() => validateData({ ...data, tables: [{ ...data.tables![0], code: 'x' }] })).toThrow('столы');
    expect(() => validateData({ ...data, orders: [{ ...data.orders![0], status: 'lost' }] })).toThrow(
      'заказы',
    );
    expect(() => validateData({ ...data, orders: [] })).toThrow('неизвестный заказ');
  });
});

describe('receipt helpers', () => {
  it('groups lines by product and serving, keeping the latest sale for removal', () => {
    const lines = [
      { id: 'a', kind: 'cocktail', productId: 'x', name: 'X', quantity: 1, revenue: 100 },
      { id: 'b', kind: 'cocktail', productId: 'x', name: 'X', quantity: 2, revenue: 200 },
      { id: 'c', kind: 'alcohol', productId: 'v', name: 'V', quantity: 50, revenue: 900 },
    ] as const;
    const groups = groupReceipt([...lines]);
    expect(groups.map((g) => [g.name, g.quantity, g.revenue, g.latest.id])).toEqual([
      ['X', 3, 300, 'b'],
      ['V', 50, 900, 'c'],
    ]);
  });
  it('splits evenly without losing a dram and computes the change', () => {
    expect(splitEvenly(1000, 3)).toEqual([333.33, 333.33, 333.34]);
    expect(splitEvenly(2700, 2)).toEqual([1350, 1350]);
    expect(changeDue({ amount: 1700, receivedCash: 2000 })).toBe(300);
    expect(changeDue({ amount: 1700 })).toBe(0);
  });
});
