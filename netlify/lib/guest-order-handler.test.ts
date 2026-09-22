import { expect, it, vi } from 'vitest';
import { handleGuestOrder } from './guest-order-handler';
import { guestOrderStore, publicGuestRequest } from './guest-order-store';
import type { GuestRequest } from '../../src/barbar/domain/guest-requests';

const store = {
  table: vi.fn(async () => ({ id: 'table', name: '1' })),
  status: vi.fn(async () => null),
  pending: vi.fn(async () => []),
  submit: vi.fn(),
} as unknown as ReturnType<typeof guestOrderStore>;
it('resolves tables without authentication, never caches status and rejects wrong origin/invalid input', async () => {
  const response = await handleGuestOrder(
    new Request('https://bar.test/api/guest-order?code=abcdef123456'),
    store,
  );
  expect(await response.json()).toEqual({ table: { id: 'table', name: '1' } });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('netlify-cdn-cache-control')).toBe('no-store');
  const missing = await handleGuestOrder(new Request('https://bar.test/api/guest-order'), store);
  expect(missing.status).toBe(404);
  expect(missing.headers.get('cache-control')).toBe('no-store');
  const wrong = await handleGuestOrder(
    new Request('https://bar.test/api/guest-order', {
      method: 'POST',
      headers: { Origin: 'https://evil.test' },
      body: '{}',
    }),
    store,
  );
  expect(wrong.status).toBe(403);
  const invalid = await handleGuestOrder(
    new Request('https://bar.test/api/guest-order', {
      method: 'POST',
      headers: { Origin: 'https://bar.test' },
      body: '{',
    }),
    store,
  );
  expect(invalid.status).toBe(400);
  expect(store.submit).not.toHaveBeenCalled();
});
it('projects status explicitly and treats pending expired rows as expired even before TTL', () => {
  const row = {
    id: 'a'.repeat(32),
    tableId: 't',
    tableName: '1',
    createdAt: new Date(0).toISOString(),
    expiresAt: new Date(1).toISOString(),
    status: 'pending',
    lines: [],
    comment: '',
    accessCode: 'secret',
    cost: 100,
    orderId: 'internal',
    profit: 100,
  } as GuestRequest;
  const projection = publicGuestRequest(row);
  expect(projection.status).toBe('expired');
  expect(JSON.stringify(projection)).not.toMatch(/cost|secret|profit|orderId/);
});
