import { expect, test } from '@playwright/test';
import { staffData } from '../netlify/lib/barbar-access';
import { fixtureData } from './fixtures';

test('one auth request, user language persists, currency converts display only', async ({ page }) => {
  const data = fixtureData();
  let preferences = { language: 'ru', currency: 'AMD' };
  let authCalls = 0;
  await page.route('**/api/barbar/auth', async (route) => {
    if (route.request().method() === 'PATCH') preferences = route.request().postDataJSON();
    else authCalls++;
    await route.fulfill({
      json: {
        authenticated: true,
        role: 'admin',
        user: { id: 'owner', username: 'owner', fullName: 'Грач', role: 'owner', preferences },
      },
    });
  });
  await page.route('**/api/barbar/rates', (route) =>
    route.fulfill({
      json: {
        date: '2026-09-11',
        fetchedAt: '2026-09-14T08:00:00Z',
        amdPerUnit: { AMD: 1, USD: 400, EUR: 450, RUB: 4 },
      },
    }),
  );
  await page.route('**/api/barbar', (route) =>
    route.fulfill({ json: { data, role: 'admin', revision: 'pref-test' } }),
  );
  await page.goto('/');
  await expect(page.getByLabel('Язык', { exact: true })).toBeVisible();
  expect(authCalls).toBe(1);
  await page.getByLabel('Язык', { exact: true }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'What are we pouring?' })).toBeVisible();
  await page.getByLabel('Display currency', { exact: true }).selectOption('USD');
  await expect(page.locator('.drink-card').first()).toContainText('$');
  await page.reload();
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en');
  await expect(page.locator('.drink-card').first()).toContainText('$');
  await page.getByLabel('Language', { exact: true }).selectOption('hy');
  await expect(page.getByRole('heading', { name: 'Ի՞նչ ենք լցնում։' })).toBeVisible();
  expect(preferences).toEqual({ language: 'hy', currency: 'USD' });
  await page.screenshot({ path: '/tmp/barbar-armenian-final.png' });
  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Ցանց', exact: true }).click();
  await page.screenshot({ path: '/tmp/barbar-dark-final.png' });
});

test('worker has workflow sorting without monetary controls', async ({ page }) => {
  const data = fixtureData();
  await page.route('**/api/barbar/auth', (r) =>
    r.fulfill({
      json: { authenticated: true, role: 'barbar', user: { id: 'worker', fullName: 'Ника', role: 'worker' } },
    }),
  );
  await page.route('**/api/barbar', (r) =>
    r.fulfill({ json: { staffData: staffData(data), role: 'barbar', revision: 'staff-sort' } }),
  );
  await page.goto('/');
  await page.getByLabel('Сортировка', { exact: true }).selectOption('available');
  await expect(page.getByLabel('Сортировка', { exact: true })).toHaveValue('available');
  await expect(page.getByLabel('Валюта отображения', { exact: true })).toHaveCount(0);
  expect(
    await page.getByLabel('Сортировка', { exact: true }).locator('option').allTextContents(),
  ).not.toContain('Цена по возрастанию');
  await page.goto('/inventory');
  await expect(page.getByLabel('Сортировка', { exact: true })).toHaveValue('missing');
  await expect(page.getByRole('button', { name: 'Добавить закупку', exact: true })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('֏');
});
