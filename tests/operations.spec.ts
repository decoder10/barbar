import { test, expect } from '@playwright/test';
import { fixtureData } from './fixtures';
import { applyCommand, stock } from '../src/barbar/domain/model';

test('owner records a count, write-off, preparation and expense from the operations screen', async ({
  page,
}) => {
  let data = fixtureData();
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar', async (route) => {
    if (route.request().method() === 'POST')
      data = applyCommand(data, route.request().postDataJSON().command);
    await route.fulfill({ json: { role: 'admin', data, revision: String(data.operations.length) } });
  });
  await page.goto('/operations');
  await page.getByRole('button', { name: 'Инвентаризация', exact: true }).click();
  await page.getByLabel('Позиция', { exact: true }).selectOption('vodka');
  await page.getByLabel(/Фактический остаток/).fill('1990');
  await page.getByLabel('Причина / комментарий').fill('Утренний пересчёт');
  await page.getByRole('button', { name: 'Сохранить операцию' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(stock(data, 'vodka')).toBe(1990);
  await page.getByRole('button', { name: 'Списание', exact: true }).click();
  await page.getByLabel('Позиция', { exact: true }).selectOption('vodka');
  await page.getByLabel(/Количество,/).fill('10');
  await page.getByLabel('Причина / комментарий').fill('Пролив');
  await page.getByRole('button', { name: 'Сохранить операцию' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(stock(data, 'vodka')).toBe(1980);
  await page.getByRole('button', { name: 'Заготовка', exact: true }).click();
  await page.getByLabel('Готовая заготовка на складе').selectOption('tonic');
  await page.getByLabel(/Фактический выход/).fill('100');
  await page.getByLabel('Ингредиент 1', { exact: true }).selectOption('vodka');
  await page.getByLabel(/Количество ингредиента 1/).fill('50');
  await page.getByLabel('Название партии', { exact: true }).fill('Тестовая партия');
  await page.getByRole('button', { name: 'Сохранить операцию' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(stock(data, 'vodka')).toBe(1930);
  expect(stock(data, 'tonic')).toBe(2100);
  await page.getByRole('button', { name: 'Расход бара', exact: true }).click();
  await page.getByLabel('Сумма, ֏').fill('5000');
  await page.getByLabel('Описание расхода').fill('Уборка');
  await page.getByRole('button', { name: 'Сохранить операцию' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Уборка' })).toContainText('5 000');
  await page.getByRole('button', { name: 'Отменить расход' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Уборка' })).toContainText('Отменён');
  await page.screenshot({ path: '/tmp/barbar-operations-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('owner plans a batch, sees its loss and unit cost, corrects the yield and writes the batch off', async ({
  page,
}) => {
  let data = fixtureData();
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar', async (route) => {
    if (route.request().method() === 'POST')
      data = applyCommand(data, route.request().postDataJSON().command);
    await route.fulfill({ json: { role: 'admin', data, revision: String(data.operations.length) } });
  });
  await page.goto('/operations');
  await page.getByRole('button', { name: 'Заготовка', exact: true }).click();
  await page.getByLabel('Готовая заготовка на складе').selectOption('tonic');
  await page.getByLabel(/Плановый выход/).fill('120');
  await page.getByLabel(/Фактический выход/).fill('100');
  await page.getByLabel('Ингредиент 1', { exact: true }).selectOption('vodka');
  await page.getByLabel(/Количество ингредиента 1/).fill('50');
  await page.getByLabel('Название партии', { exact: true }).fill('Партия А');
  await page.getByRole('button', { name: 'Сохранить операцию' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(data.stockMovements!.at(-1)).toMatchObject({ outputQuantity: 100, plannedQuantity: 120 });
  const row = page.locator('.batches-table').getByRole('row').filter({ hasText: 'Партия А' });
  // Plan 120, actual 100: a loss of 20 (16.67 %); the batch costs 210, a unit 2.1.
  await expect(row).toContainText('120 / 100');
  await expect(row).toContainText('20');
  await expect(row).toContainText('210');
  await row.getByRole('button', { name: 'Исправить выход' }).click();
  await page.getByLabel(/Фактический выход/).fill('90');
  await page.getByLabel('Причина').fill('Взвесили заново');
  await page.getByRole('button', { name: 'Сохранить исправление' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(data.stockMovements!.find((m) => m.reason === 'Партия А')).toMatchObject({ outputQuantity: 90 });
  expect(stock(data, 'tonic')).toBe(2090);
  await row.getByRole('button', { name: 'Списать партию' }).click();
  await expect(page.getByRole('dialog').getByLabel(/Количество,/)).toHaveValue('90');
  await page
    .getByRole('dialog')
    .getByLabel(/Количество,/)
    .fill('30');
  await page.getByLabel('Причина / комментарий').fill('Пролили');
  await page.getByRole('button', { name: 'Сохранить операцию' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const batch = data.stockMovements!.find((m) => m.reason === 'Партия А')!;
  expect(data.stockMovements!.at(-1)).toMatchObject({ kind: 'writeoff', batchId: batch.id });
  expect(stock(data, 'tonic')).toBe(2060);
  // A used batch can no longer be corrected.
  await expect(row.getByRole('button', { name: 'Исправить выход' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
