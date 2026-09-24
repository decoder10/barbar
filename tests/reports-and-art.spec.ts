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

test('owner compares periods, reads the price history and sets purchasing parameters', async ({ page }) => {
  const day = (offset: number) =>
    new Date(Date.parse(`${businessToday()}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const monthStart = `${businessToday().slice(0, 7)}-01`;
  let data = fixtureData();
  // Stock bought long ago, so sales can be dated in the previous period.
  data.purchases = data.purchases.map((p) => ({ ...p, date: day(-90) }));
  const gin = data.cocktails[0];
  const sell = (id: string, date: string, quantity: number) => {
    data = applyCommand(data, {
      id,
      type: 'sale',
      value: { kind: 'cocktail', productId: gin.id, quantity, date },
    });
  };
  sell('now-1', businessToday(), 3);
  const before = new Date(Date.parse(`${monthStart}T00:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10);
  sell('base-1', before, 2);
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar', async (route) => {
    if (route.request().method() === 'POST')
      data = applyCommand(data, route.request().postDataJSON().command);
    await route.fulfill({ json: { data, role: 'admin', revision: String(data.operations.length) } });
  });
  const window = (from: string, to: string, revenue: number, units: number) => ({
    from,
    to,
    days: 7,
    salesDays: 4,
    workedDays: 5,
    availableDays: 5,
    operations: units,
    units,
    revenue,
    cost: revenue / 4,
    grossProfit: revenue - revenue / 4,
    averagePrice: revenue / units,
  });
  await page.route('**/api/barbar/prices*', (route) =>
    route.fulfill({
      json: {
        trackingSince: '2026-09-24',
        changes: [
          {
            id: 'change-1',
            date: day(-10),
            createdAt: `${day(-10)}T10:00:00.000Z`,
            kind: 'cocktail',
            productId: gin.id,
            name: gin.name,
            field: 'price',
            from: 2000,
            to: 2200,
            actor: { id: 'admin', fullName: 'Арам' },
            windows: {
              length: 7,
              before: window(day(-17), day(-11), 8000, 4),
              after: window(day(-9), day(-3), 8800, 4),
            },
          },
        ],
      },
    }),
  );
  await page.goto('/reports');
  const comparison = page.locator('.comparison-panel');
  await expect(comparison.getByRole('heading', { name: 'Сравнение периодов' })).toBeVisible();
  await expect(comparison).toContainText('не доказывает причину');
  const totals = comparison.getByRole('table', { name: 'Итоги двух периодов' });
  await expect(totals.locator('tbody tr').first()).toContainText('6 600');
  await expect(totals.locator('tbody tr').first()).toContainText('4 400');
  // 3 against 2 portions at an unchanged price: the whole +2 200 is volume.
  const parts = comparison.getByRole('table', { name: 'Из чего сложилось изменение выручки' });
  await expect(parts.getByRole('row').filter({ hasText: /^Количество/ })).toContainText('+2 200');
  await expect(parts.getByRole('row').filter({ hasText: /^Изменение выручки/ })).toContainText('+2 200');
  await expect(comparison.getByRole('table', { name: 'По дням недели' })).toBeVisible();
  await expect(comparison.getByRole('table', { name: 'По часам (время Еревана)' })).toBeVisible();
  await expect(comparison.getByRole('table', { name: 'По категориям' })).toContainText('Коктейли');
  const history = page.locator('.price-history');
  await expect(history).toContainText('История ведётся с');
  await expect(history).toContainText('2 000 ֏ → 2 200 ֏');
  await history.locator('summary').first().click();
  const windows = history.getByRole('table', { name: 'Продажи до и после изменения цены' });
  await expect(windows).toContainText('8 000');
  await expect(windows).toContainText('8 800');
  await expect(windows).toContainText('5 / 5');
  // Purchasing parameters: a supplier with a lead time, linked to the gin.
  await page.getByRole('button', { name: 'Параметры закупок' }).click();
  const sheet = page.getByRole('dialog');
  const newSupplier = sheet.locator('.supplier-row').last();
  await newSupplier.getByLabel('Название поставщика').fill('Опт');
  await newSupplier.getByLabel('Срок поставки, дней').fill('5');
  await newSupplier.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect.poll(() => data.suppliers?.map((s) => [s.name, s.leadDays])).toEqual([['Опт', 5]]);
  await sheet.getByLabel('Поиск позиции').fill('Gin');
  const item = sheet.locator('.item-row').first();
  const itemName = (await item.locator('strong').innerText()).trim();
  await item.getByRole('combobox').selectOption({ label: 'Опт' });
  await item.getByRole('button', { name: 'Сохранить' }).click();
  await expect.poll(() => data.alcohol.find((a) => a.name === itemName)?.supplierId).toBeTruthy();
  await sheet.getByRole('button', { name: 'Закрыть' }).click();
  const purchasing = page.locator('.purchasing-table');
  await expect(purchasing.locator('.purchasing-group').first()).toContainText('Опт');
  const lead = purchasing.getByRole('row').filter({ hasText: itemName }).first();
  await expect(lead).toContainText('5 дн.');
  await expect(lead).toContainText('у поставщика');
  await purchasing.locator('tbody').first().locator('summary').first().click();
  await expect(purchasing.locator('.purchasing-formula').first()).toContainText('(5 +');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
