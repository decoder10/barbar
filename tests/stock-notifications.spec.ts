import { expect, test } from '@playwright/test';
import { fixtureData } from './fixtures';
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
    await page.goto('/');
    await page.getByPlaceholder('Найти напиток…').fill('Gin tonic Beefeater');
    await expect(page.locator('.stock-alert')).toHaveCount(0);
    const sell = async (quantity: number) => {
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
    await expect(page.getByRole('dialog')).toContainText(
      'В приложении предупреждения включены автоматически',
    );
    await expect(page.getByRole('dialog')).toContainText('Системные уведомления ещё не настроены');
    await expect(page.getByRole('button', { name: 'Включить push на этом устройстве' })).toBeDisabled();
  });
}
