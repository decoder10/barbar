import en from '../src/barbar/presentation/i18n/en.json' with { type: 'json' };
import hy from '../src/barbar/presentation/i18n/hy.json' with { type: 'json' };
import { expect, test, type Page } from '@playwright/test';
import { applyCommand } from '../src/barbar/domain/model';
import { guestMenu } from '../src/barbar/domain/guest-menu';
import {
  acceptGuestRequest,
  guestRequestStatus,
  quoteGuestRequest,
  type GuestRequest,
  type GuestRequestInput,
} from '../src/barbar/domain/guest-requests';
import { shiftPreview, paidOrderTotals } from '../src/barbar/domain/shifts';
import { staffData } from '../netlify/lib/barbar-access';
import { fixtureData, mockOrders } from './fixtures';

// All 12 language/theme/viewport combinations run for each role independently.
const scenarios = (['ru', 'en', 'hy'] as const).flatMap((language) =>
  (['light', 'dark'] as const).flatMap((theme) =>
    [390, 820].flatMap((width) =>
      (['admin', 'barbar'] as const).map((role) => ({ language, theme, width, role })),
    ),
  ),
);
for (const { language, theme, width, role } of scenarios) {
  test(`guest request → worker → payment → shift ${language}/${theme}/${width}/${role}`, async ({
    browser,
  }) => {
    const tr = (value: string) =>
      language === 'ru' ? value : (language === 'en' ? en : hy)[value as keyof typeof en] || value;
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      baseURL: 'http://127.0.0.1:4001',
    });
    await context.addInitScript(
      ({ language, theme }) => {
        localStorage.setItem('barbar-guest-language', language);
        localStorage.setItem('barbar-guest-theme', theme);
      },
      { language, theme },
    );
    let data = applyCommand(fixtureData(), {
      id: 'table',
      type: 'saveTable',
      value: { id: 'table', name: '1', order: 0, active: true },
    });
    const code = data.tables![0].code;
    let guestRequest: GuestRequest | null = null;
    let lastInput: GuestRequestInput | null = null;
    const guest = await context.newPage();
    await guest.route('**/api/menu', (route) => route.fulfill({ json: guestMenu(data, 'r') }));
    await guest.route('**/api/guest-order**', async (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (route.request().method() === 'POST') {
        lastInput = route.request().postDataJSON();
        const input = lastInput!;
        guestRequest = {
          id: input.id,
          tableId: 'table',
          tableName: '1',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 900000).toISOString(),
          status: 'pending',
          comment: input.comment,
          lines: quoteGuestRequest(data, input),
        };
        return route.fulfill({ json: { request: guestRequest } });
      }
      return route.fulfill({
        json: params.has('id')
          ? { request: guestRequest && { ...guestRequest, status: guestRequestStatus(guestRequest) } }
          : { table: { id: 'table', name: '1' } },
      });
    });
    await guest.goto(`/menu?table=${code}`);
    const cartTitle = language === 'ru' ? 'Корзина' : language === 'en' ? 'Cart' : 'Զամբյուղ';
    await expect(guest.getByRole('region', { name: cartTitle })).toBeVisible();
    await guest
      .locator('.menu-card')
      .filter({ has: guest.getByRole('heading', { name: 'Gin tonic Beefeater', exact: true }) })
      .locator('.guest-add button')
      .first()
      .click();
    await guest.locator('.guest-cart button[type=submit]').click();
    await expect(guest.locator('.guest-cart [role=status]')).toBeVisible();
    expect(lastInput).not.toBeNull();
    expect(data.sales).toHaveLength(0);
    await guest.reload();
    await expect(guest.locator('.guest-cart [role=status]')).toBeVisible();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const staff = await context.newPage();
    await staff.addInitScript(({ theme }) => localStorage.setItem('barbar-theme', theme), { theme });
    await mockWorkspace(staff);
    await staff.goto('/');
    await staff
      .getByRole('region', { name: tr('Заявки гостей') })
      .getByRole('button', { name: '1 · 1' })
      .click();
    await staff.getByRole('button', { name: tr('Принять выбранное') }).click();
    await expect(staff).toHaveURL(/\/orders\//);
    await expect(await receipt()).toContainText('Gin tonic Beefeater');
    expect(data.sales).toHaveLength(1);
    await guest.reload();
    await expect(guest.locator('.guest-cart [role=status]')).toContainText(
      language === 'ru' ? 'принята' : language === 'en' ? 'accepted' : 'ընդունված',
    );
    // Use the shared payment dialog; the new shift screen is reached from the board.
    await (await receipt()).getByRole('button', { name: new RegExp('^' + tr('Оплатить')) }).click();
    await staff.locator('.payment-submit').click();
    await expect.poll(() => data.orders![0].status).toBe('paid');
    await staff.goto('/');
    await expect(staff.getByRole('button', { name: tr('Закрыть смену'), exact: true })).toBeVisible();
    expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await staff.screenshot({ path: `/tmp/barbar-tables-${language}-${theme}-${width}-${role}.png` });
    await staff.getByRole('button', { name: tr('Закрыть смену'), exact: true }).click();
    await staff.getByLabel(tr('Пересчитанная наличная выручка, AMD')).fill(String(data.orders![0].total));
    await staff.getByRole('button', { name: tr('Подтвердить закрытие смены') }).click();
    await expect(staff.getByRole('dialog')).toHaveCount(0);
    expect(data.shifts).toHaveLength(1);
    expect(data.shifts![0].difference).toBe(0);
    await staff.goto('/reports');
    if (role === 'admin') {
      await expect(staff.getByRole('heading', { name: tr('Чеки и смены') })).toBeVisible();
      await expect(staff.getByRole('button', { name: tr('Скачать CSV смен') })).toBeEnabled();
    } else {
      // A worker closes shifts but never reaches the money reports behind them.
      await expect(staff).toHaveURL('http://127.0.0.1:4001/');
      await expect(staff.getByRole('heading', { name: tr('Чеки и смены') })).toHaveCount(0);
      await expect(staff.getByRole('button', { name: tr('Скачать CSV смен') })).toHaveCount(0);
    }
    // Workspace screens must fit the device too, not only the guest menu.
    expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await guest.screenshot({
      path: `/tmp/barbar-guest-${language}-${theme}-${width}-${role}.png`,
      fullPage: false,
    });
    await staff.screenshot({
      path: `/tmp/barbar-staff-${language}-${theme}-${width}-${role}.png`,
      fullPage: false,
    });
    await context.close();

    /** Phones keep the receipt in a bottom sheet behind the order bar; wider screens show a side panel. */
    async function receipt() {
      const panel = staff.locator('.day-receipt.order-panel');
      if (width <= 760) {
        if (!(await panel.isVisible())) await staff.locator('.day-receipt-bar.order-bar').click();
        return panel;
      }
      return staff.getByRole('complementary', { name: tr('Чек заказа') });
    }

    async function mockWorkspace(page: Page) {
      await page.route('**/api/barbar/auth', (route) =>
        route.fulfill({
          json: {
            authenticated: true,
            role,
            user: {
              id: 'worker',
              fullName: 'Worker',
              role: role === 'admin' ? 'owner' : 'worker',
              preferences: { language, theme, currency: 'AMD' },
            },
          },
        }),
      );
      await page.route('**/api/barbar/notifications', (route) => route.fulfill({ json: { items: [] } }));
      await page.route('**/api/barbar/guest-requests', (route) =>
        route.fulfill({ json: { requests: guestRequest?.status === 'pending' ? [guestRequest] : [] } }),
      );
      await page.route('**/api/barbar/shifts?**', (route) => {
        const day = new URL(route.request().url()).searchParams.get('from')!;
        return route.fulfill({
          json: {
            preview: shiftPreview(data.orders || [], day),
            totals: paidOrderTotals(data.orders || []),
            shifts: data.shifts || [],
          },
        });
      });
      await mockOrders(
        page,
        () => data,
        () => role,
      );
      await page.route('**/api/barbar', async (route) => {
        try {
          if (route.request().method() === 'POST') {
            const command = route.request().postDataJSON().command;
            if (command.type === 'acceptGuestRequest') {
              const result = acceptGuestRequest(data, guestRequest!, command.lineIds, {});
              data = result.data;
              guestRequest = result.request;
            } else data = applyCommand(data, command);
          }
          await route.fulfill({
            json: {
              role,
              ...(role === 'admin' ? { data } : { staffData: staffData(data) }),
              revision: String(data.operations.length),
            },
          });
        } catch (e) {
          await route.fulfill({ status: 400, json: { error: (e as Error).message } });
        }
      });
    }
  });
}

test('invalid QR keeps a read-only menu; rejected and expired requests allow a new request', async ({
  page,
}) => {
  const data = fixtureData();
  await page.addInitScript(() => localStorage.setItem('barbar-guest-language', 'ru'));
  await page.route('**/api/menu', (route) => route.fulfill({ json: guestMenu(data, 'r') }));
  await page.route('**/api/guest-order**', (route) =>
    route.fulfill({ status: 404, json: { error: 'Стол недоступен.' } }),
  );
  await page.goto('/menu?table=invalid');
  await expect(page.locator('.menu-card').first()).toBeVisible();
  await expect(page.locator('.guest-cart')).toHaveCount(0);
  await expect(page.locator('.guest-add')).toHaveCount(0);
  await page.unroute('**/api/guest-order**');
  const code = 'a'.repeat(32);
  const id = 'b'.repeat(32);
  const request: GuestRequest = {
    id,
    tableId: 'table',
    tableName: '1',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    status: 'rejected',
    lines: [],
    comment: '',
  };
  await page.route('**/api/guest-order**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.has('id')
        ? { request }
        : { table: { id: 'table', name: '1' } },
    }),
  );
  for (const status of ['rejected', 'expired'] as const) {
    request.status = status;
    await page.evaluate(
      ({ code, id }) => sessionStorage.setItem(`guest-order:${code}`, JSON.stringify({ id })),
      { code, id },
    );
    await page.goto(`/menu?table=${code}`);
    await expect(page.locator('.guest-cart [role=status]')).toContainText(
      status === 'rejected' ? 'отклонена' : 'истёк',
    );
    await page.getByRole('button', { name: 'Новая заявка', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Отправить заявку', exact: true })).toBeVisible();
  }
});

for (const language of ['ru', 'en', 'hy'] as const) {
  test(`lost response keeps the token; terminal 409 allows an explicit new request (${language})`, async ({
    page,
  }) => {
    const tr = (value: string) =>
      language === 'ru' ? value : (language === 'en' ? en : hy)[value as keyof typeof en] || value;
    const data = fixtureData();
    const code = 'a'.repeat(32);
    const inputs: GuestRequestInput[] = [];
    let current: GuestRequest | null = null;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => localStorage.setItem('barbar-guest-language', value), language);
    await page.route('**/api/menu', (route) => route.fulfill({ json: guestMenu(data, 'r') }));
    await page.route('**/api/guest-order**', (route) => {
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON() as GuestRequestInput;
        inputs.push(input);
        // The first response is lost; status has since been removed by TTL.
        if (inputs.length === 1) return route.abort('failed');
        if (inputs.length === 2)
          return route.fulfill({
            status: 503,
            json: { error: 'Статус недоступен. Повторите проверку позже.' },
          });
        if (inputs.length === 3)
          return route.fulfill({ status: 409, json: { error: 'Заявка уже обработана или истекла.' } });
        current = {
          id: input.id,
          tableId: 'table',
          tableName: '1',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 900000).toISOString(),
          status: 'pending',
          comment: input.comment,
          lines: quoteGuestRequest(data, input),
        };
        return route.fulfill({ json: { request: current } });
      }
      if (new URL(route.request().url()).searchParams.has('id'))
        return current
          ? route.fulfill({ json: { request: current } })
          : route.fulfill({ status: 404, json: { error: 'Заявка не найдена.' } });
      return route.fulfill({ json: { table: { id: 'table', name: '1' } } });
    });
    const add = () =>
      page
        .locator('.menu-card')
        .filter({ has: page.getByRole('heading', { name: 'Gin tonic Beefeater', exact: true }) })
        .locator('.guest-add button')
        .first()
        .click();
    const saved = () =>
      page.evaluate((key) => JSON.parse(sessionStorage.getItem(`guest-order:${key}`) || 'null'), code);
    const retry = page.getByRole('button', { name: tr('Повторить отправку'), exact: true });
    const startNew = page.getByRole('button', { name: tr('Новая заявка'), exact: true });
    const send = page.getByRole('button', { name: tr('Отправить заявку'), exact: true });
    await page.goto(`/menu?table=${code}`);
    await add();
    await page.getByLabel(tr('Комментарий к заявке')).fill('Terrace');
    await send.click();
    await expect(retry).toBeEnabled();
    await expect(startNew).toHaveCount(0);
    await expect.poll(saved).toEqual({ id: inputs[0].id, input: inputs[0] });

    await page.reload();
    await expect(page.locator('.guest-cart [role=alert]')).toBeVisible();
    await expect.poll(saved).toEqual({ id: inputs[0].id, input: inputs[0] });
    await retry.click();
    await expect(retry).toBeEnabled();
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toEqual(inputs[0]);
    await expect(startNew).toHaveCount(0);
    await expect.poll(saved).toEqual({ id: inputs[0].id, input: inputs[0] });

    await retry.click();
    await expect(page.locator('.guest-cart [role=status]')).toHaveText(
      tr('Заявка уже обработана или истекла.'),
    );
    expect(inputs).toHaveLength(3);
    expect(inputs[2]).toEqual(inputs[0]);
    await expect(retry).toHaveCount(0);
    await expect.poll(saved).toEqual({ id: inputs[0].id, terminal: true });
    await page.reload();
    await expect(startNew).toBeVisible();
    await expect(retry).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/barbar-terminal-request-${language}.png` });
    await startNew.click();
    await expect.poll(saved).toBeNull();
    await expect(send).toBeDisabled();
    await expect(page.getByLabel(tr('Комментарий к заявке'))).toBeEmpty();
    await add();
    await send.click();
    await expect(page.locator('.guest-cart [role=status]')).toHaveText(
      tr('Заявка отправлена. Ожидайте сотрудника.'),
    );
    expect(inputs).toHaveLength(4);
    expect(inputs[3].id).not.toBe(inputs[0].id);
    expect(inputs[3].comment).toBe('');
  });
}
