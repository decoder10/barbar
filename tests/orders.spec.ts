import { expect, test, type Page } from '@playwright/test';
import { applyCommand } from '../src/barbar/domain/model';
import type { BarData, Role } from '../src/barbar/domain/types';
import { staffData } from '../netlify/lib/barbar-access';
import { fixtureData, mockOrders, mockRecentOrders } from './fixtures';

/** The workspace with an in-page ledger: commands apply locally, the tables board reads the same data. */
async function workspace(page: Page, role: Role, seed?: (data: BarData) => BarData) {
  let data = fixtureData();
  data = applyCommand(data, {
    id: 'table-1',
    type: 'saveTable',
    value: { id: 'table-1', name: '1', order: 0, active: true },
  });
  data = applyCommand(data, {
    id: 'table-2',
    type: 'saveTable',
    value: { id: 'table-2', name: 'Терраса', order: 1, active: true },
  });
  if (seed) data = seed(data);
  const actor = { id: role, fullName: role === 'admin' ? 'Арам' : 'Ани' };
  // The profile keeps the user's favourites; a POST with `favorites` replaces them, like the server does.
  let favorites: string[] = [];
  await page.route('**/api/barbar/favorites', (route) => {
    favorites = route.request().postDataJSON().favorites ?? favorites;
    return route.fulfill({ json: { user: { id: role, fullName: actor.fullName, role, favorites } } });
  });
  await page.route('**/api/barbar/auth', (route) => {
    return route.fulfill({
      json: {
        authenticated: true,
        role,
        user: { id: role, fullName: actor.fullName, role, favorites },
      },
    });
  });
  await page.route('**/api/barbar', async (route) => {
    try {
      if (route.request().method() === 'POST')
        data = applyCommand(data, route.request().postDataJSON().command, { actor });
      await route.fulfill({
        json:
          role === 'admin'
            ? { data, revision: String(data.operations.length), role }
            : { staffData: staffData(data), revision: String(data.operations.length), role },
      });
    } catch (error) {
      await route.fulfill({ status: 400, json: { error: (error as Error).message } });
    }
  });
  await mockOrders(
    page,
    () => data,
    () => role,
  );
  await mockRecentOrders(
    page,
    () => data,
    () => role,
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Столы' })).toBeVisible();
  return () => data;
}

test('owner opens a table, adds lines by tapping, removes one and takes a split payment', async ({
  page,
}) => {
  const ledger = await workspace(page, 'admin');
  await page.getByRole('button', { name: /^1\s*Свободен/ }).click();
  await expect(page.getByRole('heading', { name: 'Стол 1', level: 1 })).toBeVisible();
  const receipt = page.getByRole('complementary', { name: 'Чек заказа' });
  await expect(receipt).toContainText('Заказ пуст');
  await page.getByRole('button', { name: /КОКТЕЙЛИ.*Gin tonic Beefeater/ }).click();
  await page.getByRole('button', { name: 'Записать продажу', exact: true }).click();
  await expect(receipt.getByText('Gin tonic Beefeater', { exact: true })).toBeVisible();
  await receipt.getByRole('button', { name: 'Добавить ещё Gin tonic Beefeater' }).click();
  await expect(receipt).toContainText('2 порц.');
  await expect(receipt.locator('.receipt-total strong')).toContainText('4 400');
  await page.getByRole('button', { name: 'В розлив', exact: true }).click();
  await page.getByRole('button', { name: /АЛКОГОЛЬ.*Vodka/ }).click();
  await page.getByLabel('Объём продажи, мл').fill('50');
  await page.getByRole('button', { name: 'Записать продажу' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(receipt).toContainText('50 мл');
  await receipt.getByRole('button', { name: 'Убрать Vodka' }).click();
  await expect(receipt).not.toContainText('Vodka');
  expect(ledger().sales.filter((s) => s.orderId && !s.voided)).toHaveLength(2);
  await receipt.getByRole('button', { name: /^Оплатить/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('4 400');
  await sheet.getByRole('button', { name: 'Разделить' }).click();
  await sheet.getByRole('button', { name: 'Больше гостей' }).click();
  await expect(sheet.getByLabel('Сумма гостя 3, ֏')).toBeVisible();
  await sheet.getByRole('button', { name: 'Меньше гостей' }).click();
  await sheet
    .getByRole('group', { name: 'Способ оплаты' })
    .nth(1)
    .getByRole('button', { name: 'Карта' })
    .click();
  await sheet.getByLabel('Получено наличными, ֏').fill('5000');
  await expect(sheet).toContainText('Сдача');
  await expect(sheet).toContainText('Суммы сходятся');
  await sheet.getByRole('button', { name: /^Оплачено/ }).click();
  await expect(page.getByRole('heading', { name: 'Оплачено' })).toBeVisible();
  await expect(page.getByText('2 800')).toBeVisible();
  const order = ledger().orders![0];
  expect(order.status).toBe('paid');
  expect(order.total).toBe(4400);
  expect(order.payments).toEqual([
    { id: expect.any(String), method: 'cash', amount: 2200, receivedCash: 5000 },
    { id: expect.any(String), method: 'card', amount: 2200 },
  ]);
  expect(order.closedBy).toEqual({ id: 'admin', fullName: 'Арам' });
  await page.getByRole('link', { name: 'К столам' }).click();
  await expect(page.getByRole('button', { name: /^1\s*Свободен/ })).toBeVisible();
  // The focused mode follows the person from the board into an order and back.
  await page.getByRole('button', { name: 'На весь экран', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/sales-fullscreen/);
  await page.getByRole('button', { name: /^1\s*Свободен/ }).click();
  await expect(page.getByRole('heading', { name: 'Стол 1', level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/sales-fullscreen/);
  await page.getByRole('link', { name: 'Столы' }).first().click();
  await expect(page.getByRole('heading', { name: 'Столы', level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/sales-fullscreen/);
  await page.getByRole('button', { name: 'Выйти из полного экрана', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/sales-fullscreen/);
});

test('worker sees the same board, makes a quick sale and cancels an empty order without seeing costs', async ({
  page,
}) => {
  const ledger = await workspace(page, 'barbar');
  await expect(page.getByRole('button', { name: 'Настроить столы' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Терраса Свободен' }).click();
  await expect(page.getByRole('heading', { name: 'Стол Терраса', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /КОКТЕЙЛИ.*Gin tonic Beefeater/ }).click();
  await page.getByRole('button', { name: 'Записать продажу', exact: true }).click();
  const receipt = page.getByRole('complementary', { name: 'Чек заказа' });
  await expect(receipt).toContainText('Gin tonic Beefeater');
  await expect(receipt).not.toContainText(/себестоимость|прибыль/i);
  await receipt.getByRole('button', { name: 'Убрать Gin tonic Beefeater' }).click();
  await expect(receipt).toContainText('Заказ пуст');
  await receipt.getByRole('button', { name: 'Закрыть пустой заказ' }).click();
  await expect(page.getByRole('heading', { name: 'Столы' })).toBeVisible();
  expect(ledger().orders![0]).toMatchObject({ status: 'cancelled', openedBy: { fullName: 'Ани' } });
  await page.getByRole('button', { name: 'Быстрая продажа' }).click();
  await expect(page.getByRole('heading', { name: 'Без стола', level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: /Без стола.*Заказ пуст/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

/** A paid receipt of the asker: two Gin tonic and 50 ml of vodka, on table 1. */
const paidBefore = (role: Role) => (data: BarData) => {
  const context = { actor: { id: role, fullName: 'Кто-то' } };
  const gin = data.cocktails.find((c) => c.name === 'Gin tonic Beefeater')!;
  let next = applyCommand(data, { id: 'old-order', type: 'openOrder', tableId: 'table-1' }, context);
  next = applyCommand(
    next,
    {
      id: 'old-1',
      type: 'sale',
      value: { kind: 'cocktail', productId: gin.id, quantity: 2, date: '2026-09-01', orderId: 'old-order' },
    },
    context,
  );
  next = applyCommand(
    next,
    {
      id: 'old-2',
      type: 'sale',
      value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-01', orderId: 'old-order' },
    },
    context,
  );
  return applyCommand(
    next,
    {
      id: 'old-pay',
      type: 'payOrder',
      orderId: 'old-order',
      expectedTotal: 4400 + 630,
      payments: [{ method: 'cash', amount: 4400 + 630 }],
    },
    context,
  );
};

test('owner marks personal and bar favorites and finds them under the Favorites tab', async ({ page }) => {
  const ledger = await workspace(page, 'admin');
  await page.getByRole('button', { name: /^1\s*Свободен/ }).click();
  await expect(page.getByRole('heading', { name: 'Стол 1', level: 1 })).toBeVisible();
  const card = page.locator('.card-wrap', { hasText: 'Gin tonic Beefeater' }).first();
  const star = card.getByRole('button', { name: 'Добавить в моё избранное' });
  await star.click();
  await expect(card.getByRole('button', { name: 'Убрать из моего избранного' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const other = page.locator('.card-wrap').filter({ hasNotText: 'Gin tonic Beefeater' }).first();
  const otherName = (await other.locator('h3').innerText()).trim();
  await other.getByRole('button', { name: 'Добавить в избранное заведения' }).click();
  await expect(other.getByRole('button', { name: 'Убрать из избранного заведения' })).toBeVisible();
  expect(
    ledger()
      .cocktails.filter((c) => c.favorite)
      .map((c) => c.name),
  ).toEqual([otherName]);
  await page.getByRole('button', { name: 'Избранное', exact: true }).click();
  await expect(page.locator('.drink-grid .card-wrap')).toHaveCount(2);
  await expect(page.locator('.drink-grid')).toContainText('Gin tonic Beefeater');
  await expect(page.locator('.drink-grid')).toContainText(otherName);
  // The star is a sibling of the card button, not inside it.
  expect(await page.locator('.drink-card button').count()).toBe(0);
  await page.getByRole('button', { name: 'Убрать из моего избранного' }).click();
  await expect(page.locator('.drink-grid .card-wrap')).toHaveCount(1);
});

test("worker keeps a personal favorite but cannot pin for the bar, and repeats a set with today's prices", async ({
  page,
}) => {
  const ledger = await workspace(page, 'barbar', paidBefore('barbar'));
  await page.getByRole('button', { name: /^1\s*Свободен/ }).click();
  await expect(page.getByRole('heading', { name: 'Стол 1', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /избранное заведения/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Добавить в моё избранное' }).first()).toBeVisible();
  const receipt = page.getByRole('complementary', { name: 'Чек заказа' });
  await receipt.getByRole('button', { name: 'Повторить заказ' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Gin tonic Beefeater');
  await expect(sheet).toContainText('Vodka');
  await expect(sheet.locator('.receipt-total strong')).toContainText('5 030');
  // Change the set before saving: one Gin tonic less.
  await sheet.getByRole('button', { name: 'Меньше: Gin tonic Beefeater' }).click();
  await expect(sheet.locator('.receipt-total strong')).toContainText('2 830');
  await sheet.getByRole('button', { name: 'Убрать: Vodka' }).click();
  await expect(sheet.locator('.receipt-total strong')).toContainText('2 200');
  await sheet.getByRole('button', { name: /Добавить в заказ/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(receipt).toContainText('Gin tonic Beefeater');
  const lines = ledger().sales.filter((s) => s.orderId && s.orderId !== 'old-order' && !s.voided);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ quantity: 1, revenue: 2200 });
  // One receipt for the table: the repeat used the open order, not a second one.
  expect(ledger().orders!.filter((o) => o.status === 'open')).toHaveLength(1);
});

test('the repeat sheet reports sold-out items and fits a phone', async ({ page }) => {
  await workspace(page, 'admin', (data) =>
    // Vodka runs out after the receipt was paid.
    applyCommand(paidBefore('admin')(data), {
      id: 'used-up',
      type: 'writeoff',
      reason: 'Закончилась',
      alcoholId: 'vodka',
      quantity: 1950,
      expected: 1950,
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orders/new?table=table-1');
  await page.locator('.order-bar').click();
  await page.getByRole('button', { name: 'Повторить заказ' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.locator('.repeat-line.unavailable')).toContainText('Vodka');
  await expect(sheet.locator('.repeat-line.unavailable')).toContainText('Нет в наличии');
  await expect(sheet.locator('.receipt-total strong')).toContainText('4 400');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
