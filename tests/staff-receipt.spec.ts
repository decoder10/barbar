import { expect, test } from '@playwright/test';
import { staffData } from '../netlify/lib/barbar-access';
import { businessToday } from '../src/barbar/domain/business-day';
import { applyCommand } from '../src/barbar/domain/model';
import { fixtureData } from './fixtures';
test('worker sees one grouped summary, no operation history and no money', async ({ page }) => {
  let data = fixtureData();
  for (let i = 0; i < 2; i++)
    data = applyCommand(data, {
      id: `sale-${i}`,
      type: 'sale',
      value: { kind: 'cocktail', productId: data.cocktails[0].id, quantity: 1, date: businessToday() },
    });
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'barbar' } }),
  );
  await page.route('**/api/barbar', (route) =>
    route.fulfill({ json: { role: 'barbar', staffData: staffData(data), revision: 'test' } }),
  );
  await page.goto('/');
  const receipt = page.getByRole('complementary', { name: 'Сводка продаж за день' });
  await expect(receipt.getByText(data.cocktails[0].name, { exact: true })).toHaveCount(1);
  await expect(receipt.getByRole('button', { name: 'История операций' })).toHaveCount(0);
  await expect(receipt).not.toContainText(/֏|AMD|цена|выручка|стоимость/i);
  await expect(page.getByText('День смены: 06:00–05:59 · Ереван')).toBeVisible();
  await page.screenshot({ path: '/tmp/barbar-staff-receipt.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
