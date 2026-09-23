import { expect, test, type Page } from '@playwright/test';
import en from '../src/barbar/presentation/i18n/en.json' with { type: 'json' };
import hy from '../src/barbar/presentation/i18n/hy.json' with { type: 'json' };
import type { FeedItem } from '../src/barbar/domain/notifications/feed';
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
    // The bell names its unread count, so it is found by its place in the header.
    await page.locator('.notifications-bell').click();
    await expect(page.getByRole('dialog')).toContainText('Системные уведомления ещё не настроены');
    await expect(page.getByRole('button', { name: 'Включить push на этом устройстве' })).toBeDisabled();
    // Push is a compact header action; a feed row opens its full text.
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.modal-heading .notification-push-toggle')).toBeVisible();
    await expect(dialog.locator('.notification-settings')).toHaveCount(0);
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

async function mockNotificationWorkspace(
  page: Page,
  user: () => { id: string; language: 'ru' | 'en' | 'hy'; theme: 'light' | 'dark' },
) {
  const data = fixtureData();
  await page.route('**/api/**', (route) => route.abort());
  await page.route('**/api/barbar/auth', (route) => {
    const { id, language, theme } = user();
    return route.fulfill({
      json: {
        authenticated: true,
        role: 'admin',
        user: { id, fullName: id, role: 'owner', preferences: { language, theme, currency: 'AMD' } },
      },
    });
  });
  await page.route('**/api/barbar', (route) =>
    route.fulfill({ json: { role: 'admin', data, revision: '1' } }),
  );
  await page.route('**/api/barbar/guest-requests', (route) => route.fulfill({ json: { requests: [] } }));
  await mockOrders(page, () => data);
}

for (const language of ['ru', 'en', 'hy'] as const) {
  for (const width of [390, 1440]) {
    test(`guest notifications show tables and persist read/clear marks ${language}/${width}`, async ({
      page,
    }) => {
      const tr = (value: string) =>
        language === 'ru' ? value : (language === 'en' ? en : hy)[value as keyof typeof en] || value;
      let userId = 'notification-reader';
      await page.setViewportSize({ width, height: 1000 });
      await mockNotificationWorkspace(page, () => ({
        id: userId,
        language,
        theme: width === 390 ? 'dark' : 'light',
      }));
      await page.route('**/api/barbar/push', (route) => route.fulfill({ json: { publicKey: null } }));
      const items: FeedItem[] = [
        {
          id: 'guest:three',
          kind: 'guest',
          createdAt: '2026-09-23T09:03:00.000Z',
          delivered: true,
          tableName: '3',
          lines: [
            { name: 'Ararat', quantity: 3 },
            { name: 'Gyumri', quantity: 6 },
          ],
          total: 4500,
          comment: 'Без льда',
        },
        {
          id: 'guest:legacy',
          kind: 'guest',
          createdAt: '2026-09-23T09:02:00.000Z',
          delivered: true,
          tableName: '12',
        },
        {
          id: 'stock:empty',
          kind: 'stock',
          createdAt: '2026-09-23T09:01:00.000Z',
          delivered: false,
          alerts: [{ id: 'gin', name: 'Gin', unit: 'ml', quantity: 0, threshold: 150, severity: 'empty' }],
        },
        {
          id: 'purchase:one',
          kind: 'purchase',
          createdAt: '2026-09-23T09:00:00.000Z',
          delivered: true,
          purchase: {
            purchaseId: 'one',
            name: 'Gin',
            quantity: 700,
            unit: 'ml',
            amount: 12000,
            date: '2026-09-23',
            createdAt: '2026-09-23T09:00:00.000Z',
          },
        },
      ];
      const methods: string[] = [];
      await page.route('**/api/barbar/notifications', (route) => {
        methods.push(route.request().method());
        return route.fulfill({ json: { items } });
      });
      const drawer = page.getByRole('dialog');
      const open = async () => {
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        await page.locator('.notifications-bell').click();
        await expect(drawer).toBeVisible();
      };
      await page.goto('/sales');
      await open();
      await expect(drawer.locator('.notification-count')).toHaveText('4');
      await expect(drawer.locator('.notification-dot')).toHaveCount(4);
      const guest = drawer.locator('.notification-item.guest').first();
      await expect(guest.locator('strong')).toHaveText(`${tr('Стол')} 3`);
      await expect(guest.locator('time')).toBeVisible();
      await expect(guest.locator('.notification-meta')).toContainText(`2 ${tr('позиций')}`);
      await expect(guest.locator('.notification-meta')).toContainText(/4.500 ֏/);
      await expect(guest).toContainText('Ararat × 3, Gyumri × 6');
      await expect(guest).toContainText('Без льда');
      const legacy = drawer.locator('.notification-item.guest').nth(1);
      await expect(legacy.locator('strong')).toHaveText(`${tr('Стол')} 12`);
      await expect(legacy.locator('.notification-summary')).toHaveCount(0);
      await expect(drawer.locator('.modal-heading .notification-push-toggle')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect(drawer.locator('.notification-settings')).toHaveCount(0);
      await page.screenshot({ path: `/tmp/barbar-notifications-${language}-${width}.png` });
      await guest.getByRole('button').click();
      const detail = drawer.locator('.notification-detail');
      await expect(detail.getByRole('heading')).toHaveText(`${tr('Стол')} 3`);
      await expect(detail.locator('.notification-lines li')).toHaveText(['Ararat × 3', 'Gyumri × 6']);
      await expect(detail.locator('.notification-total')).toContainText(/4.500 ֏/);
      await expect(detail.locator('.notification-comment')).toContainText('Без льда');
      await expect(detail.getByRole('button', { name: tr('К списку'), exact: true })).toHaveCount(0);
      const back = drawer
        .locator('.modal-heading')
        .getByRole('button', { name: tr('К списку'), exact: true });
      await expect(back).toBeVisible();
      expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/barbar-notification-detail-${language}-${width}.png` });
      await back.click();
      await expect(drawer.locator('.notification-item.unread')).toHaveCount(3);
      await expect(drawer.getByRole('heading', { name: tr('Прочитанные'), exact: true })).toBeVisible();
      // Opening an item marks just that item, including after a reload.
      await page.reload();
      await open();
      await expect(drawer.locator('.notification-item.unread')).toHaveCount(3);
      await drawer.getByRole('button', { name: tr('Прочитать все'), exact: true }).click();
      await page.reload();
      await open();
      await expect(drawer.locator('.notification-item')).toHaveCount(4);
      await expect(drawer.locator('.notification-item.unread')).toHaveCount(0);
      await drawer.getByRole('button', { name: tr('Очистить'), exact: true }).click();
      await expect(drawer.locator('.notification-item')).toHaveCount(0);
      await page.reload();
      await open();
      await expect(drawer.locator('.notification-empty')).toHaveText(tr('Пока нет уведомлений.'));
      // Device marks are private to this user. The server's queue still holds all four events.
      userId = 'another-reader';
      await page.reload();
      await open();
      await expect(drawer.locator('.notification-item.unread')).toHaveCount(4);
      userId = 'notification-reader';
      items.unshift({ ...items[0], id: 'guest:later', createdAt: '2026-09-23T09:04:00.000Z' });
      await page.reload();
      await open();
      await expect(drawer.locator('.notification-item.unread')).toHaveCount(1);
      await drawer.locator('.notification-item button').click();
      await drawer.getByRole('button', { name: tr('Открыть столы'), exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(drawer).toHaveCount(0);
      expect(items).toHaveLength(5);
      expect(new Set(methods)).toEqual(new Set(['GET']));
    });
  }
}

test('header push toggle shows on/off and busy state without body settings', async ({ page }) => {
  await mockNotificationWorkspace(page, () => ({ id: 'push-reader', language: 'ru', theme: 'light' }));
  // Exercise the UI lifecycle without requesting a real permission or subscribing a device.
  await page.addInitScript(() => {
    const subscription = {
      toJSON: () => ({ endpoint: 'https://example.test/push' }),
      unsubscribe: async () => true,
    };
    const registration = { pushManager: { subscribe: async () => subscription } };
    Object.defineProperty(Notification, 'requestPermission', { value: async () => 'granted' });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: async () => undefined,
        register: async () => registration,
        ready: Promise.resolve(registration),
      },
    });
  });
  let finishSubscription!: () => void;
  const subscriptionPending = new Promise<void>((resolve) => {
    finishSubscription = resolve;
  });
  await page.route('**/api/barbar/notifications', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/barbar/push', async (route) => {
    if (route.request().method() === 'POST') await subscriptionPending;
    await route.fulfill({ json: { publicKey: 'AQAB' } });
  });
  await page.goto('/sales');
  await page.locator('.notifications-bell').click();
  const button = page.getByRole('dialog').locator('.modal-heading .notification-push-toggle');
  await expect(button).toHaveAttribute('aria-label', 'Включить push на этом устройстве');
  await expect(button).toHaveText('');
  await expect(button.locator('.lucide-bell-off')).toBeVisible();
  try {
    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toBeDisabled();
    await expect(button.locator('.spinner')).toBeVisible();
  } finally {
    finishSubscription();
  }
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('aria-label', 'Выключить push на этом устройстве');
  await expect(button.locator('.lucide-bell')).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveAttribute('aria-busy', 'false');
});

test('unsupported push leaves only an explanation, no toggle', async ({ page }) => {
  await mockNotificationWorkspace(page, () => ({ id: 'no-push', language: 'ru', theme: 'light' }));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', { value: undefined });
  });
  await page.route('**/api/barbar/notifications', (route) => route.fulfill({ json: { items: [] } }));
  await page.goto('/sales');
  await page.locator('.notifications-bell').click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.locator('.notification-push-toggle')).toHaveCount(0);
  await expect(drawer).toContainText('Этот браузер не поддерживает push.');
});
