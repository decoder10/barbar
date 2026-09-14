import { describe, expect, it } from 'vitest';
import { levels, stockTransitions } from '../stock-alerts';
import { alertMessage } from '../message';
import { validateSubscription } from '../../../../../netlify/lib/notifications/subscriptions';
const quantities = (qty: number) =>
  levels([{ id: 'beer', name: 'Beer', unit: 'bottle', available: qty }], []);
describe('stock warning transitions', () => {
  it('warns only when crossing low/empty, re-arms after replenishment and ignores new catalog/initial zeros', () => {
    expect(stockTransitions([], quantities(0))).toEqual([]);
    expect(stockTransitions(quantities(4), quantities(3))[0].severity).toBe('low');
    expect(stockTransitions(quantities(3), quantities(2))).toEqual([]);
    expect(stockTransitions(quantities(2), quantities(0))[0].severity).toBe('empty');
    expect(stockTransitions(quantities(0), quantities(4))).toEqual([]);
    expect(stockTransitions(quantities(4), quantities(3))).toHaveLength(1);
  });
  it('uses three largest recipe portions without inventing a threshold for unconfigured ingredients', () => {
    const result = levels(
      [
        { id: 'gin', name: 'Gin', available: 100 },
        { id: 'salt', name: 'Salt', available: 200 },
      ],
      [{ ingredients: [{ alcoholId: 'gin', ml: 25 }] }, { ingredients: [{ alcoholId: 'gin', ml: 50 }] }],
    );
    expect(result.map((r) => r.threshold)).toEqual([150, 0]);
    expect(alertMessage({ ...quantities(0)[0], severity: 'empty' }, 'en')).toBe(
      'Out of stock: Beer · 0 btl.',
    );
  });
  it('rejects private/arbitrary push destinations and malformed keys', () => {
    const keys = { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) };
    for (const endpoint of [
      'https://127.0.0.1/x',
      'https://evil.test',
      'https://fcm.googleapis.com.evil.test/x',
      'https://user@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:444/x',
    ])
      expect(() => validateSubscription({ endpoint, keys })).toThrow();
    expect(
      validateSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/example', keys }).keys,
    ).toEqual(keys);
    expect(() => validateSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: {} })).toThrow();
  });
});
