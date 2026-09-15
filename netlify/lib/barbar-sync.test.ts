import { MongoClient, type CommandStartedEvent } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureData } from '../../tests/fixtures';
import { handleBarApi } from '../../tests/identity-fixture';
import { mongoRepository } from './barbar-mongo';
import { businessToday } from '../../src/barbar/domain/business-day';
import type { Command } from '../../src/barbar/domain/types';
const uri = process.env.BARBAR_TEST_MONGODB_URI;
describe.skipIf(!uri)('split catalog and stock API in isolated MongoDB', () => {
  if (uri && !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):/.test(uri))
    throw new Error('Local test URI required');
  const client = new MongoClient(uri || 'mongodb://127.0.0.1:27017', { monitorCommands: true });
  const db = client.db(`barbar_test_sync_${crypto.randomUUID().replaceAll('-', '')}`);
  let fixture = fixtureData();
  fixture.purchases.forEach((p) => {
    p.date = '2025-01-01';
  });
  const repo = mongoRepository(client, db, async () => fixture);
  const request = (
    path = '/api/barbar',
    role = 'admin',
    command?: Command,
    revision?: string,
    knownRole = role,
  ) =>
    new Request(`https://barbar.test${path}`, {
      method: command ? 'POST' : 'GET',
      headers: {
        cookie: `barbar_session=${role}`,
        origin: 'https://barbar.test',
        'X-Barbar-Protocol': '2',
        'X-Barbar-Role': knownRole,
        ...(revision ? { 'X-Barbar-Revision': revision, 'X-Barbar-Catalog-Revision': revision } : {}),
      },
      ...(command ? { body: JSON.stringify({ command, revision: revision || null }) } : {}),
    });
  const call = async (...args: Parameters<typeof request>) => {
    const response = await handleBarApi(request(...args), repo);
    expect(response.status).toBe(200);
    return response.json();
  };
  const sale = (id: string): Command => ({
    id,
    type: 'sale',
    value: { kind: 'cocktail', productId: fixture.cocktails[0].id, quantity: 1, date: businessToday() },
  });
  beforeAll(async () => {
    await client.connect();
    fixture = (await repo.read()).data;
  });
  afterAll(async () => {
    await db.dropDatabase();
    await client.close();
  });
  it('stock reads query only metadata and balances; unchanged reads only metadata', async () => {
    const finds: CommandStartedEvent[] = [];
    const listen = (e: CommandStartedEvent) => {
      if (e.commandName === 'find') finds.push(e);
    };
    client.on('commandStarted', listen);
    try {
      const first = await call();
      expect(first.stock).toHaveLength(fixture.alcohol.length);
      expect(first).not.toHaveProperty('data');
      expect(first).not.toHaveProperty('operations');
      expect(finds.map((e) => e.command.find)).toEqual(['state', 'stockBalances']);
      expect(finds[0].command.projection).not.toHaveProperty('operations');
      finds.length = 0;
      const same = await call('/api/barbar', 'admin', undefined, first.revision);
      expect(same).toMatchObject({ unchanged: true, catalogRevision: first.catalogRevision });
      expect(finds.map((e) => e.command.find)).toEqual(['state']);
    } finally {
      client.off('commandStarted', listen);
    }
  });
  it('serves a cached catalog with one revision read and keeps callers isolated', async () => {
    const first = await repo.readCatalog!();
    const commands: string[] = [];
    const listen = (event: CommandStartedEvent) => {
      commands.push(event.commandName);
    };
    client.on('commandStarted', listen);
    try {
      const cached = await repo.readCatalog!();
      expect(cached).toEqual(first);
      expect(commands).toEqual(['find']);
      cached.data!.cocktails[0].notes = 'must not poison cache';
      expect((await repo.readCatalog!()).data).toEqual(first.data);
    } finally {
      client.off('commandStarted', listen);
    }
  });
  it('reads and caches alcohol and cocktails separately, with safe worker responses', async () => {
    const finds: string[] = [];
    const listen = (e: CommandStartedEvent) => {
      if (e.commandName === 'find') finds.push(e.command.find);
    };
    client.on('commandStarted', listen);
    try {
      for (const resource of ['alcohol', 'cocktails'] as const) {
        finds.length = 0;
        const response = await call(`/api/barbar/catalog/${resource}`);
        expect(finds).toEqual(['state', resource]);
        expect(response[resource]).toEqual(fixture[resource]);
        expect(Object.keys(response).sort()).toEqual(
          ['catalogRevision', 'resource', 'role', resource].sort(),
        );
        finds.length = 0;
        const worker = await call(`/api/barbar/catalog/${resource}`, 'barbar');
        expect(finds).toEqual(['state']);
        expect(worker).not.toHaveProperty('alcohol');
        expect(worker).not.toHaveProperty('cocktails');
        expect(JSON.stringify(worker)).not.toMatch(/"(?:cost|costPerLiter|pricePerLiter|extraCosts)"/);
        expect(
          worker.products.every(
            (p: { kind: string }) => p.kind === (resource === 'alcohol' ? 'alcohol' : 'cocktail'),
          ),
        ).toBe(true);
        expect(
          (await call(`/api/barbar/catalog/${resource}`, 'admin', undefined, response.catalogRevision))
            .unchanged,
        ).toBe(true);
        expect(
          (await handleBarApi(request(`/api/barbar/catalog/${resource}`, 'admin', sale('forbidden')), repo))
            .status,
        ).toBe(405);
        expect(
          (await handleBarApi(new Request(`https://barbar.test/api/barbar/catalog/${resource}`), repo))
            .status,
        ).toBe(401);
      }
    } finally {
      client.off('commandStarted', listen);
    }
  });
  it('returns only changed balances and saved sale; preserves catalog version after a sale', async () => {
    const before = await call();
    const catalog = await call('/api/barbar/catalog');
    const result = await call('/api/barbar', 'admin', sale('delta-sale'), before.revision);
    expect(result.partial).toBe(true);
    expect(result.baseRevision).toBe(before.revision);
    expect(result.stock.map((b: { alcoholId: string }) => b.alcoholId).sort()).toEqual(['gin', 'tonic']);
    expect(result.sale.id).toBe('delta-sale');
    expect(result.sale.ingredients).toHaveLength(2);
    expect(result.catalogRevision).toBe(catalog.catalogRevision);
    expect(result).not.toHaveProperty('data');
    expect(result).not.toHaveProperty('operations');
    expect((await call('/api/barbar/catalog', 'admin', undefined, catalog.catalogRevision)).unchanged).toBe(
      true,
    );
    const repeated = await call('/api/barbar', 'admin', sale('delta-sale'), before.revision);
    expect(repeated.partial).not.toBe(true);
    expect(repeated.sale.id).toBe('delta-sale');
    expect(repeated.revision).toBe(result.revision);
    expect(await db.collection('sales').countDocuments()).toBe(1);
    expect(JSON.stringify(result).length).toBeLessThan(JSON.stringify(catalog).length / 5);
    console.log(
      JSON.stringify({
        catalogBytes: JSON.stringify(catalog).length,
        saleDeltaBytes: JSON.stringify(result).length,
        stockBytes: JSON.stringify(before).length,
      }),
    );
  });
  it('does not omit another device change when the command uses a stale revision', async () => {
    const before = await call();
    await call('/api/barbar', 'admin', sale('other-device'), before.revision);
    const result = await call('/api/barbar', 'admin', sale('stale-device'), before.revision);
    expect(result.partial).not.toBe(true);
    expect(result.stock).toHaveLength(fixture.alcohol.length);
    expect(result.stock.find((b: { alcoholId: string }) => b.alcoholId === 'gin').ml).toBe(1850);
  });
  it('invalidates catalog only for edits and consistently handles historical sales', async () => {
    const before = await call();
    const current = await repo.readWorking!();
    const cocktail = current.data.cocktails[0];
    await call(
      '/api/barbar',
      'admin',
      {
        id: 'edit-recipe',
        type: 'updateRecipe',
        cocktailId: cocktail.id,
        ingredients: cocktail.ingredients,
        notes: 'Updated',
        expected: { ingredients: cocktail.ingredients, notes: cocktail.notes || '' },
      },
      before.revision,
    );
    const catalog = await call('/api/barbar/catalog', 'admin', undefined, before.catalogRevision);
    expect(catalog.unchanged).not.toBe(true);
    expect(catalog.catalogRevision).not.toBe(before.catalogRevision);
    const cocktails = await call('/api/barbar/catalog/cocktails');
    const alcohol = await call('/api/barbar/catalog/alcohol');
    expect(cocktails.catalogRevision).toBe(catalog.catalogRevision);
    expect(alcohol.catalogRevision).toBe(catalog.catalogRevision);
    expect(cocktails.cocktails.find((c: { id: string }) => c.id === cocktail.id).notes).toBe('Updated');
    const now = await call();
    const past = sale('historical-sale');
    if (past.type === 'sale') past.value.date = '2026-01-01';
    const historical = await call('/api/barbar', 'admin', past, now.revision);
    // Historical sales use the incremental path with a chronological stock check, so the response is partial.
    expect(historical.partial).toBe(true);
    expect(historical.baseRevision).toBe(now.revision);
    expect(historical.sale.id).toBe('historical-sale');
    expect(historical.catalogRevision).toBe(catalog.catalogRevision);
  });
  it('worker catalog, stocks and sale allowlist exclude private costs, also across role changes', async () => {
    const owner = await call();
    const stock = await call('/api/barbar', 'barbar', undefined, owner.revision, 'admin');
    expect(stock.unchanged).not.toBe(true);
    const catalog = await call('/api/barbar/catalog', 'barbar', undefined, owner.catalogRevision, 'admin');
    const result = await call('/api/barbar', 'barbar', sale('worker-sale'), stock.revision);
    for (const response of [stock, catalog, result])
      expect(JSON.stringify(response)).not.toMatch(
        /"(?:cost|costPerLiter|pricePerLiter|operations|extraCosts)"/,
      );
    expect(result.sale.id).toBe('worker-sale');
    expect(result.sale).not.toHaveProperty('ingredients');
    expect((await handleBarApi(request('/api/barbar/catalog', 'unknown'), repo)).status).toBe(401);
    expect((await handleBarApi(request('/api/barbar/catalog', 'barbar', sale('invalid')), repo)).status).toBe(
      405,
    );
  });
});
