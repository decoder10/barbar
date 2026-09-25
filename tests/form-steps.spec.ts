import { expect, test, type Page } from '@playwright/test';
import { applyCommand } from '../src/barbar/domain/model';
import { shiftPreview } from '../src/barbar/domain/shifts';
import type { BarData } from '../src/barbar/domain/types';
import { fixtureData, mockOrders } from './fixtures';

async function workspace(page: Page) {
  const state = { data: fixtureData(), writes: 0 };
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'admin' } }),
  );
  await page.route('**/api/barbar', async (route) => {
    try {
      if (route.request().method() === 'POST') {
        state.data = applyCommand(state.data, route.request().postDataJSON().command);
        state.writes++;
      }
      await route.fulfill({ json: { data: state.data, revision: 'test', role: 'admin' } });
    } catch (error) {
      await route.fulfill({ status: 400, json: { error: (error as Error).message } });
    }
  });
  await mockOrders(page, () => state.data);
  return state;
}

const step = (page: Page, name: RegExp) => page.getByRole('dialog').getByRole('button', { name });

test('a long menu dialog goes step by step and saving opens the step of a missing field', async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto('/cocktails');
  await page.getByRole('button', { name: 'Добавить позицию', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.form-steps-nav li')).toHaveCount(3);
  await expect(step(page, /^Основное/)).toHaveAttribute('aria-current', 'step');
  const name = dialog.getByLabel('Название позиции');
  // «Далее» checks only the visible step: the empty name keeps step 1 open.
  await dialog.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(name).toBeFocused();
  await expect(step(page, /^Основное/)).toHaveAttribute('aria-current', 'step');
  await name.fill('Steps sour');
  await name.press('Enter');
  await expect(step(page, /^Состав/)).toHaveAttribute('aria-current', 'step');
  await expect(dialog.getByRole('button', { name: 'Добавить ингредиент', exact: true })).toBeVisible();
  await expect(name).toBeHidden();
  // Values survive switching; a missing name on save brings step 1 back with the field focused.
  await step(page, /^Основное/).click();
  await expect(name).toHaveValue('Steps sour');
  await name.fill('');
  await step(page, /^Цена/).click();
  await dialog.getByRole('button', { name: 'Сохранить позицию' }).click();
  await expect(step(page, /^Основное/)).toHaveAttribute('aria-current', 'step');
  await expect(name).toBeFocused();
  expect(state.writes).toBe(0);
  await name.fill('Steps sour');
  await step(page, /^Цена/).click();
  await dialog.getByLabel('Цена продажи, ֏').fill('2500');
  await dialog.getByRole('button', { name: 'Сохранить позицию' }).click();
  await expect(dialog).toBeHidden();
  expect(state.data.cocktails.find((c) => c.name === 'Steps sour')?.price).toBe(2500);
});

test('a double click on «Далее» never saves from the last step', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/cocktails');
  await page.getByRole('button', { name: 'Добавить позицию', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название позиции').fill('Double click');
  await dialog.getByRole('button', { name: 'Далее', exact: true }).click();
  await dialog.getByRole('button', { name: 'Далее', exact: true }).dblclick();
  await expect(step(page, /^Цена/)).toHaveAttribute('aria-current', 'step');
  await expect(dialog).toBeVisible();
  expect(state.writes).toBe(0);
});

test('a product priced per 500 ml is stored per 1,000 ml and shown per package again', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Новый напиток', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название').fill('Pack vodka');
  await dialog.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(dialog.getByLabel('Закупка за 1 000 мл, ֏')).toBeVisible();
  await dialog.getByRole('button', { name: '500 мл', exact: true }).click();
  await expect(dialog.getByLabel('Фасовка, мл')).toHaveValue('500');
  await dialog.getByLabel('Закупка за 500 мл, ֏').fill('700');
  await dialog.getByLabel('Продажа за 500 мл, ֏').fill('1500');
  await expect(dialog.locator('.pack-price-basis')).toHaveText(
    'В пересчёте за 1 000 мл: закупка 1 400 ֏, продажа 3 000 ֏.',
  );
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = state.data.alcohol.find((a) => a.name === 'Pack vodka')!;
  expect(saved).toMatchObject({ packSize: 500, costPerLiter: 1400, pricePerLiter: 3000 });

  await page.getByRole('button', { name: 'Изменить Pack vodka', exact: true }).click();
  await dialog.getByRole('button', { name: 'Далее', exact: true }).click();
  await expect(dialog.getByLabel('Закупка за 500 мл, ֏')).toHaveValue('700');
  await expect(dialog.getByLabel('Продажа за 500 мл, ֏')).toHaveValue('1500');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();

  const row = page.locator('.inventory-table').getByRole('row').filter({ hasText: 'Pack vodka' });
  await row.getByRole('button', { name: 'Закупка', exact: true }).click();
  await expect(dialog.getByLabel('Количество, мл')).toHaveValue('500');
  await expect(dialog.getByLabel('Цена за 500 мл, ֏')).toHaveValue('700');
  await dialog.getByRole('button', { name: '1000 мл', exact: true }).click();
  await expect(dialog.locator('.form-total')).toContainText('1 400');
  await dialog.getByRole('button', { name: 'Добавить на склад', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(state.data.purchases.at(-1)).toMatchObject({ alcoholId: saved.id, ml: 1000, costPerLiter: 1400 });
});

test('dropdowns keep an inset arrow and the close-shift actions line up', async ({ page }) => {
  const state = await workspace(page);
  await page.route('**/api/barbar/shifts*', (route) => {
    const day = new URL(route.request().url()).searchParams.get('from')!;
    const data: BarData = state.data;
    return route.fulfill({ json: { preview: shiftPreview(data.orders || [], day), shifts: [] } });
  });
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Новый напиток', exact: true }).click();
  const select = page.getByRole('dialog').getByLabel('Группа');
  const arrow = () =>
    select.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        appearance: style.appearance,
        image: style.backgroundImage,
        position: style.backgroundPosition,
        paddingRight: style.paddingRight,
      };
    });
  const light = await arrow();
  // `right 12px center` as computed by Chrome.
  expect(light).toMatchObject({
    appearance: 'none',
    position: 'calc(100% - 12px) 50%',
    paddingRight: '36px',
  });
  expect(light.image).toContain('727782');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  expect((await arrow()).image).toContain('abb8ca');
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();

  await page.goto('/');
  await page.getByRole('button', { name: 'Закрыть смену', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Пересчитанная наличная выручка, AMD').fill('0');
  const actions = sheet.locator('.shift-close-actions > .button');
  await expect(actions).toHaveCount(2);
  const [confirm, refresh] = [await actions.nth(0).boundingBox(), await actions.nth(1).boundingBox()];
  expect(confirm!.width).toBeCloseTo(refresh!.width, 0);
  expect(confirm!.x).toBeCloseTo(refresh!.x, 0);
  expect(refresh!.y - (confirm!.y + confirm!.height)).toBeGreaterThanOrEqual(8);
});
