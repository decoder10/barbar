import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCommand, today } from '../../src/barbar/domain/model';
import type { Command, Role } from '../../src/barbar/domain/types';
import { fixtureData } from '../../tests/fixtures';
import { auth, handleBarApi, identity } from '../../tests/identity-fixture';
import { handleBatches } from './queries/batches';
import { handleReport } from './queries/report';
import { sessionCookie } from './barbar-auth';
import type { Repository } from './barbar-repository';

const origin = 'https://barbar.example';
function request(role: Role, command?: unknown) {
  return new Request(`${origin}/api/barbar`, {
    method: command ? 'POST' : 'GET',
    headers: { origin, cookie: sessionCookie(new Request(origin), role).split(';')[0] },
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
function noPrivateFinancialData(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    expect([
      'cost',
      'costPerLiter',
      'pricePerLiter',
      'glassPrice',
      'purchases',
      'extraCosts',
      'stockResets',
      'operations',
      'supplierId',
      'leadDays',
      'safetyDays',
      'safetyStock',
      'priceChanges',
      'suppliers',
      'batchSources',
      'batches',
      'plannedQuantity',
    ]).not.toContain(key);
    noPrivateFinancialData(item);
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
      noPrivateFinancialData(body);
      const saved = (await repo.read()).data;
      expect(body.staffData.products.find((p: { id: string }) => p.id === saved.cocktails[0].id).price).toBe(
        saved.cocktails[0].price,
      );
      expect(body.staffData.sales.at(-1).revenue).toBe(saved.sales.at(-1)!.revenue);
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
    'saveTable',
    'resetStock',
    'restore',
    'purge',
    'setFavorite',
    'saveSupplier',
    'removeSupplier',
    'correctBatchYield',
    'prepare',
    'writeoff',
    'unknown',
  ])('forbids staff command %s before reading the ledger', async (type) => {
    const repo = repository();
    const read = vi.spyOn(repo, 'read');
    const result = await handleBarApi(request('barbar', { id: 'forbidden', type }), repo);
    expect(result.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(repo.commit).not.toHaveBeenCalled();
  });
  it('lets staff remove only a line of an open receipt', async () => {
    const repo = repository();
    const sale = (await repo.read()).data.sales.find((s) => !s.voided)!;
    const refused = await handleBarApi(
      request('barbar', { id: 'void-plain', type: 'removeLine', saleId: sale.id }),
      repo,
    );
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toContain('открытого заказа');
    expect(repo.commit).not.toHaveBeenCalled();
    expect((await handleBarApi(request('barbar', { id: 'order-1', type: 'openOrder' }), repo)).status).toBe(
      200,
    );
    const line = {
      id: 'line-1',
      type: 'sale',
      value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-10', orderId: 'order-1' },
    };
    expect((await handleBarApi(request('barbar', line), repo)).status).toBe(200);
    const voided = await handleBarApi(
      request('barbar', { id: 'void-line', type: 'removeLine', saleId: 'line-1' }),
      repo,
    );
    expect(voided.status).toBe(200);
    const data = (await repo.read()).data;
    expect(data.sales.find((s) => s.id === 'line-1')?.voided).toBe(true);
    expect(data.orders?.[0]).toMatchObject({ id: 'order-1', status: 'open', openedBy: { id: 'barbar' } });
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
      noPrivateFinancialData(body);
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
  it('lets staff edit existing ingredients while preserving prices, expenses and historical records', async () => {
    const repo = repository();
    const before = structuredClone((await repo.read()).data);
    const recipe = before.cocktails[0];
    const command = {
      type: 'updateRecipe',
      id: 'edit-staff-recipe',
      cocktailId: recipe.id,
      ingredients: [
        { alcoholId: 'gin', ml: 60, cost: 999 },
        { alcoholId: 'tonic', ml: 150 },
      ],
      notes: 'Добавить лёд и перемешать.',
      expected: { ingredients: recipe.ingredients, notes: recipe.notes || '' },
      price: 1,
      name: 'Forged',
      extraCosts: [],
      stockAlcoholId: 'vodka',
    };
    for (let retry = 0; retry < 2; retry++) {
      const response = await handleBarApi(request('barbar', command), repo);
      expect(response.status).toBe(200);
      const body = await response.json();
      noPrivateFinancialData(body);
      expect(body.staffData.recipes.find((c: { id: string }) => c.id === recipe.id)).toMatchObject({
        editable: true,
        name: recipe.name,
        managedIngredientIds: ['soda'],
        ingredients: [
          { alcoholId: 'gin', ml: 60 },
          { alcoholId: 'tonic', ml: 150 },
        ],
      });
    }
    const after = (await repo.read()).data;
    expect(after.cocktails[0]).toEqual({
      ...recipe,
      ingredients: [
        { alcoholId: 'gin', ml: 60 },
        { alcoholId: 'tonic', ml: 150 },
      ],
      notes: command.notes,
    });
    expect(after.sales).toEqual(before.sales);
    expect(after.purchases).toEqual(before.purchases);
    expect(after.alcohol).toEqual(before.alcohol);
    expect(repo.commit).toHaveBeenCalledTimes(1);
    const stale = await handleBarApi(request('barbar', { ...command, id: 'stale' }), repo);
    expect(stale.status).toBe(400);
    expect(repo.commit).toHaveBeenCalledTimes(1);
  });
  it('rejects staff edits to bottle stock links and invalid ingredient ids', async () => {
    const repo = repository();
    const before = await repo.read();
    const next = applyCommand(before.data, {
      id: 'new-bottle',
      type: 'alcohol',
      value: {
        id: 'test-lager',
        name: 'Test lager',
        category: 'beer',
        unit: 'bottle',
        costPerLiter: 500,
        pricePerLiter: 1000,
        color: '#123456',
      },
    });
    await repo.commit(before, next);
    const bottle = next.cocktails.find((c) => c.stockAlcoholId === 'test-lager')!;
    const result = await handleBarApi(
      request('barbar', {
        type: 'updateRecipe',
        id: 'change-bottle',
        cocktailId: bottle.id,
        ingredients: [{ alcoholId: 'test-lager', ml: 2 }],
        notes: '',
        expected: { ingredients: bottle.ingredients, notes: '' },
      }),
      repo,
    );
    expect(result.status).toBe(400);
    expect((await repo.read()).data).toEqual(next);
    const recipe = next.cocktails[0];
    const invalid = await handleBarApi(
      request('barbar', {
        type: 'updateRecipe',
        id: 'invalid-recipe',
        cocktailId: recipe.id,
        ingredients: [{ alcoholId: 'not-an-ingredient', ml: 50 }],
        notes: '',
        expected: { ingredients: recipe.ingredients, notes: recipe.notes || '' },
      }),
      repo,
    );
    expect(invalid.status).toBe(400);
    expect((await repo.read()).data).toEqual(next);
  });
});

it('unchanged revisions skip full ledger reads, but a role change forces a fresh safe snapshot', async () => {
  const repo = repository();
  repo.readRevision = vi.fn(async () => 'test');
  const read = vi.spyOn(repo, 'read');
  const req = request('barbar');
  req.headers.set('X-Barbar-Revision', 'test');
  req.headers.set('X-Barbar-Role', 'barbar');
  expect(await (await handleBarApi(req, repo)).json()).toEqual({
    unchanged: true,
    role: 'barbar',
    revision: 'test',
  });
  expect(read).not.toHaveBeenCalled();
  req.headers.set('X-Barbar-Role', 'admin');
  const body = await (await handleBarApi(req, repo)).json();
  expect(body.staffData).toBeDefined();
  expect(body.data).toBeUndefined();
  noPrivateFinancialData(body);
  expect(read).toHaveBeenCalledTimes(1);
});

it('serves worker guest requests and shift previews without ledger costs; range reports stay owner-only', async () => {
  const repo = repository();
  const data = (await repo.read()).data;
  repo.readGuestRequests = async () => [
    {
      id: 'a'.repeat(32),
      tableId: 'table',
      tableName: '1',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      status: 'pending',
      lines: [
        {
          id: 'line',
          kind: 'alcohol',
          productId: 'vodka',
          name: 'Vodka',
          unitPrice: 900,
          quantity: 1,
          servingMl: 50,
        },
      ],
      comment: '',
    },
  ];
  const get = (path: string) =>
    handleBarApi(
      new Request(origin + path, {
        headers: { cookie: sessionCookie(new Request(origin), 'barbar').split(';')[0] },
      }),
      repo,
    );
  const guests = await get('/api/barbar/guest-requests');
  expect(guests.status).toBe(200);
  noPrivateFinancialData(await guests.json());
  const day = await get('/api/barbar/shifts?from=2026-01-01');
  expect(day.status).toBe(200);
  expect(await day.json()).toMatchObject({ totals: { count: 0, revenue: 0 }, shifts: [] });
  expect((await get('/api/barbar/shifts?from=2026-01-01&to=2026-01-02')).status).toBe(403);
  const close = await handleBarApi(
    request('barbar', {
      id: 'close-shift',
      type: 'closeShift',
      businessDay: '2026-01-01',
      expected: '[]',
      countedCash: 0,
    }),
    repo,
  );
  expect(close.status).toBe(200);
  noPrivateFinancialData(await close.json());
  expect(data.sales.length).toBeGreaterThan(0);
});

describe('repeating an order and the owner-only reports', () => {
  it('lets staff repeat a set in one command and read only their own receipts, without costs', async () => {
    const repo = repository();
    const data = (await repo.read()).data;
    data.alcohol[0] = { ...data.alcohol[0], supplierId: 'opt', leadDays: 3, safetyDays: 2, safetyStock: 100 };
    data.suppliers = [{ id: 'opt', name: 'Опт', leadDays: 3 }];
    data.priceChanges = [];
    const command = {
      id: 'repeat',
      type: 'addLines',
      lines: [{ kind: 'alcohol', productId: 'vodka', quantity: 100 }],
      expectedTotal: 0,
    };
    // A wrong expected total is refused as a whole.
    expect((await handleBarApi(request('barbar', command), repo)).status).toBe(400);
    const price = data.alcohol.find((a) => a.id === 'vodka')!.pricePerLiter / 10;
    const ok = await handleBarApi(request('barbar', { ...command, expectedTotal: price }), repo);
    expect(ok.status).toBe(200);
    const body = await ok.json();
    noPrivateFinancialData(body);
    const saved = (await repo.read()).data;
    const order = saved.orders!.find((o) => o.id === 'repeat')!;
    expect(order).toMatchObject({ status: 'open', openedBy: { id: 'barbar' } });
    // Retrying the same command id changes nothing.
    expect((await handleBarApi(request('barbar', { ...command, expectedTotal: price }), repo)).status).toBe(
      200,
    );
    expect((await repo.read()).data.sales.filter((s) => s.orderId === 'repeat')).toHaveLength(1);
    const pay = await handleBarApi(
      request('barbar', {
        id: 'pay',
        type: 'payOrder',
        orderId: 'repeat',
        expectedTotal: price,
        payments: [{ method: 'cash', amount: price }],
      }),
      repo,
    );
    expect(pay.status).toBe(200);
    const get = (role: Role, path: string) =>
      handleBarApi(
        new Request(origin + path, {
          headers: { cookie: sessionCookie(new Request(origin), role).split(';')[0] },
        }),
        repo,
      );
    const recent = await get('barbar', '/api/barbar/orders/recent?scope=mine');
    expect(recent.status).toBe(200);
    const list = await recent.json();
    expect(list.orders.map((o: { id: string }) => o.id)).toEqual(['repeat']);
    expect(list.orders[0].lines[0]).toMatchObject({ productId: 'vodka', revenue: price });
    noPrivateFinancialData(list);
    expect(JSON.stringify(list)).not.toContain('payments');
    // Someone else's receipts are not reachable: the scope follows the session, not a parameter.
    expect((await (await get('admin', '/api/barbar/orders/recent?scope=mine')).json()).orders).toEqual([]);
    expect((await get('barbar', '/api/barbar/orders/recent?scope=table')).status).toBe(400);
    expect((await get('barbar', '/api/barbar/orders/recent?scope=mine&limit=500')).status).toBe(400);
    // No purchasing parameters, suppliers or price history in any worker read.
    noPrivateFinancialData(await (await get('barbar', '/api/barbar')).json());
    noPrivateFinancialData(await (await get('barbar', '/api/barbar/catalog')).json());
  });
  it('answers the comparison and price history routes to the owner only', async () => {
    const users = { ...identity };
    const db = {} as never;
    const call = (path: string, token?: string) =>
      handleReport(
        new Request(origin + path, {
          headers: token ? { cookie: sessionCookie(new Request(origin), token as Role).split(';')[0] } : {},
        }),
        db,
        users,
      );
    for (const path of [
      '/api/barbar/report/compare?from=2026-09-01&to=2026-09-07&baseFrom=2026-08-01&baseTo=2026-08-07',
      '/api/barbar/prices',
    ]) {
      expect((await call(path)).status).toBe(401);
      expect((await call(path, 'barbar')).status).toBe(403);
    }
    // Batches answer before any database access: staff get 403, anonymous callers 401.
    const batches = (token?: string) =>
      handleBatches(
        new Request(origin + '/api/barbar/batches', {
          headers: token ? { cookie: sessionCookie(new Request(origin), token as Role).split(';')[0] } : {},
        }),
        db,
        users,
      );
    expect((await batches()).status).toBe(401);
    expect((await batches('barbar')).status).toBe(403);
  });
});
