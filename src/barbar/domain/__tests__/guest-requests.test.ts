import { describe, expect, it } from 'vitest';
import { initialData, applyCommand, stock } from '../model';
import {
  acceptGuestRequest,
  guestRequestStatus,
  quoteGuestRequest,
  type GuestRequest,
  type GuestRequestInput,
} from '../guest-requests';

const input: GuestRequestInput = {
  id: 'a'.repeat(32),
  code: 'b'.repeat(32),
  comment: 'Без льда',
  lines: [{ id: 'line-1', kind: 'alcohol', productId: 'vodka', servingMl: 50, quantity: 2 }],
};
function fixture() {
  let data = initialData();
  data = applyCommand(data, {
    id: 'table',
    type: 'saveTable',
    value: { id: 'table', name: '1', active: true, order: 1 },
  });
  data.tables![0].code = input.code;
  data = applyCommand(data, {
    id: 'stock',
    type: 'purchase',
    value: { id: 'stock', alcoholId: 'vodka', date: '2026-01-01', ml: 150, costPerLiter: 1000 },
  });
  const request: GuestRequest = {
    id: input.id,
    tableId: 'table',
    tableName: '1',
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    lines: quoteGuestRequest(data, input),
    comment: input.comment,
  };
  return { data, request };
}
describe('guest requests', () => {
  it('uses server prices and never mutates stock on submission; acceptance uses the existing sale path', () => {
    const { data, request } = fixture();
    const before = JSON.stringify(data);
    const lines = quoteGuestRequest(data, {
      ...input,
      lines: input.lines.map((l) => ({ ...l, unitPrice: 1, cost: 0 })),
    });
    expect(lines[0].unitPrice).toBeGreaterThan(1);
    expect(JSON.stringify(data)).toBe(before);
    const result = acceptGuestRequest(data, request, ['line-1'], {});
    expect(result.data.sales).toHaveLength(1);
    expect(result.data.sales[0].quantity).toBe(100);
    expect(result.data.sales[0].revenue).toBe(lines[0].unitPrice * 2);
    expect(stock(result.data, 'vodka')).toBe(50);
    expect(() => acceptGuestRequest(result.data, result.request, ['line-1'], {})).toThrow(/обработана/);
  });
  it.each([0, 11, 1.5, NaN])('rejects invalid portions %s', (quantity) => {
    expect(() =>
      quoteGuestRequest(initialData(), { ...input, lines: [{ ...input.lines[0], quantity }] }),
    ).toThrow();
  });
  it('rejects too many lines, duplicate IDs, long comments, arbitrary volumes and hidden products', () => {
    const { data } = fixture();
    for (const bad of [
      { ...input, lines: Array.from({ length: 21 }, (_, i) => ({ ...input.lines[0], id: String(i) })) },
      { ...input, lines: [input.lines[0], input.lines[0]] },
      { ...input, comment: 'x'.repeat(201) },
      { ...input, lines: [{ ...input.lines[0], servingMl: 100 }] },
      { ...input, lines: [{ ...input.lines[0], servingMl: undefined }] },
    ])
      expect(() => quoteGuestRequest(data, bad)).toThrow();
    data.alcohol.find((a) => a.id === 'vodka')!.guestHidden = true;
    expect(() => quoteGuestRequest(data, input)).toThrow(/недоступны/);
  });
  it('checks expiry without TTL deletion, and rejects stale prices', () => {
    const { data, request } = fixture();
    expect(guestRequestStatus({ ...request, expiresAt: new Date(0).toISOString() })).toBe('expired');
    for (const status of ['accepted', 'rejected', 'expired'] as const)
      expect(() => acceptGuestRequest(data, { ...request, status }, ['line-1'], {})).toThrow();
    expect(() =>
      acceptGuestRequest(data, { ...request, expiresAt: new Date(0).toISOString() }, ['line-1'], {}),
    ).toThrow();
    data.alcohol.find((a) => a.id === 'vodka')!.pricePerLiter += 100;
    expect(() => acceptGuestRequest(data, request, ['line-1'], {})).toThrow(/Цены изменились/);
  });
  it('makes partial acceptance final and leaves no partial mutations when stock runs out', () => {
    const { data, request } = fixture();
    request.lines.push({ ...request.lines[0], id: 'line-2' });
    const before = JSON.stringify(data);
    expect(() => acceptGuestRequest(data, request, ['line-1', 'line-2'], {})).toThrow(/Недостаточно/);
    expect(JSON.stringify(data)).toBe(before);
    const partial = acceptGuestRequest(data, request, ['line-2'], {});
    expect(partial.request.acceptedLineIds).toEqual(['line-2']);
    expect(partial.data.sales).toHaveLength(1);
    expect(() => acceptGuestRequest(partial.data, partial.request, ['line-1'], {})).toThrow();
  });
});

it('keeps the bottle and glass IDs distinct when the guest menu groups their prices', () => {
  const data = initialData();
  data.alcohol.push({
    id: 'testwine',
    name: 'Test wine',
    category: 'wine',
    unit: 'bottle',
    bottleSizeMl: 750,
    glassSizeMl: 150,
    glassPrice: 200,
    pricePerLiter: 1000,
    costPerLiter: 500,
    color: '#123456',
  });
  data.cocktails.push(
    {
      id: 'wine-bottle',
      name: 'Test wine · бутылка',
      category: 'wine',
      stockAlcoholId: 'testwine',
      serving: 'bottle',
      price: 1000,
      image: 0,
      ingredients: [{ alcoholId: 'testwine', ml: 1 }],
    },
    {
      id: 'wine-glass',
      name: 'Test wine · бокал',
      category: 'wine',
      stockAlcoholId: 'testwine',
      serving: 'glass',
      price: 200,
      image: 0,
      ingredients: [{ alcoholId: 'testwine', ml: 0.2 }],
    },
  );
  const bottle = quoteGuestRequest(data, {
    ...input,
    lines: [{ id: 'bottle', kind: 'cocktail', productId: 'wine-bottle', quantity: 1 }],
  });
  const glass = quoteGuestRequest(data, {
    ...input,
    lines: [{ id: 'glass', kind: 'cocktail', productId: 'wine-glass', quantity: 1, servingMl: 150 }],
  });
  expect(bottle[0].unitPrice).toBe(1000);
  expect(glass[0].unitPrice).toBe(200);
  expect(() =>
    quoteGuestRequest(data, {
      ...input,
      lines: [{ id: 'bottle', kind: 'cocktail', productId: 'wine-bottle', quantity: 1, servingMl: 150 }],
    }),
  ).toThrow();
});
