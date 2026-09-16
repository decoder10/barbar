import { test, expect } from '@playwright/test';
import { fixtureData } from './fixtures';
import { compactData } from '../netlify/lib/barbar-working';
import { publicCatalogPart, publicStock } from '../netlify/lib/barbar-sync';
import { staffData } from '../netlify/lib/barbar-access';
import { applyCommand } from '../src/barbar/domain/model';
import { cardPage, parseCardQueries } from '../src/barbar/domain/catalog/cards';
import type { Command } from '../src/barbar/domain/types';
for (const role of ['admin', 'barbar'] as const) {
  test(`${role}: catalog cached across sales, stock refresh and navigation; edited catalog reloaded`, async ({
    page,
  }) => {
    let data = fixtureData(),
      revision = 's1',
      catalogRevision = 'c1';
    let catalogCalls = 0,
      historyCalls = 0,
      reportCalls = 0,
      writes = 0;
    const state = () =>
      publicStock({ revision, catalogRevision, stock: compactData(data).opening!.ingredients }, role);
    await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role } }));
    await page.route('**/api/barbar/catalog/*', (r) => {
      const url = new URL(r.request().url());
      if (url.pathname.endsWith('/cards')) {
        // Card pages are ordered IDs over the loaded catalog; they are not catalog reloads.
        const stock = new Map(compactData(data).opening!.ingredients.map((b) => [b.alcoholId, b.ml]));
        const pages = parseCardQueries(url.searchParams).map((query) => cardPage(data, stock, query));
        return r.fulfill({
          json: {
            ...(url.searchParams.has('resources') ? { pages } : pages[0]),
            catalogRevision,
            revision,
            role,
          },
        });
      }
      catalogCalls++;
      return r.fulfill({
        json: publicCatalogPart(
          { catalogRevision, data },
          role,
          r.request().url().endsWith('/alcohol') ? 'alcohol' : 'cocktails',
        ),
      });
    });
    await page.route('**/api/barbar/report?*', (r) => {
      reportCalls++;
      return r.fulfill({ status: 500, json: { error: 'Should not load here' } });
    });
    await page.route('**/api/barbar/history?*', (r) => {
      historyCalls++;
      return r.fulfill({
        json: {
          rows: role === 'admin' ? data.sales : staffData(data).sales,
          total: data.sales.length,
          groups: [],
          nextCursor: null,
        },
      });
    });
    await page.route('**/api/barbar', (r) => {
      expect(r.request().headers()['x-barbar-protocol']).toBe('2');
      if (r.request().method() === 'POST') {
        const { command } = r.request().postDataJSON() as { command: Command };
        const before = compactData(data).opening!.ingredients;
        const baseRevision = revision;
        data = applyCommand(data, command);
        revision = `s${++writes + 1}`;
        const current = state();
        const changed = current.stock!.filter(
          (b) => b.ml !== before.find((p) => p.alcoholId === b.alcoholId)!.ml,
        );
        const saved = role === 'admin' ? data.sales.at(-1) : staffData(data).sales.at(-1);
        const payload = { ...current, stock: changed, partial: true, baseRevision, sale: saved };
        expect(changed).toHaveLength(2);
        expect(JSON.stringify(payload).length).toBeLessThan(3000);
        if (role === 'barbar')
          expect(JSON.stringify(payload)).not.toMatch(/"(?:cost|extraCosts|costPerLiter)"/);
        return r.fulfill({ json: payload });
      }
      return r.fulfill({
        json:
          r.request().headers()['x-barbar-revision'] === revision
            ? { role, revision, catalogRevision, unchanged: true }
            : state(),
      });
    });
    await page.goto('/');
    await page.getByPlaceholder('Найти напиток…').fill('Gin tonic Beefeater');
    await expect.poll(() => historyCalls).toBe(1);
    expect(catalogCalls).toBe(2);
    await page.locator('.drink-card').first().click();
    await page.getByRole('button', { name: 'Записать продажу', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => historyCalls).toBe(2);
    expect(catalogCalls).toBe(2);
    await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Обновить данные', exact: true })).toBeEnabled();
    expect(catalogCalls).toBe(2);
    expect(historyCalls).toBe(2);
    await page.getByRole('link', { name: /Меню и рецепты/ }).click();
    await expect(page).toHaveURL(/cocktails/);
    await expect(page.locator('.day-receipt')).toHaveCount(0);
    const historyBefore = historyCalls;
    data.cocktails[0].name = 'Updated catalog cocktail';
    catalogRevision = 'c2';
    revision = 's3';
    await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
    await expect.poll(() => catalogCalls).toBe(4);
    await expect(page.getByText('Updated catalog cocktail', { exact: true }).first()).toBeVisible();
    expect(historyCalls).toBe(historyBefore);
    expect(reportCalls).toBe(0);
    if (role === 'barbar') await expect(page.locator('#content')).not.toContainText(/Себестоимость|Прибыль/);
  });
}

test('warehouse histories wait until their section approaches the viewport', async ({ page }) => {
  const data = fixtureData();
  const collections: string[] = [];
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar/catalog/*', (r) =>
    r.fulfill({
      json: publicCatalogPart(
        { catalogRevision: 'c1', data },
        'admin',
        r.request().url().endsWith('/alcohol') ? 'alcohol' : 'cocktails',
      ),
    }),
  );
  await page.route('**/api/barbar', (r) =>
    r.fulfill({
      json: publicStock(
        { revision: 's1', catalogRevision: 'c1', stock: compactData(data).opening!.ingredients },
        'admin',
      ),
    }),
  );
  await page.route('**/api/barbar/history?*', (r) => {
    collections.push(new URL(r.request().url()).searchParams.get('collection')!);
    return r.fulfill({ json: { rows: [], total: 0, nextCursor: null } });
  });
  await page.goto('/inventory');
  await expect(page.locator('.inventory-table tbody tr').first()).toBeVisible();
  expect(collections).toEqual([]);
  await page.getByRole('heading', { name: 'История закупок', exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(() => collections.slice().sort()).toEqual(['purchases', 'stockResets']);
});
