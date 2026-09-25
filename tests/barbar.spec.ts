import { expect, test } from '@playwright/test';
import { staffData } from '../netlify/lib/barbar-access';
import { applyCommand } from '../src/barbar/domain/model';
import { fixtureData, mockOrders, pickDay } from './fixtures';
async function workspace(page: import('@playwright/test').Page, oldSale = false, lowStock = false) {
  let data = fixtureData();
  if (lowStock) {
    data.purchases = data.purchases.map((p) => ({
      ...p,
      ml: p.alcoholId === 'gin' ? 40 : p.alcoholId === 'tonic' ? 150 : p.ml,
    }));
  }
  if (oldSale) {
    data.purchases = data.purchases.map((p) => ({ ...p, date: '2026-09-01' }));
    data = applyCommand(data, {
      id: 'old-test-sale',
      type: 'sale',
      value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-02' },
    });
  }
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'admin' } }),
  );
  await page.route('**/api/barbar', async (route) => {
    try {
      if (route.request().method() === 'POST') {
        data = applyCommand(data, route.request().postDataJSON().command);
      }
      await route.fulfill({ json: { data, revision: 'test', role: 'admin' } });
    } catch (error) {
      await route.fulfill({ status: 400, json: { error: (error as Error).message } });
    }
  });
  await mockOrders(page, () => data);
  await page.goto('/sales');
  await expect(page.getByLabel('Дата продаж')).toBeVisible();
}
test('login screen and configured owner login work through Node', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(process.env.BARBAR_ADMIN_USERNAME || 'admin');
  await page.getByLabel('Пароль вашего бара').fill(process.env.BARBAR_ADMIN_PASSWORD || '');
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
  await expect(page.getByRole('heading', { name: 'Без стола', level: 1 })).toBeVisible();
  await expect(page.locator('.receipt-line')).toContainText('Gin tonic Beefeater');
  await page.reload();
  await expect(page.locator('.receipt-line')).toContainText('2 порц.');
  await page.getByRole('link', { name: 'Продажи Каждый день' }).click();
  await expect(page.locator('.receipt-line')).toContainText('заказ');
  await page.getByRole('link', { name: 'Отчёты Всё в цифрах' }).click();
  await expect(
    page.locator('.report-sales-table').getByRole('row').filter({ hasText: 'Gin tonic Beefeater' }),
  ).toContainText('4 400');
  const downloadPromise = page.waitForEvent('download');
  // The shift report adds its own CSV button to this screen; keep this on the day report.
  await page.getByRole('button', { name: 'Скачать CSV', exact: true }).click();
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
  await expect(page.getByRole('heading', { name: 'Меню и рецепты', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Настойки', exact: true }).click();
  await page
    .locator('.drink-card')
    .filter({ has: page.getByRole('heading', { name: 'Слива', exact: true }) })
    .click();
  const next = page.getByRole('dialog').getByRole('button', { name: 'Далее', exact: true });
  await next.click();
  await page.getByRole('button', { name: 'Добавить ингредиент' }).click();
  await page.getByLabel('Ингредиент 1', { exact: true }).selectOption('vodka');
  await page.getByLabel('Миллилитры ингредиента 1').fill('50');
  await page.getByRole('button', { name: 'Добавить ингредиент' }).click();
  await page.getByLabel('Ингредиент 2', { exact: true }).selectOption('sugar');
  await page.getByLabel('Граммы ингредиента 2').fill('5');
  await next.click();
  await page.getByLabel('Цена продажи, ֏').fill('1800');
  await expect(page.getByRole('dialog')).toContainText('Себестоимость порции');
  await expect(page.getByRole('dialog')).toContainText('215 ֏');
  await page.getByRole('button', { name: 'Сохранить позицию' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(
    page.locator('.drink-card').filter({ has: page.getByRole('heading', { name: 'Слива', exact: true }) }),
  ).toContainText('1 800 ֏');
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
  await expect(page.getByRole('heading', { name: 'Меню и рецепты', exact: true })).toBeVisible();
  // Bottled wine, beer and brandy are sold from stock and have no recipe tab.
  await expect(page.getByRole('button', { name: 'Вино', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Продажи Каждый день' }).click();
  await page.getByRole('button', { name: 'Вино', exact: true }).click();
  await expect(page.getByRole('button', { name: /Volcani red dry Haghtanak · бокал/ })).toContainText(
    '1 500',
  );
  await page.getByRole('link', { name: 'Данные и копии Ваши данные' }).click();
  await expect(page.getByRole('heading', { name: 'Продажи по дням', level: 2 })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать резервную копию', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/barbar-backup/);
});

test('old history can be removed through the site without returning stock', async ({ page }) => {
  await workspace(page, true);
  await page.getByRole('link', { name: 'Данные и копии Ваши данные' }).click();
  await expect(page.locator('.daily-file')).toContainText('sales/2026-09-02.json');
  await pickDay(page, 'Удалить историю раньше', '2026-09-05');
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

test('stock reset requires explicit confirmation and persists only the selected deduction', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('link', { name: 'Склад Напитки и закупки' }).click();
  const row = page.locator('.inventory-table').getByRole('row').filter({ hasText: 'Vodka' });
  await row.getByRole('button', { name: 'Сбросить остаток Vodka', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('2 000 мл → 0 мл');
  await expect(page.getByRole('button', { name: 'Да, обнулить остаток' })).toBeDisabled();
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(row).toContainText('2 000 мл');
  await row.getByRole('button', { name: 'Сбросить остаток Vodka', exact: true }).click();
  await page.getByLabel('Для подтверждения напишите СБРОС').fill('СБРОС');
  await page.getByRole('button', { name: 'Да, обнулить остаток' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(row.locator('.stock-pill')).toHaveText('0 мл');
  await expect(row.getByRole('button', { name: 'Сбросить остаток Vodka', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'История сбросов' })).toBeVisible();
  await page.reload();
  await expect(row.locator('.stock-pill')).toHaveText('0 мл');
  await expect(
    page.locator('.inventory-table').getByRole('row').filter({ hasText: 'Gin Beefeater' }),
  ).toContainText('2 000 мл');
});

test('inventory highlights actual recipe shortages and clears them after a purchase', async ({ page }) => {
  await workspace(page, false, true);
  await page.getByRole('link', { name: 'Склад Напитки и закупки' }).click();
  const gin = page.locator('.inventory-table').getByRole('row').filter({ hasText: 'Gin Beefeater' });
  const tonic = page
    .locator('.inventory-table')
    .getByRole('row')
    .filter({ has: page.getByText('Тоник', { exact: true }) });
  await expect(gin).toHaveClass('inventory-shortage');
  await gin.locator('summary').click();
  await expect(gin).toContainText('Gin tonic Beefeater');
  await expect(gin).toContainText('На порцию нужно 50 мл; не хватает 10 мл.');
  await expect(tonic).not.toHaveClass('inventory-shortage');
  await expect(tonic.locator('.stock-pill')).toHaveText('150 мл');
  await gin.getByRole('button', { name: 'Закупка', exact: true }).click();
  await page.getByLabel('Количество, мл').fill('10');
  await page.getByRole('button', { name: 'Добавить на склад' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(gin).not.toHaveClass('inventory-shortage');
  await expect(gin.locator('.stock-pill')).toHaveText('50 мл');
  await expect(gin.locator('summary')).toHaveCount(0);
});

test('purchase quantity can be corrected and a mistaken purchase deleted with confirmation', async ({
  page,
}) => {
  await workspace(page);
  await page.getByRole('link', { name: 'Склад Напитки и закупки' }).click();
  const history = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'История закупок' }) });
  const entry = history.getByRole('row').filter({ hasText: 'Vodka' });
  await entry.getByRole('button', { name: 'Исправить / удалить' }).click();
  await page.getByLabel('Правильное количество, мл').fill('1000');
  await page.getByRole('button', { name: 'Сохранить правильное количество' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(entry).toContainText('1 000 мл');
  await entry.getByRole('button', { name: 'Исправить / удалить' }).click();
  await page.getByLabel('Закупки не было — удалить запись целиком').check();
  await expect(page.getByRole('button', { name: 'Удалить закупку', exact: true })).toBeDisabled();
  await page.getByLabel('Для удаления напишите УДАЛИТЬ').fill('УДАЛИТЬ');
  await page.getByRole('button', { name: 'Удалить закупку', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(entry).toHaveCount(0);
  await expect(
    page.locator('.inventory-table').getByRole('row').filter({ hasText: 'Vodka' }).locator('.stock-pill'),
  ).toHaveText('0 мл');
});

test('menu has varied matched images and manual photo selection persists', async ({ page }) => {
  await workspace(page);
  await page.getByRole('link', { name: /Меню и рецепты/ }).click();
  const cards = page.locator('.drink-card');
  const positions = await cards
    .locator('.cocktail-art img')
    .evaluateAll((els) => els.map((el) => el.getAttribute('src')));
  expect(new Set(positions).size).toBeGreaterThan(10);
  await page.screenshot({ path: '/private/tmp/barbar-new-menu.png', fullPage: false });
  await page.getByRole('button', { name: /КОКТЕЙЛИ.*Gin tonic Beefeater/ }).click();
  const picker = page.locator('.photo-picker');
  // Collapsed by default; a cocktail offers only the two cocktail photo sheets.
  await expect(picker).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Изображение: Margarita', exact: true })).toBeHidden();
  await picker.locator('summary').click();
  await expect(picker.locator('.photo-group-tabs button')).toHaveText([
    'Классические коктейли',
    'Авторские коктейли',
  ]);
  await page.getByRole('button', { name: 'Авторские коктейли', exact: true }).click();
  await page.getByRole('button', { name: 'Изображение: Margarita', exact: true }).click();
  // Saving is the last step; a step header jumps there directly.
  await page.getByRole('dialog').getByRole('button', { name: /^Цена/ }).click();
  await page.getByRole('button', { name: 'Сохранить позицию' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: /КОКТЕЙЛИ.*Gin tonic Beefeater/ }).click();
  await expect(page.locator('.photo-picker summary')).toContainText('Margarita');
  await page.locator('.photo-picker summary').click();
  await expect(page.getByRole('button', { name: 'Изображение: Margarita', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('products have their own inventory filter and can be costed per cocktail in drams', async ({ page }) => {
  await workspace(page);
  await page.getByRole('link', { name: 'Склад Напитки и закупки' }).click();
  await page.getByRole('button', { name: 'Фрукты и ягоды', exact: true }).click();
  await expect(page.getByText('Лимоны, лаймы, цитрусы, ягоды и другие фрукты.')).toBeVisible();
  await expect(page.locator('.inventory-table').getByText('Лимон', { exact: true })).toBeVisible();
  await expect(page.locator('.inventory-table').getByText('Тоник', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Вода и газировка', exact: true }).click();
  await expect(page.locator('.inventory-table').getByText('Тоник', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Хлеб и выпечка', exact: true }).click();
  await expect(page.locator('.inventory-table').getByText('Хлеб', { exact: true })).toBeVisible();
  await expect(page.locator('.inventory-table').getByText('Vodka', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: /Меню и рецепты/ }).click();
  await page.getByRole('button', { name: /КОКТЕЙЛИ.*Gin tonic Beefeater/ }).click();
  const next = page.getByRole('dialog').getByRole('button', { name: 'Далее', exact: true });
  await next.click();
  await page.getByText('Дополнительные расходы на порцию').click();
  await page.getByRole('button', { name: 'Добавить расход' }).click();
  await page.getByLabel('Продукт по стоимости 1', { exact: true }).selectOption('lemon-fruit');
  await page.getByLabel('Стоимость продукта 1, ֏').fill('50');
  await next.click();
  await expect(page.getByRole('dialog').locator('.cost-box')).toContainText('645 ֏');
  await page.getByRole('button', { name: 'Сохранить позицию' }).click();
  await page.getByRole('link', { name: 'Продажи Каждый день' }).click();
  await page.getByRole('button', { name: /КОКТЕЙЛИ.*Gin tonic Beefeater/ }).click();
  await page.getByLabel('Количество порций').fill('2');
  await expect(page.getByRole('dialog')).toContainText('Себестоимость: 1 290 ֏');
  await expect(page.getByRole('dialog')).toContainText('БЕЗ СПИСАНИЯ КОЛИЧЕСТВА');
  await page.getByRole('button', { name: 'Записать продажу' }).click();
  await page.getByRole('link', { name: 'Отчёты Всё в цифрах' }).click();
  await expect(
    page.locator('.report-sales-table').getByRole('row').filter({ hasText: 'Gin tonic Beefeater' }),
  ).toContainText('1 290');
});

test('barbar sees quantities and read-only stock but cannot open admin pages', async ({ page }) => {
  let data = fixtureData();
  const product = data.cocktails[0];
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'barbar' } }),
  );
  await page.route('**/api/barbar', async (route) => {
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON().command;
      expect(['sale', 'openOrder']).toContain(command.type);
      data = applyCommand(data, command);
    }
    await route.fulfill({ json: { staffData: staffData(data), revision: 'test', role: 'barbar' } });
  });
  await mockOrders(
    page,
    () => data,
    () => 'barbar',
  );
  await page.goto('/sales');
  await expect(page.getByRole('heading', { name: 'Продажи за день', exact: true, level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(4);
  await expect(page.locator('body')).not.toContainText(/Валовая прибыль|Себестоимость|закупочные цены/);
  await page.getByRole('button', { name: new RegExp(product.name) }).click();
  await expect(page.getByRole('dialog')).not.toContainText(/Себестоимость|Прибыль/);
  await page.getByLabel('Количество порций').fill('2');
  await page.getByRole('button', { name: 'Записать продажу', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  // Inside the order a tap opens the same dialog: the quantity is always chosen.
  await page.locator('.drink-card').filter({ hasText: product.name }).first().click();
  await page.getByRole('button', { name: 'Записать продажу', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Чек заказа' })).toContainText('3 порц.');
  await expect(page.locator('body')).not.toContainText(/Себестоимость|Прибыль/);
  await page.getByRole('link', { name: 'Продажи Каждый день' }).click();
  await expect(page.getByRole('complementary', { name: 'Сводка продаж за день' })).toContainText('3 порц.');
  await expect(page.getByRole('button', { name: /Отменить продажу|Скачать/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Сводка продаж за день' })).toContainText('3 порц.');
  await page.getByRole('button', { name: 'Предыдущий день' }).click();
  await expect(page.getByRole('complementary', { name: 'Сводка продаж за день' })).toContainText(
    'День только начинается',
  );
  await page.getByRole('button', { name: /^Дата продаж:/ }).click();
  await page.getByRole('dialog', { name: 'Дата продаж' }).getByRole('button', { name: 'Сегодня' }).click();
  await expect(page.getByRole('complementary', { name: 'Сводка продаж за день' })).toContainText('3 порц.');
  for (const path of ['/reports', '/files']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Столы', exact: true, level: 1 })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Себестоимость|Прибыль/);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/barbar-staff-mobile.png', fullPage: false });
});

test('real admin login uses the separate owner account and reads MongoDB', async ({ request }) => {
  const result = await request.post('/api/barbar/auth', {
    headers: { origin: 'http://127.0.0.1:4001' },
    data: { username: 'admin', password: process.env.BARBAR_ADMIN_PASSWORD },
  });
  expect(result.status()).toBe(200);
  expect(await result.json()).toMatchObject({ authenticated: true, role: 'admin', user: { role: 'owner' } });
  const state = await request.get('/api/barbar');
  expect(state.status()).toBe(200);
  const body = await state.json();
  expect(body.role).toBe('admin');
  expect(body.data.purchases).toBeInstanceOf(Array);
  expect(body.data.sales).toBeInstanceOf(Array);
});

test('barbar can create a cocktail with a gram recipe without seeing or setting money', async ({ page }) => {
  let data = fixtureData();
  let role = 'barbar';
  await page.route('**/api/barbar/auth', (route) => route.fulfill({ json: { authenticated: true, role } }));
  await page.route('**/api/barbar', async (route) => {
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON().command;
      expect(command.type).toBe('createCocktail');
      expect(command.value).not.toHaveProperty('price');
      expect(command.value).not.toHaveProperty('extraCosts');
      data = applyCommand(data, command);
    }
    await route.fulfill({
      json:
        role === 'admin'
          ? { data, revision: 'test', role }
          : { staffData: staffData(data), revision: 'test', role },
    });
  });
  await page.goto('/sales');
  const createButton = page
    .locator('.sales-mode-toolbar')
    .getByRole('button', { name: 'Коктейль', exact: true });
  await expect(createButton).toBeInViewport();
  await createButton.click();
  await expect(page.getByRole('dialog')).not.toContainText(/֏|Себестоимость|Цена|Выручка/);
  await page.getByLabel('Название позиции').fill('Коктейль сотрудника');
  await page.getByRole('dialog').getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить ингредиент', exact: true }).click();
  await page.getByLabel('Ингредиент 1', { exact: true }).selectOption('vodka');
  await page.getByLabel('Миллилитры ингредиента 1').fill('50');
  await page.getByRole('button', { name: 'Добавить ингредиент', exact: true }).click();
  await page.getByLabel('Ингредиент 2', { exact: true }).selectOption('sugar');
  await page.getByLabel('Граммы ингредиента 2').fill('5');
  await page.getByRole('button', { name: 'Сохранить позицию', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByLabel('Поиск напитка').fill('Коктейль сотрудника');
  await expect(page.getByRole('button', { name: /Коктейль сотрудника/ })).toBeVisible();
  expect(data.cocktails.at(-1)?.price).toBe(0);
  expect(data.cocktails.at(-1)?.ingredients).toEqual([
    { alcoholId: 'vodka', ml: 50 },
    { alcoholId: 'sugar', ml: 5 },
  ]);
  await page.reload();
  await page.getByLabel('Поиск напитка').fill('Коктейль сотрудника');
  await expect(page.getByRole('button', { name: /Коктейль сотрудника/ })).toBeVisible();
  role = 'admin';
  await page.goto('/cocktails');
  await page.getByLabel('Поиск коктейля').fill('Коктейль сотрудника');
  await page.getByRole('button', { name: /Коктейль сотрудника/ }).click();
  await expect(page.getByLabel('Цена продажи, ֏')).toHaveValue('0');
});
