import { expect, test } from '@playwright/test';
import { staffData } from '../netlify/lib/barbar-access';
import { migrateBottleCatalog } from '../src/barbar/domain/catalog/bottles';
import { applyCommand, initialData, stock } from '../src/barbar/domain/model';

test('stock brands, bottle sizes, purchases, staff sales and wine servings', async ({ page }) => {
  let data = migrateBottleCatalog(initialData());
  let role = 'admin';
  await page.route('**/api/barbar/auth', (route) => route.fulfill({ json: { authenticated: true, role } }));
  await page.route('**/api/barbar', async (route) => {
    try {
      if (route.request().method() === 'POST')
        data = applyCommand(data, route.request().postDataJSON().command);
      await route.fulfill({
        json: { ...(role === 'admin' ? { data } : { staffData: staffData(data) }), role, revision: 'test' },
      });
    } catch (error) {
      await route.fulfill({ status: 400, json: { error: (error as Error).message } });
    }
  });
  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: 'Склад напитков' })).toBeVisible();
  await page.getByRole('button', { name: 'Новое пиво', exact: true }).click();
  await page.getByLabel('Марка и название').fill('Test lager 330');
  for (const size of ['300', '330', '700', '750'])
    await expect(page.getByLabel('Объём бутылки, мл').locator(`option[value="${size}"]`)).toHaveCount(1);
  await page.getByLabel('Объём бутылки, мл').selectOption('330');
  await page.getByLabel('Закупка за 1 бутылку, ֏').fill('500');
  await page.getByLabel('Продажа за 1 бутылку, ֏').fill('1500');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const beer = data.alcohol.find((a) => a.name === 'Test lager 330')!;
  const beerRow = page.locator('.inventory-table').getByRole('row').filter({ hasText: beer.name });
  await expect(beerRow).toContainText('0 бут.');
  await beerRow.getByRole('button', { name: 'Закупка', exact: true }).click();
  await page.getByLabel('Количество, бут.').fill('12');
  await expect(page.getByRole('dialog')).toContainText('6 000 ֏');
  await page.getByRole('button', { name: 'Добавить на склад', exact: true }).click();
  await expect(beerRow).toContainText('12 бут.');
  await page.getByRole('button', { name: 'Новое вино', exact: true }).click();
  await page.getByLabel('Марка и название').fill('Test wine');
  await page.getByLabel('Объём бутылки, мл').selectOption('750');
  await page.getByLabel('Объём бокала, мл').fill('125');
  await page.getByLabel('Продажа за бокал, ֏').fill('1500');
  await page.getByLabel('Закупка за 1 бутылку, ֏').fill('3000');
  await page.getByLabel('Продажа за 1 бутылку, ֏').fill('9000');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const wineRow = page.locator('.inventory-table').getByRole('row').filter({ hasText: 'Test wine' });
  await wineRow.getByRole('button', { name: 'Закупка', exact: true }).click();
  await page.getByLabel('Количество, бут.').fill('1');
  await page.getByRole('button', { name: 'Добавить на склад', exact: true }).click();
  await expect(wineRow).toContainText('1 бут.');
  role = 'barbar';
  await page.goto('/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Продажи за день', exact: true, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Пиво', exact: true }).click();
  await page.getByRole('button', { name: /Test lager 330/ }).click();
  await page.getByLabel('Количество бутылок').fill('2');
  await expect(page.getByRole('dialog').locator('.form-total')).toContainText('3 000');
  await page.getByRole('button', { name: 'Записать продажу', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(stock(data, beer.id)).toBe(10);
  await expect(page.locator('.day-receipt')).toContainText('2 бут.');
  await expect(page.locator('.day-receipt')).toContainText('֏');
  await page.getByRole('button', { name: 'Вино', exact: true }).click();
  await page.getByRole('textbox', { name: 'Поиск напитка' }).fill('Test wine');
  await page.getByRole('button', { name: /Test wine · бокал/ }).click();
  await page.getByLabel('Объём одного бокала, мл').fill('300');
  await expect(page.getByRole('dialog').locator('.form-total')).toContainText('3 600');
  await page.getByLabel('Объём одного бокала, мл').fill('150');
  await page.getByLabel('Количество бокалов').fill('5');
  await expect(page.getByRole('dialog')).toContainText('750 мл');
  await expect(page.getByRole('dialog').locator('.form-total')).toContainText('9 000');
  await page.getByRole('button', { name: 'Записать продажу', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(stock(data, data.alcohol.find((a) => a.name === 'Test wine')!.id)).toBe(0);
  await expect(page.locator('.day-receipt')).toContainText('5 бок.');
  await page.getByRole('link', { name: 'Склад Наличие и остатки' }).click();
  await expect(page.getByRole('heading', { name: 'Остатки на складе' })).toBeVisible();
  const staffTable = page.locator('.inventory-table');
  await page.getByLabel('Поиск на складе').fill('Test lager');
  await expect(staffTable.getByRole('row').filter({ hasText: 'Test lager' })).toContainText('10 бут.');
  await page.getByRole('button', { name: 'Нет в наличии', exact: true }).click();
  await expect(staffTable.getByRole('row').filter({ hasText: 'Test lager' })).toHaveCount(0);
  await page.getByLabel('Поиск на складе').fill('Test wine');
  await expect(staffTable.getByRole('row').filter({ hasText: 'Test wine' })).toContainText('0 бут.');
  await expect(
    page.getByRole('button', { name: /Закупка|Добавить|Новый|Новое|Изменить|Сброс|Скачать|Исправить/ }),
  ).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/֏|Себестоимость|Закупочная|Продажная/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Остатки на складе' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(async () => {
    const box = await page.locator('.sidebar').boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(1);
  }).toPass();
  await page.screenshot({ path: '/private/tmp/barbar-staff-stock-mobile.png' });
  role = 'admin';
  await page.goto('/inventory');
  await page.reload();
  await page.getByRole('button', { name: 'Новый коньяк', exact: true }).click();
  await page.getByLabel('Объём бутылки, мл').selectOption('700');
  await page.getByLabel('Объём порции, мл').fill('50');
  await expect(page.getByRole('dialog')).toContainText('50 мл из бутылки 700 мл');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/barbar-bottle-form-mobile.png' });
});
