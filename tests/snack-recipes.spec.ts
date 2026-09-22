import { expect, test } from '@playwright/test';
import { applyCommand } from '../src/barbar/domain/model';
import { fixtureData } from './fixtures';

test('snack recipes use snack products, their units and a collapsed own-category photo picker', async ({
  page,
}) => {
  let data = fixtureData();
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'admin' } }),
  );
  await page.route('**/api/barbar', async (route) => {
    try {
      if (route.request().method() === 'POST')
        data = applyCommand(data, route.request().postDataJSON().command);
      await route.fulfill({ json: { data, revision: 'test', role: 'admin' } });
    } catch (error) {
      await route.fulfill({ status: 400, json: { error: (error as Error).message } });
    }
  });
  await page.goto('/sales');
  await page.getByRole('link', { name: /Меню и рецепты/ }).click();
  await page.getByRole('button', { name: 'Закуски', exact: true }).click();
  await page.getByRole('button', { name: /ЗАКУСКИ.*BarBar sandwich/ }).click();
  const dialog = page.getByRole('dialog');
  const picker = dialog.locator('.photo-picker');
  await expect(picker).not.toHaveAttribute('open', '');
  await picker.locator('summary').click();
  await expect(picker.locator('.photo-group-tabs')).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'Изображение: По названию', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    picker.getByRole('button', { name: 'Изображение: Сэндвич BarBar', exact: true }),
  ).toBeVisible();
  // Only snack photos: no cocktails, wine or cafe drinks.
  await expect(
    picker.getByRole('button', { name: /Изображение: (Negroni|Красное вино|Капучино)/ }),
  ).toHaveCount(0);
  await picker.getByRole('button', { name: 'Изображение: Сыр с мёдом', exact: true }).click();
  await expect(picker.locator('summary')).toContainText('Сыр с мёдом');

  await dialog.getByRole('button', { name: 'Добавить ингредиент', exact: true }).click();
  const first = dialog.getByLabel('Ингредиент 1', { exact: true });
  await expect(first).toHaveValue('');
  await expect(first.locator('option', { hasText: 'Vodka' })).toHaveCount(0);
  await expect(first.locator('optgroup').first()).toHaveAttribute('label', 'Мясо, колбасы и сыр');
  await first.selectOption('food-bread');
  await expect(dialog.getByLabel('Штуки ингредиента 1')).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Добавить ингредиент', exact: true }).click();
  await dialog.getByLabel('Ингредиент 2', { exact: true }).selectOption('food-cheese');
  const cheese = dialog.getByLabel('Граммы ингредиента 2');
  await expect(cheese).toHaveValue('');
  await cheese.fill('80');
  await dialog.getByRole('button', { name: 'Сохранить позицию' }).click();
  await expect(dialog).toBeHidden();
  const saved = data.cocktails.find((c) => c.name === 'BarBar sandwich')!;
  expect(saved.ingredients).toEqual([
    { alcoholId: 'food-bread', ml: 1 },
    { alcoholId: 'food-cheese', ml: 80 },
  ]);
});
