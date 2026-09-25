import { expect, test } from '@playwright/test';
import { fixtureData } from './fixtures';
import { staffData } from '../netlify/lib/barbar-access';

test('owner filters survive refresh and navigation, while another tab starts fresh', async ({
  page,
  context,
}) => {
  const data = fixtureData();
  await context.route('**/api/barbar/auth', (r) =>
    r.fulfill({ json: { authenticated: true, role: 'admin' } }),
  );
  await context.route('**/api/barbar', (r) =>
    r.fulfill({ json: { data, role: 'admin', revision: 'filters' } }),
  );
  await page.goto('/sales');
  await page.getByRole('button', { name: 'Пиво', exact: true }).click();
  await page.getByPlaceholder('Найти напиток…').fill('379');
  await page.getByLabel('Сортировка', { exact: true }).selectOption('name-desc');
  await page.getByLabel('Дата продаж', { exact: true }).fill('2026-08-20');
  await page.reload();
  await expect(page.getByLabel('Дата продаж', { exact: true })).toHaveValue('2026-08-20');
  await expect(page.getByRole('button', { name: 'Пиво', exact: true })).toHaveClass(/active/);
  await expect(page.getByPlaceholder('Найти напиток…')).toHaveValue('379');
  await expect(page.getByLabel('Сортировка', { exact: true })).toHaveValue('name-desc');
  await page.goto('/reports');
  const monthPicker = page.getByRole('button', { name: /Месяц отчёта/ });
  await monthPicker.click();
  const months = page.getByRole('dialog', { name: 'Месяц отчёта' });
  while ((await months.locator('.date-picker-head strong').textContent()) !== '2026')
    await months.getByRole('button', { name: 'Предыдущий год' }).click();
  await months.getByRole('button', { name: /^Август 2026/ }).click();
  await expect(months).toBeHidden();
  await expect(monthPicker).toBeFocused();
  await page.getByLabel('Показатель рейтинга').selectOption('quantity');
  await page.getByLabel('Целевая маржа', { exact: true }).selectOption('60');
  await page.reload();
  await expect(monthPicker).toHaveAttribute('data-value', '2026-08');
  await expect(page.getByLabel('Показатель рейтинга')).toHaveValue('quantity');
  await expect(page.getByLabel('Целевая маржа', { exact: true })).toHaveValue('60');
  await page.goto('/sales');
  await expect(page.getByPlaceholder('Найти напиток…')).toHaveValue('379');
  const other = await context.newPage();
  await other.goto('/sales');
  await expect(other.getByPlaceholder('Найти напиток…')).toHaveValue('');
  // A fresh tab opens on the default order: the most sold items first.
  await expect(other.getByLabel('Сортировка', { exact: true })).toHaveValue('popular');
});

test('worker stock remembers missing items, category, search, sort and grid', async ({ page }) => {
  const data = fixtureData();
  data.purchases = [];
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'barbar' } }));
  await page.route('**/api/barbar', (r) =>
    r.fulfill({ json: { staffData: staffData(data), role: 'barbar', revision: 'filters' } }),
  );
  await page.goto('/inventory');
  // Tabs follow product groups present in stock.
  await page.getByRole('button', { name: 'Фрукты и ягоды', exact: true }).click();
  await page.getByRole('button', { name: 'Нет в наличии', exact: true }).click();
  await page.getByRole('button', { name: 'Сетка', exact: true }).click();
  await page.getByPlaceholder('Найти на полке…').fill('Лимон');
  await page.getByLabel('Сортировка', { exact: true }).selectOption('name');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Фрукты и ягоды', exact: true })).toHaveClass(/active/);
  await expect(page.getByRole('button', { name: 'Нет в наличии', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Сетка', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByPlaceholder('Найти на полке…')).toHaveValue('Лимон');
  await expect(page.getByLabel('Сортировка', { exact: true })).toHaveValue('name');
  await expect(page.locator('main')).not.toContainText('֏');
});

test('filters are isolated by identity and cleared on logout without clearing other session data', async ({
  page,
}) => {
  const data = fixtureData();
  let userId = 'owner-a';
  let authenticated = true;
  await page.route('**/api/barbar/auth', (r) => {
    if (r.request().method() === 'DELETE') authenticated = false;
    return r.fulfill({
      json: {
        authenticated,
        role: authenticated ? 'admin' : null,
        user: authenticated ? { id: userId, fullName: userId, role: 'owner' } : null,
      },
    });
  });
  await page.route('**/api/barbar', (r) => r.fulfill({ json: { data, role: 'admin', revision: 'filters' } }));
  await page.goto('/sales');
  await page.getByPlaceholder('Найти напиток…').fill('Gin');
  userId = 'owner-b';
  await page.reload();
  await expect(page.getByPlaceholder('Найти напиток…')).toHaveValue('');
  userId = 'owner-a';
  await page.reload();
  await expect(page.getByPlaceholder('Найти напиток…')).toHaveValue('Gin');
  await page.evaluate(() => sessionStorage.setItem('unrelated', 'keep'));
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.locator('.login-form-wrap form')).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith('barbar-session-filters:')),
    ),
  ).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem('unrelated'))).toBe('keep');
});
