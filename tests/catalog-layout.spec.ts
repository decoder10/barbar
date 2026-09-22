import { expect, test } from '@playwright/test';
import { migrateBottleCatalog } from '../src/barbar/domain/catalog/bottles';
import { fixtureData } from './fixtures';

test('fluid warehouse grid, readable filters, stable product art and scroll-locked dialogs', async ({
  page,
}) => {
  const data = migrateBottleCatalog(fixtureData());
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar', (r) =>
    r.fulfill({ json: { data, role: 'admin', revision: 'layout-test' } }),
  );
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Сетка', exact: true }).click();
  await expect(page.locator('.inventory-grid-view')).toBeVisible();
  for (const width of [390, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const box = await page.locator('.page-content').boundingBox();
    if (width === 2560) expect(box!.width).toBeGreaterThan(2100);
  }
  const filter = page.locator('.inventory-categories button').first();
  expect(await filter.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
  await page.getByRole('button', { name: 'Новый напиток', exact: true }).click();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Сетка', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto('/sales');
  const art = page.locator('.drink-card .card-image').first();
  await art.scrollIntoViewIfNeeded();
  const before = await art.boundingBox();
  await art.hover();
  await page.waitForTimeout(250);
  const after = await art.boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  await page.getByRole('button', { name: 'Настойки', exact: true }).click();
  await expect(page.locator('.tincture-composition').first()).toBeVisible();
  await expect(page.locator('.tincture-fruit').first()).toHaveAttribute('src', /plum/);
  await page.screenshot({ path: '/tmp/barbar-tinctures-final.png', fullPage: false });
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Пиво', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '/tmp/barbar-inventory-final.png', fullPage: false });
});
