import { expect, test } from '@playwright/test';
import { staffData } from '../netlify/lib/barbar-access';
import { migrateBottleCatalog } from '../src/barbar/domain/catalog/bottles';
import { applyCommand } from '../src/barbar/domain/model';
import { fixtureData } from './fixtures';

test('staff edits existing recipes and sees stock pictures and shortages without money or stock controls', async ({
  page,
}) => {
  let data = migrateBottleCatalog(fixtureData());
  data.purchases = data.purchases.filter((p) => p.alcoholId !== 'gin');
  const original = structuredClone(data.cocktails[0]);
  let writes = 0;
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'barbar' } }),
  );
  await page.route('**/api/barbar', async (route) => {
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON().command;
      expect(command.type).toBe('updateRecipe');
      expect(command).not.toHaveProperty('price');
      data = applyCommand(data, command);
      writes++;
    }
    await route.fulfill({ json: { staffData: staffData(data), role: 'barbar', revision: 'test' } });
  });
  await page.goto('/sales');
  await page.getByRole('link', { name: /Меню и рецепты/ }).click();
  await expect(page.getByRole('heading', { name: 'Меню и рецепты', exact: true })).toBeVisible();
  await page.getByLabel('Поиск рецепта').fill(original.name);
  const card = page.getByRole('button', { name: new RegExp(original.name) });
  await expect(card.getByRole('img')).toBeVisible();
  await expect(card).toContainText('Не хватает: Gin Beefeater');
  await card.click();
  await expect(page.getByLabel('Миллилитры ингредиента 1')).toHaveValue('50');
  await expect(page.getByRole('dialog')).toContainText('Нет в наличии');
  await page.getByLabel('Миллилитры ингредиента 1').fill('60');
  await page.getByRole('button', { name: 'Добавить ингредиент', exact: true }).click();
  await page.getByLabel('Ингредиент 3', { exact: true }).selectOption('sugar');
  await page.getByLabel('Граммы ингредиента 3').fill('5');
  await page.getByLabel('Заметка о рецепте').fill('Перемешать со льдом.');
  await expect(page.getByRole('dialog')).not.toContainText(/֏|Цена|Себестоимость|Выручка/);
  await page.getByRole('button', { name: 'Сохранить позицию', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(writes).toBe(1);
  expect(data.cocktails[0].price).toBe(original.price);
  expect(data.cocktails[0].ingredients).toEqual([
    { alcoholId: 'gin', ml: 60 },
    { alcoholId: 'tonic', ml: 150 },
    { alcoholId: 'sugar', ml: 5 },
  ]);
  await page.reload();
  await page.getByLabel('Поиск рецепта').fill(original.name);
  await page.getByRole('button', { name: new RegExp(original.name) }).click();
  await expect(page.getByLabel('Миллилитры ингредиента 1')).toHaveValue('60');
  await expect(page.getByLabel('Граммы ингредиента 3')).toHaveValue('5');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('link', { name: 'Склад Наличие и остатки' }).click();
  await page.getByRole('button', { name: 'Вино', exact: true }).click();
  const row = page.locator('.inventory-table tbody tr').first();
  await expect(row.getByRole('img')).toBeVisible();
  await expect(row).toHaveClass('inventory-shortage');
  await expect(row).toContainText('Нет в наличии');
  await expect(page.getByRole('button', { name: /Закупка|Добавить|Изменить|Сброс|Скачать/ })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/֏|Себестоимость|Закупочная|Продажная/);
  await page.screenshot({ path: '/private/tmp/barbar-staff-stock-pictures.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(async () => {
    const box = await page.locator('.sidebar').boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(1);
  }).toPass();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/barbar-staff-stock-pictures-mobile.png' });
});
