import { expect, test } from '@playwright/test';
import { fixtureData } from './fixtures';
import { applyCommand } from '../src/barbar/model';
async function workspace(page: import('@playwright/test').Page, oldSale = false) {
  let data = fixtureData();
  if (oldSale) {
    data.purchases = data.purchases.map((p) => ({ ...p, date: '2026-09-01' }));
    data = applyCommand(data, {
      id: 'old-test-sale',
      type: 'sale',
      value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-02' },
    });
  }
  await page.route('**/api/barbar/auth', (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/barbar', async (route) => {
    try {
      if (route.request().method() === 'POST') {
        data = applyCommand(data, route.request().postDataJSON().command);
      }
      await route.fulfill({ json: { data, revision: 'test' } });
    } catch (error) {
      await route.fulfill({ status: 400, json: { error: (error as Error).message } });
    }
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Хороший день для хороших напитков.' })).toBeVisible();
}
test('login screen and fictitious login work through Node', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill('barbar');
  await page.getByLabel('Пароль вашего бара').fill(process.env.BARBAR_PASSWORD || '');
  await page.getByRole('button', { name: 'Войти в Barbar' }).click();
  await expect(page.getByText('Общие данные', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/private/tmp/barbar-live-desktop.png', fullPage: false });
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByLabel('Пароль вашего бара')).toBeVisible();
});
test('purchase, recipe costing, sale, report, cancellation and persistence', async ({ page }) => {
  await workspace(page);
  await page.getByRole('link', { name: 'Склад Напитки и закупки' }).click();
  await page.getByRole('button', { name: 'Добавить закупку', exact: true }).click();
  await page.getByLabel('Напиток', { exact: true }).selectOption('gin');
  await page.getByLabel('Количество, мл').fill('1000');
  await page.getByLabel('Цена за 1 000 мл, ֏').fill('9200');
  await page.getByRole('button', { name: 'Добавить на склад' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const ginRow = page.locator('.inventory-table').getByRole('row').filter({ hasText: 'Gin Beefeater' });
  await expect(ginRow).toContainText('3 000 мл');
  await page.getByRole('link', { name: 'Продажи Каждый день' }).click();
  await page.getByRole('button', { name: /КОКТЕЙЛИ.*Gin tonic Beefeater/ }).click();
  await page.getByLabel('Количество порций').fill('2');
  await expect(page.getByRole('dialog')).toContainText('4 400 ֏');
  await page.getByRole('button', { name: 'Записать продажу' }).click();
  await expect(page.locator('.receipt-line')).toContainText('Gin tonic Beefeater');
  await page.reload();
  await expect(page.locator('.receipt-line')).toContainText('2 порц.');
  await page.getByRole('link', { name: 'Отчёты Всё в цифрах' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Gin tonic Beefeater' })).toContainText('4 400');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать CSV' }).click();
  const csv = await downloadPromise;
  expect(csv.suggestedFilename()).toMatch(/barbar-report-.*\.csv/);
  await page.getByRole('link', { name: 'Продажи Каждый день' }).click();
  await page.getByRole('button', { name: 'Отменить продажу Gin tonic Beefeater' }).click();
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.locator('.receipt-line')).toContainText('отменена');
  await page.getByRole('link', { name: 'Склад Напитки и закупки' }).click();
  await expect(
    page.locator('.inventory-table').getByRole('row').filter({ hasText: 'Gin Beefeater' }),
  ).toContainText('3 000 мл');
});
test('preloaded tinctures can be edited with grams and an independent selling price', async ({ page }) => {
  await workspace(page);
  await page.getByRole('link', { name: /Меню и рецепты/ }).click();
  await page.getByRole('button', { name: 'Настойки', exact: true }).click();
  await page.getByRole('button', { name: /НАСТОЙКИ.*Слива/ }).click();
  await page.getByRole('button', { name: 'Добавить ингредиент' }).click();
  await page.getByLabel('Ингредиент 1', { exact: true }).selectOption('vodka');
  await page.getByLabel('Миллилитры ингредиента 1').fill('50');
  await page.getByRole('button', { name: 'Добавить ингредиент' }).click();
  await page.getByLabel('Ингредиент 2', { exact: true }).selectOption('sugar');
  await page.getByLabel('Миллилитры ингредиента 2').fill('5');
  await page.getByLabel('Цена продажи, ֏').fill('1800');
  await expect(page.getByRole('dialog')).toContainText('Себестоимость порции');
  await expect(page.getByRole('dialog')).toContainText('215 ֏');
  await page.getByRole('button', { name: 'Сохранить позицию' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: /НАСТОЙКИ.*Слива/ })).toContainText('1 800 ֏');
});
test('mobile navigation and layouts have no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace(page);
  await page.screenshot({ path: '/private/tmp/barbar-mobile.png', fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('link', { name: /Меню и рецепты/ }).click();
  await expect(page.getByRole('heading', { name: 'Меню и рецепты', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Добавить позицию' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
});
test('all menu categories and backup tools are accessible', async ({ page }) => {
  await workspace(page);
  await page.getByRole('link', { name: /Меню и рецепты/ }).click();
  await page.getByRole('button', { name: 'Вино', exact: true }).click();
  await expect(page.getByRole('button', { name: /Volcani red dry Haghtanak · бокал/ })).toContainText(
    '1 500',
  );
  await page.getByRole('link', { name: 'Файлы и копии Ваши данные' }).click();
  await expect(page.getByRole('heading', { name: 'Папка ежедневных продаж' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать резервную копию', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/barbar-backup/);
});

test('old history can be removed through the site without returning stock', async ({ page }) => {
  await workspace(page, true);
  await page.getByRole('link', { name: 'Файлы и копии Ваши данные' }).click();
  await expect(page.locator('.daily-file')).toContainText('sales/2026-09-02.json');
  await page.getByLabel('Удалить историю раньше').fill('2026-09-05');
  await page.getByRole('button', { name: 'Удалить старые продажи' }).click();
  await expect(page.getByRole('dialog')).toContainText('1 дней и 1 записей');
  await page.getByRole('button', { name: 'Удалить 1 записей' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.daily-file')).toHaveCount(0);
  await expect(page.getByText(/История до 2026-09-05 уже очищена/)).toBeVisible();
  await page.getByRole('link', { name: 'Склад Напитки и закупки' }).click();
  await expect(page.locator('.inventory-table').getByRole('row').filter({ hasText: 'Vodka' })).toContainText(
    '1 950 мл',
  );
});
