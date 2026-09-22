import { expect, test } from '@playwright/test';
import { fixtureData, mockOrders } from './fixtures';
import { applyCommand } from '../src/barbar/domain/model';
import { businessToday } from '../src/barbar/domain/business-day';

test('monthly analytics, pricing scenarios and cohesive set photographs', async ({ page }) => {
  let data = fixtureData();
  for (let i = 0; i < 10; i++)
    data = applyCommand(data, {
      id: `report-${i}`,
      type: 'sale',
      value: { kind: 'cocktail', productId: data.cocktails[0].id, quantity: 1, date: businessToday() },
    });
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar', (r) =>
    r.fulfill({ json: { data, role: 'admin', revision: 'report-art' } }),
  );
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Лидеры продаж' })).toBeVisible();
  await expect(page.locator('input[type=month]')).toHaveValue(businessToday().slice(0, 7));
  await expect(page.locator('.price-advice-panel')).toContainText(data.cocktails[0].name);
  await page.getByLabel('Целевая маржа', { exact: true }).selectOption('60');
  await page.getByLabel('Показатель рейтинга').selectOption('quantity');
  await expect(page.locator('.ranking-row').first()).toContainText('10 порц.');
  await page.screenshot({ path: '/tmp/barbar-reports-final.png', fullPage: true });
  await page.goto('/sales');
  await page.getByRole('button', { name: 'Сеты', exact: true }).click();
  await expect(page.locator('.set-photo img')).toHaveCount(4);
  for (const [i, n] of [6, 10, 16, 32].entries()) {
    await expect(page.locator('.set-photo img').nth(i)).toHaveAttribute(
      'src',
      new RegExp(`shot-set-${n}\\.webp`),
    );
    expect(
      await page
        .locator('.set-photo')
        .nth(i)
        .evaluate((e) => getComputedStyle(e).backgroundImage),
    ).toBe('none');
  }
  await page.screenshot({ path: '/tmp/barbar-sets-final.png' });
});

test('legacy wine glasses always show ml and explain missing stock configuration', async ({ page }) => {
  let data = fixtureData();
  const wine = data.cocktails.find(
    (c) => c.category === 'wine' && /бокал/.test(c.name) && !c.stockAlcoholId,
  )!;
  expect(wine).toBeTruthy();
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar', (r) => {
    if (r.request().method() === 'POST') data = applyCommand(data, r.request().postDataJSON().command);
    return r.fulfill({ json: { data, role: 'admin', revision: `legacy-glass-${data.operations.length}` } });
  });
  await mockOrders(page, () => data);
  await page.goto('/sales');
  await page.getByRole('button', { name: 'Вино', exact: true }).click();
  await page
    .locator('.drink-card')
    .filter({ has: page.getByRole('heading', { name: wine.name, exact: true }) })
    .click();
  await expect(page.getByLabel('Объём одного бокала, мл')).toBeVisible();
  await page.getByLabel('Объём одного бокала, мл').fill('200');
  await expect(page.getByRole('button', { name: 'Записать продажу', exact: true })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Настроить бутылку на складе' })).toBeVisible();
});
