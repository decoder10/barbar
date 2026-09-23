import { describe, expect, it } from 'vitest';
import { initialData } from '../../src/barbar/domain/model';
import type { GuestMenu } from '../../src/barbar/domain/guest-menu';
import { handleGuestMenu } from './guest-menu-handler';
import type { Repository } from './barbar-repository';

const repository = {
  readCatalog: async () => ({ catalogRevision: 'rev-9', data: initialData() }),
} as unknown as Repository;
describe('public guest menu route', () => {
  it('serves without a session, with a revision ETag and conditional 304', async () => {
    const response = await handleGuestMenu(new Request('https://barbar.test/api/menu'), repository);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('public');
    const etag = response.headers.get('etag')!;
    expect(etag).toContain('rev-9');
    const body = await response.json();
    expect(body.sections.length).toBeGreaterThan(3);
    const again = await handleGuestMenu(
      new Request('https://barbar.test/api/menu', { headers: { 'if-none-match': etag } }),
      repository,
    );
    expect(again.status).toBe(304);
  });
  it('marks each price available or not from stock, without quantities or costs', async () => {
    const data = initialData();
    const poured = data.alcohol.find((a) => a.category === 'alcohol' && a.pricePerLiter > 0)!;
    const stocked = {
      ...repository,
      readStock: async () => ({
        revision: 'ledger-4',
        catalogRevision: 'rev-9',
        // Only the poured drink is in stock; everything with a recipe is sold out.
        stock: [{ alcoholId: poured.id, ml: 700, cost: 123456 }],
      }),
    } as unknown as Repository;
    const response = await handleGuestMenu(new Request('https://barbar.test/api/menu'), stocked);
    expect(response.headers.get('etag')).toContain('ledger-4');
    const text = await response.text();
    expect(text).not.toMatch(/123456|"ml"|"cost"|"stock"/);
    const prices = (JSON.parse(text) as GuestMenu).sections.flatMap((s) => s.items.flatMap((i) => i.prices));
    expect(prices.every((p) => typeof p.available === 'boolean')).toBe(true);
    expect(prices.find((p) => p.productId === poured.id)?.available).toBe(true);
    expect(prices.some((p) => p.available === false)).toBe(true);
  });
  it('rejects writes', async () => {
    const response = await handleGuestMenu(
      new Request('https://barbar.test/api/menu', { method: 'POST', body: '{}' }),
      repository,
    );
    expect(response.status).toBe(405);
  });
});
