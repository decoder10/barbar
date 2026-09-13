import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import auth from '../functions/barbar-auth';
import { authenticated, sessionCookie } from './barbar-auth';
import { handleBarApi } from './barbar-handler';
import type { Repository } from './barbar-repository';
import { applyCommand, today } from '../../src/barbar/model';
import { fixtureData } from '../../tests/fixtures';
import type { Command, Role } from '../../src/barbar/types';

const origin = 'https://barbar.example';
function request(role: Role, command?: unknown) {
  return new Request(`${origin}/api/barbar`, {
    method: command ? 'POST' : 'GET',
    headers: { origin, cookie: sessionCookie(new Request(origin), false, role).split(';')[0] },
    ...(command ? { body: JSON.stringify({ command, revision: 'test' }) } : {}),
  });
}
function repository() {
  let data = fixtureData();
  data.cocktails[0].extraCosts = [{ alcoholId: 'soda', cost: 99 }];
  data = applyCommand(data, {
    type: 'sale',
    id: 'previous-sale',
    value: {
      kind: 'cocktail',
      productId: data.cocktails[0].id,
      date: today(),
      quantity: 1,
    },
  });
  const repo: Repository = {
    read: async () => ({ data, revision: 'test', days: {} }),
    commit: vi.fn(async (_, next) => {
      data = next;
      return { modified: true, revision: 'test' };
    }),
  };
  return repo;
}
function noFinancialData(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    expect([
      'cost',
      'costPerLiter',
      'price',
      'pricePerLiter',
      'glassPrice',
      'revenue',
      'purchases',
      'extraCosts',
      'stockResets',
      'operations',
    ]).not.toContain(key);
    noFinancialData(item);
  }
}
beforeEach(() => {
  vi.stubEnv('BARBAR_PASSWORD', 'staff-password-123');
  vi.stubEnv('BARBAR_ADMIN_PASSWORD', 'owner-password-123');
  vi.stubEnv('BARBAR_USERNAME', 'barbar');
  vi.stubEnv('BARBAR_ADMIN_USERNAME', 'admin');
});
afterEach(() => vi.unstubAllEnvs());

describe('role isolation', () => {
  it('signs the authenticated role and rejects tampering, expired and old cookies', async () => {
    for (const [username, password, role] of [
      ['barbar', 'staff-password-123', 'barbar'],
      ['admin', 'owner-password-123', 'admin'],
    ]) {
      const result = await auth(
        new Request(`${origin}/api/barbar/auth`, {
          method: 'POST',
          headers: { origin },
          body: JSON.stringify({ username, password }),
        }),
      );
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ authenticated: true, role });
      const cookie = result.headers.get('set-cookie')!;
      expect(authenticated(new Request(origin, { headers: { cookie } }))).toBe(role);
    }
    const staffCookie = sessionCookie(new Request(origin));
    expect(
      authenticated(new Request(origin, { headers: { cookie: staffCookie.replace('=barbar.', '=admin.') } })),
    ).toBeNull();
    expect(
      authenticated(new Request(origin, { headers: { cookie: staffCookie.replace(/\.\d+\./, '.1.') } })),
    ).toBeNull();
    expect(
      authenticated(new Request(origin, { headers: { cookie: staffCookie.replace('barbar.', '') } })),
    ).toBeNull();
    vi.stubEnv('BARBAR_PASSWORD', 'changed-password-123');
    expect(authenticated(new Request(origin, { headers: { cookie: staffCookie } }))).toBeNull();
  });
  it('does not grant admin access with the staff password or a client-supplied role', async () => {
    const result = await auth(
      new Request(`${origin}/api/barbar/auth`, {
        method: 'POST',
        headers: { origin },
        body: JSON.stringify({ username: 'admin', password: 'staff-password-123', role: 'admin' }),
      }),
    );
    expect(result.status).toBe(401);
  });
  it('returns only allowlisted staff fields on reads, writes, and idempotent retries', async () => {
    const repo = repository();
    const command: Command = {
      type: 'sale',
      id: 'new-staff-sale',
      value: {
        kind: 'cocktail',
        productId: (await repo.read()).data.cocktails[0].id,
        date: today(),
        quantity: 2,
      },
    };
    for (const req of [request('barbar'), request('barbar', command), request('barbar', command)]) {
      const result = await handleBarApi(req, repo);
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.data).toBeUndefined();
      expect(body.role).toBe('barbar');
      noFinancialData(body);
      expect(body.staffData.ingredients.find((a: { id: string }) => a.id === 'vodka')).toMatchObject({
        name: 'Vodka',
        available: 2000,
        unit: 'ml',
      });
    }
    expect(repo.commit).toHaveBeenCalledTimes(1);
    expect((await repo.read()).data.sales).toHaveLength(2);
    const owner = await (await handleBarApi(request('admin'), repo)).json();
    expect(owner.data.sales.at(-1).revenue).toBeGreaterThan(0);
    expect(owner.data.sales.at(-1).cost).toBeGreaterThan(0);
    expect(owner.data.purchases.length).toBeGreaterThan(0);
  });
  it.each([
    'alcohol',
    'cocktail',
    'purchase',
    'correctPurchase',
    'void',
    'resetStock',
    'restore',
    'purge',
    'unknown',
  ])('forbids staff command %s before reading the ledger', async (type) => {
    const repo = repository();
    const read = vi.spyOn(repo, 'read');
    const result = await handleBarApi(request('barbar', { id: 'forbidden', type }), repo);
    expect(result.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(repo.commit).not.toHaveBeenCalled();
  });
  it('lets staff create a recipe without money fields and cannot overwrite an existing item', async () => {
    const repo = repository();
    const command = {
      type: 'createCocktail',
      id: 'staff-created-recipe',
      value: {
        id: 'forged-product-id',
        name: 'Staff special',
        category: 'cocktail',
        image: 0,
        notes: 'Mix',
        price: 99999,
        extraCosts: [{ alcoholId: 'soda', cost: 900 }],
        ingredients: [{ alcoholId: 'vodka', ml: 50, cost: 777 }],
      },
    };
    for (let retry = 0; retry < 2; retry++) {
      const result = await handleBarApi(request('barbar', command), repo);
      expect(result.status).toBe(200);
      const body = await result.json();
      noFinancialData(body);
      expect(body.staffData.products.find((p: { id: string }) => p.id === command.id).ready).toBe(false);
    }
    expect(repo.commit).toHaveBeenCalledTimes(1);
    const current = await repo.read();
    const created = current.data.cocktails.find((c) => c.id === command.id)!;
    expect(created.price).toBe(0);
    expect(created.extraCosts).toBeUndefined();
    expect(created.ingredients).toEqual([{ alcoholId: 'vodka', ml: 50 }]);
    expect(created.name).toBe('Staff special');
    const existing = current.data.cocktails[0];
    const overwritten = await handleBarApi(request('barbar', { ...command, id: existing.id }), repo);
    expect(overwritten.status).toBe(400);
    expect((await repo.read()).data.cocktails[0]).toEqual(existing);
  });
  it('keeps origin checks for staff sales', async () => {
    const req = request('barbar', { id: 'sale', type: 'sale' });
    req.headers.set('origin', 'https://other.example');
    expect((await handleBarApi(req, repository())).status).toBe(403);
  });
});
