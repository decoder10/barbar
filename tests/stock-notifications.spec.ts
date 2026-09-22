import { expect, test } from '@playwright/test';
import { fixtureData, mockOrders } from './fixtures';
import { staffData } from '../netlify/lib/barbar-access';
import { applyCommand } from '../src/barbar/domain/model';
import type { Command } from '../src/barbar/domain/types';
for (const role of ['admin', 'barbar'] as const) {
  test(`${role}: stock warnings after sale, no repeated low alert, clear on replenishment`, async ({
    page,
  }) => {
    let data = fixtureData();
    data.purchases.find((p) => p.alcoholId === 'gin')!.ml = 200;
    let revision = 0;
    await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role } }));
    await page.route('**/api/barbar/push', (r) => r.fulfill({ json: { publicKey: null } }));
    // The feed is what the server queued; a worker gets stock warnings only, never purchase money.
    await page.route('**/api/barbar/notifications', (r) =>
      r.fulfill({
        json: {
          items: [
            ...(role === 'admin'
              ? [
                  {
                    id: 'purchase:p1',
                    kind: 'purchase',
                    createdAt: '2026-09-16T08:00:00.000Z',
                    delivered: true,
                    purchase: {
                      purchaseId: 'p1',
                      name: 'Gin Beefeater',
                      quantity: 700,
                      unit: 'ml',
                      amount: 12000,
                      date: '2026-09-16',
                      createdAt: '2026-09-16T08:00:00.000Z',
                    },
                  },
                ]
              : []),
            {
              id: 'stock:s1',
              kind: 'stock',
              createdAt: '2026-09-16T07:00:00.000Z',
              delivered: false,
              alerts: [
                {
                  id: 'gin',
                  name: 'Gin Beefeater',
                  unit: 'ml',
                  quantity: 0,
                  threshold: 150,
                  severity: 'empty',
                },
              ],
            },
          ],
        },
      }),
    );
    await page.route('**/api/barbar', (r) => {
      if (r.request().method() === 'POST') {
        const { command } = r.request().postDataJSON() as { command: Command };
        data = applyCommand(data, command);
        revision++;
      }
      return r.fulfill({
        json: {
          role,
          revision: String(revision),
          ...(role === 'admin' ? { data } : { staffData: staffData(data) }),
        },
      });
    });
    await mockOrders(
      page,
      () => data,
      () => role,
    );
    await page.goto('/sales');
    await page.getByPlaceholder('Найти напиток…').fill('Gin tonic Beefeater');
    await expect(page.locator('.stock-alert')).toHaveCount(0);
    const sell = async (quantity: number) => {
      // Every sale starts from the day log: a tap there opens a walk-in order with the dialog.
      if (!page.url().endsWith('/sales'))
        await page.getByRole('link', { name: 'Продажи Каждый день' }).click();
      await page.locator('.drink-card').first().click();
      await page.getByLabel('Количество порций', { exact: true }).fill(String(quantity));
      await page.getByRole('button', { name: 'Записать продажу', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    };
    await sell(1);
    await expect(page.locator('.stock-alert')).toHaveCount(1);
    await expect(page.locator('.stock-alert')).toContainText('Заканчивается: Gin Beefeater · 150 мл');
    await page.getByRole('button', { name: 'Скрыть уведомление: Gin Beefeater' }).click();
    await sell(1);
    await expect(page.locator('.stock-alert')).toHaveCount(0);
    await sell(2);
    await expect(page.locator('.stock-alert')).toContainText('Закончилось: Gin Beefeater · 0 мл');
    expect(await page.locator('.stock-alerts').innerText()).not.toMatch(/֏|себестоимость|цена/i);
    data.purchases.find((p) => p.alcoholId === 'gin')!.ml += 500;
    revision++;
    await page.getByRole('button', { name: 'Обновить данные', exact: true }).click();
    await expect(page.locator('.stock-alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Уведомления об остатках', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Системные уведомления ещё не настроены');
    await expect(page.getByRole('button', { name: 'Включить push на этом устройстве' })).toBeDisabled();
    // The bell opens a side panel: settings, then the received list, and a row shows its full text.
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.notification-list li')).toHaveCount(role === 'admin' ? 2 : 1);
    await dialog.locator('.notification-list button').first().click();
    await expect(dialog.locator('.notification-detail')).toContainText(
      role === 'admin' ? /12.000 ֏/ : 'Закончилось: Gin Beefeater',
    );
    if (role === 'barbar') expect(await dialog.innerText()).not.toMatch(/֏/);
    await dialog.getByRole('button', { name: 'К списку', exact: true }).click();
    await expect(dialog.locator('.notification-list li')).toHaveCount(role === 'admin' ? 2 : 1);
  });
}
