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
import { stockTotals } from '../src/barbar/domain/model';
import { staffData } from '../netlify/lib/barbar-access';
import { barConfig } from '../src/barbar/config';
import { fixtureData, mockOrders } from './fixtures';

/** Below 1280px the cart is its own bottom-navigation tab; wider screens keep it in the right column. */
async function openCart(page: Page) {
  if ((page.viewportSize()?.width || 1440) < 1280)
    await page.locator('.menu-bottom-nav button').nth(2).click();
}
async function openMenu(page: Page) {
  if ((page.viewportSize()?.width || 1440) < 1280)
    await page.locator('.menu-bottom-nav button').first().click();
}

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
    baseURL,
  }) => {
    const tr = (value: string) =>
      language === 'ru' ? value : (language === 'en' ? en : hy)[value as keyof typeof en] || value;
    const context = await browser.newContext({ viewport: { width, height: 1000 }, baseURL });
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
    await guest
      .locator('.menu-card')
      .filter({ has: guest.getByRole('heading', { name: 'Gin tonic Beefeater', exact: true }) })
      .locator('.guest-add button')
      .first()
      .click();
    await openCart(guest);
    await expect(guest.getByRole('region', { name: cartTitle })).toBeVisible();
    await guest.locator('.guest-cart button[type=submit]').click();
    await expect(guest.locator('.guest-cart [role=status]')).toBeVisible();
    expect(lastInput).not.toBeNull();
    expect(data.sales).toHaveLength(0);
    await guest.reload();
    await openCart(guest);
    await expect(guest.locator('.guest-cart [role=status]')).toBeVisible();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const staff = await context.newPage();
    await staff.addInitScript(({ theme }) => localStorage.setItem('barbar-theme', theme), { theme });
    await mockWorkspace(staff);
    await staff.goto('/');
    // The pending request is queued above the board and marks its own table tile.
    await expect(staff.getByRole('region', { name: tr('Заявки гостей') })).toContainText(tr('Стол'));
    await staff.locator('.tables-board .has-guest-request .table-guest-request').click();
    await staff.getByRole('button', { name: tr('Принять выбранное') }).click();
    await expect(staff).toHaveURL(/\/orders\//);
    await expect(await receipt()).toContainText('Gin tonic Beefeater');
    expect(data.sales).toHaveLength(1);
    await guest.reload();
    await openCart(guest);
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
      await expect(staff).toHaveURL(new URL('/', baseURL).href);
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

test('invalid QR keeps a read-only menu; rejected and expired requests keep the cart open', async ({
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
    await openCart(page);
    await expect(page.locator('.guest-cart [role=status]')).toContainText(
      status === 'rejected' ? 'отклонена' : 'истёк',
    );
    // The cart stays open under a settled request, which the guest can hide.
    await expect(page.getByRole('heading', { name: 'Новая заявка', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отправить заявку', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Скрыть заявку/ }).click();
    await expect(page.locator('.guest-sent')).toHaveCount(0);
  }
});

test('a guest adds to a pending request and cannot order a drink that ran out', async ({ page }) => {
  const data = fixtureData();
  const code = 'a'.repeat(32);
  const inputs: GuestRequestInput[] = [];
  const stored = new Map<string, GuestRequest>();
  // Gin is finished: Gin tonic Beefeater is sold out, Gin tonic Bombay still pours.
  const balances = stockTotals(data);
  balances.set('gin', 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('barbar-guest-language', 'ru'));
  await page.route('**/api/menu', (route) => route.fulfill({ json: guestMenu(data, 'r', balances) }));
  await page.route('**/api/guest-order**', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as GuestRequestInput;
      inputs.push(input);
      const request: GuestRequest = {
        id: input.id,
        tableId: 'table',
        tableName: '1',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 900000).toISOString(),
        status: 'pending',
        comment: input.comment,
        lines: quoteGuestRequest(data, input, balances),
      };
      stored.set(input.id, request);
      return route.fulfill({ json: { request } });
    }
    if (id) return route.fulfill({ json: { request: stored.get(id) } });
    return route.fulfill({ json: { table: { id: 'table', name: '1' } } });
  });
  await page.goto(`/menu?table=${code}`);
  const card = (name: string) =>
    page.locator('.menu-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const soldOut = card('Gin tonic Beefeater');
  await expect(soldOut).toHaveClass(/sold-out/);
  await expect(soldOut.locator('.menu-stock')).toHaveText('Нет в наличии');
  await expect(soldOut.locator('.guest-add button')).toBeDisabled();
  const bombay = card('Gin tonic Bombay');
  await expect(bombay.locator('.menu-stock')).toHaveText('В наличии');
  const send = page.getByRole('button', { name: 'Отправить заявку', exact: true });
  await bombay.locator('.guest-add button').click();
  await openCart(page);
  await send.click();
  await expect(page.locator('.guest-sent [role=status]')).toHaveText(
    'Заявка отправлена. Ожидайте сотрудника.',
  );
  // While staff consider it, the guest adds another drink and sends it as a new request.
  await openMenu(page);
  await expect(bombay.locator('.guest-add button')).toBeEnabled();
  await bombay.locator('.guest-add button').click();
  await openCart(page);
  await expect(page.getByRole('heading', { name: 'Добавить к заказу', exact: true })).toBeVisible();
  await send.click();
  await expect(page.locator('.guest-sent-request')).toHaveCount(2);
  expect(inputs).toHaveLength(2);
  expect(inputs[1].id).not.toBe(inputs[0].id);
  // Both statuses survive a reload; a settled one can be hidden, the pending one stays.
  stored.set(inputs[0].id, { ...stored.get(inputs[0].id)!, status: 'rejected' });
  await page.reload();
  await openCart(page);
  await expect(page.locator('.guest-sent-request.rejected')).toHaveCount(1);
  await expect(page.locator('.guest-sent-request.pending')).toHaveCount(1);
  await page.getByRole('button', { name: /^Скрыть заявку/ }).click();
  await expect(page.locator('.guest-sent-request')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/barbar-guest-additions.png' });
});

for (const language of ['ru', 'en', 'hy'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 1280, 1440]) {
      test(`cart availability follows refreshed menu ${language}/${theme}/${width}`, async ({ page }) => {
        const tr = (value: string) =>
          language === 'ru' ? value : (language === 'en' ? en : hy)[value as keyof typeof en] || value;
        const data = fixtureData();
        const balances = stockTotals(data);
        const inputs: GuestRequestInput[] = [];
        let request: GuestRequest | null = null;
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript(
          ({ language, theme }) => {
            localStorage.setItem('barbar-guest-language', language);
            localStorage.setItem('barbar-guest-theme', theme);
          },
          { language, theme },
        );
        // No test request may reach the local workspace database.
        await page.route('**/api/**', (route) => route.abort());
        await page.route('**/api/menu', (route) => route.fulfill({ json: guestMenu(data, 'r', balances) }));
        await page.route('**/api/guest-order**', (route) => {
          if (route.request().method() === 'POST') {
            const input = route.request().postDataJSON() as GuestRequestInput;
            inputs.push(input);
            request = {
              id: input.id,
              tableId: 'table',
              tableName: '1',
              status: 'pending',
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 900000).toISOString(),
              comment: input.comment,
              lines: quoteGuestRequest(data, input, balances),
            };
            return route.fulfill({ json: { request } });
          }
          return route.fulfill({
            json: new URL(route.request().url()).searchParams.has('id')
              ? { request }
              : { table: { id: 'table', name: '1' } },
          });
        });
        await page.goto(`/menu?table=${'a'.repeat(32)}`);
        const card = (name: string) =>
          page.locator('.menu-card').filter({
            has: page.getByRole('heading', { name, exact: true }),
          });
        const beef = card('Gin tonic Beefeater');
        const bombay = card('Gin tonic Bombay');
        const cart = page.locator('.guest-cart');
        const line = cart.locator('form .guest-cart-lines > li').filter({ hasText: 'Gin tonic Beefeater' });
        const more = (scope: ReturnType<Page['locator']>) =>
          scope.getByRole('button', { name: new RegExp(`^${tr('Увеличить количество')}`) });
        const refresh = async () => {
          const loaded = page.waitForResponse('**/api/menu');
          await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
          await loaded;
        };
        await beef.locator('.guest-add button').click();
        await more(beef).click();
        await openCart(page);
        await expect(line.locator('output')).toHaveText('2');
        // The stock changes after the item was added: both controls must use the new menu.
        balances.set('gin', 0);
        await refresh();
        await expect(line.locator('.guest-cart-stock')).toHaveText(tr('Нет в наличии'));
        await expect(more(line)).toBeDisabled();
        await expect(cart.locator('.guest-cart-availability')).toHaveText(
          tr('Недоступные позиции не войдут в заявку и останутся в корзине.'),
        );
        const send = cart.locator('button[type=submit]');
        await expect(send).toBeDisabled();
        await expect(cart.locator('.guest-cart-total strong')).toHaveText('0 ֏');
        await line.getByRole('button', { name: new RegExp(`^${tr('Уменьшить количество')}`) }).click();
        await expect(line.locator('output')).toHaveText('1');
        await openMenu(page);
        await expect(more(beef)).toBeDisabled();
        await expect(beef.locator('output')).toHaveText('1');
        await bombay.locator('.guest-add button').click();
        await openCart(page);
        await expect(send).toBeEnabled();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const commentBox = await cart.locator('textarea').boundingBox();
        const sendBox = await send.boundingBox();
        expect(sendBox!.y - (commentBox!.y + commentBox!.height)).toBeGreaterThanOrEqual(18);
        if (width >= 1280) {
          const sidebar = await page.locator('.menu-favorites').boundingBox();
          expect(sidebar!.width).toBeGreaterThan(268);
        }
        await page.screenshot({ path: `/tmp/barbar-cart-availability-${language}-${theme}-${width}.png` });
        // The unavailable line does not block the available drink and stays in the editable cart.
        await send.click();
        await expect(cart.locator('.guest-sent-request')).toHaveCount(1);
        expect(inputs).toHaveLength(1);
        expect(inputs[0].lines).toHaveLength(1);
        expect(request!.lines[0].name).toBe('Gin tonic Bombay');
        await expect(line.locator('output')).toHaveText('1');
        await expect(send).toBeDisabled();
        // A restock re-enables the retained line, and a later stock-out still permits deletion.
        balances.set('gin', 2000);
        await refresh();
        await expect(line.locator('.guest-cart-stock')).toHaveCount(0);
        await expect(more(line)).toBeEnabled();
        await more(line).click();
        await expect(line.locator('output')).toHaveText('2');
        await expect(send).toBeEnabled();
        balances.set('gin', 0);
        await refresh();
        await expect(more(line)).toBeDisabled();
        await line.locator('.guest-cart-remove').click();
        await expect(line).toHaveCount(0);
        await expect(cart.locator('.guest-cart-availability')).toHaveCount(0);
        await expect(send).toBeDisabled();
      });
    }
  }
}

for (const settle of ['retry', 'status'] as const) {
  test(`availability changes preserve an uncertain submission (${settle})`, async ({ page }) => {
    const data = fixtureData();
    const balances = stockTotals(data);
    const inputs: GuestRequestInput[] = [];
    let request: GuestRequest | null = null;
    await page.addInitScript(() => localStorage.setItem('barbar-guest-language', 'ru'));
    await page.route('**/api/**', (route) => route.abort());
    await page.route('**/api/menu', (route) => route.fulfill({ json: guestMenu(data, 'r', balances) }));
    await page.route('**/api/guest-order**', (route) => {
      if (route.request().method() === 'POST') {
        inputs.push(route.request().postDataJSON() as GuestRequestInput);
        return inputs.length === 1 ? route.abort('failed') : route.fulfill({ json: { request } });
      }
      if (new URL(route.request().url()).searchParams.has('id'))
        return request && (settle === 'status' || inputs.length > 1)
          ? route.fulfill({ json: { request } })
          : route.fulfill({ status: 404, json: { error: 'Заявка не найдена.' } });
      return route.fulfill({ json: { table: { id: 'table', name: '1' } } });
    });
    await page.clock.install();
    await page.goto(`/menu?table=${'a'.repeat(32)}`);
    const beef = page.locator('.menu-card').filter({
      has: page.getByRole('heading', { name: 'Gin tonic Beefeater', exact: true }),
    });
    await beef.locator('.guest-add button').click();
    await page.locator('.guest-cart button[type=submit]').click();
    const retry = page.getByRole('button', { name: 'Повторить отправку', exact: true });
    await expect(retry).toBeEnabled();
    balances.set('gin', 0);
    const refreshed = page.waitForResponse('**/api/menu');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await refreshed;
    await expect(page.locator('.guest-cart-stock')).toHaveText('Нет в наличии');
    await expect(page.locator('.guest-cart-remove')).toBeDisabled();
    await expect(retry).toBeEnabled();
    request = {
      id: inputs[0].id,
      tableId: 'table',
      tableName: '1',
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      comment: inputs[0].comment,
      lines: quoteGuestRequest(data, inputs[0]),
    };
    if (settle === 'retry') {
      await retry.click();
      expect(inputs).toHaveLength(2);
      expect(inputs[1]).toEqual(inputs[0]);
    } else {
      await page.clock.runFor(10000);
      expect(inputs).toHaveLength(1);
    }
    await expect(page.locator('.guest-sent-request')).toHaveCount(1);
    await expect(page.locator('.guest-cart form .guest-cart-lines > li')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Отправить заявку', exact: true })).toBeDisabled();
  });
}

test('staff see every request from two tables; adding a table closes the editor', async ({ page }) => {
  let data = applyCommand(fixtureData(), {
    id: 'table',
    type: 'saveTable',
    value: { id: 'table', name: '1', order: 0, active: true },
  });
  data = applyCommand(data, {
    id: 'table-2',
    type: 'saveTable',
    value: { id: 'table-2', name: '2', order: 1, active: true },
  });
  const request = (id: string, productName: string, minutes: number, tableIndex = 0): GuestRequest => {
    const table = data.tables![tableIndex];
    const productId = data.cocktails.find((c) => c.name === productName)!.id;
    return {
      id,
      tableId: table.id,
      tableName: table.name,
      createdAt: new Date(Date.now() - minutes * 60000).toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      status: 'pending',
      comment: '',
      lines: quoteGuestRequest(data, {
        id,
        code: table.code,
        comment: '',
        lines: [{ id: 'one', kind: 'cocktail', productId, quantity: 1 }],
      }),
    };
  };
  let requests = [
    request('a'.repeat(32), 'Gin tonic Beefeater', 4),
    request('b'.repeat(32), 'Gin tonic Bombay', 1),
    request('c'.repeat(32), 'Gin tonic Beefeater', 2, 1),
  ];
  await page.route('**/api/**', (route) => route.abort());
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'admin' } }),
  );
  await page.route('**/api/barbar/notifications', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/barbar/guest-requests', (route) => route.fulfill({ json: { requests } }));
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
  await mockOrders(page, () => data);
  await page.route('**/api/barbar', async (route) => {
    if (route.request().method() === 'POST') {
      const command = route.request().postDataJSON().command;
      const target = requests.find((r) => r.id === command.requestId);
      if (command.type === 'acceptGuestRequest')
        data = acceptGuestRequest(data, target!, command.lineIds, {}).data;
      else if (command.type !== 'rejectGuestRequest') data = applyCommand(data, command);
      requests = requests.filter((r) => r !== target);
    }
    await route.fulfill({ json: { role: 'admin', data, revision: String(data.operations.length) } });
  });
  await page.goto('/');
  // Both tables are visible together; the first table has two independent requests.
  const chips = page.locator('.guest-request-chip');
  await expect(chips).toHaveCount(2);
  const chip = chips.filter({ has: page.locator('strong', { hasText: /^Стол 1$/ }) });
  await expect(chip).toContainText('Заявок: 2');
  await expect(chip).toContainText('Gin tonic Beefeater × 1, Gin tonic Bombay × 1');
  const secondChip = chips.filter({ has: page.locator('strong', { hasText: /^Стол 2$/ }) });
  await expect(secondChip).toContainText('Gin tonic Beefeater × 1');
  const strips = page.locator('.tables-board .table-guest-request');
  const tableStrip = (name: string) =>
    page
      .locator('.table-tile-wrap')
      .filter({ has: page.locator('.table-name', { hasText: new RegExp(`^${name}$`) }) })
      .locator('.table-guest-request');
  await expect(strips).toHaveCount(2);
  await tableStrip('2').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Стол 2', exact: true })).toBeVisible();
  await expect(sheet.locator('.guest-request-card')).toHaveCount(1);
  await sheet.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await tableStrip('1').click();
  await expect(sheet.getByRole('heading', { name: 'Стол 1', exact: true })).toBeVisible();
  await expect(sheet.locator('.guest-request-card')).toHaveCount(2);
  await sheet.getByRole('button', { name: 'Отклонить заявку', exact: true }).first().click();
  // The second request stays on screen; its acceptance opens the table's receipt.
  await expect(sheet.locator('.guest-request-card')).toHaveCount(1);
  await expect(sheet.locator('.guest-request-card')).toContainText('Gin tonic Bombay');
  await sheet.getByRole('button', { name: 'Принять выбранное', exact: true }).click();
  await expect(page).toHaveURL(/\/orders\//);
  expect(data.sales).toHaveLength(1);
  await page.goto('/');
  await expect(chips).toHaveCount(1);
  await expect(secondChip).toBeVisible();
  await expect(strips).toHaveCount(1);
  await expect(tableStrip('2')).toBeVisible();
  await page.getByRole('button', { name: 'Настроить столы', exact: true }).click();
  await page.getByLabel('Новый стол').fill('3');
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(data.tables).toHaveLength(3);
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
    const card = page
      .locator('.menu-card')
      .filter({ has: page.getByRole('heading', { name: 'Gin tonic Beefeater', exact: true }) });
    const add = async () => {
      await openMenu(page);
      await card.locator('.guest-add button').first().click();
      await openCart(page);
    };
    const saved = () =>
      page.evaluate((key) => JSON.parse(sessionStorage.getItem(`guest-order:${key}`) || 'null'), code);
    const retry = page.getByRole('button', { name: tr('Повторить отправку'), exact: true });
    const startNew = page.getByRole('button', { name: tr('Новая заявка'), exact: true });
    const send = page.getByRole('button', { name: tr('Отправить заявку'), exact: true });
    await page.goto(`/menu?table=${code}`);
    await card.locator('.guest-add button').first().click();
    // The card turns into «− N +», capped at the configured portions.
    const more = card.getByRole('button', { name: new RegExp(`^${tr('Увеличить количество')}`) });
    const less = card.getByRole('button', { name: new RegExp(`^${tr('Уменьшить количество')}`) });
    for (let n = 1; n < barConfig.guest.orders.maxPortions; n++) await more.click();
    await expect(card.locator('.guest-stepper output')).toHaveText(
      String(barConfig.guest.orders.maxPortions),
    );
    await expect(more).toBeDisabled();
    while (Number(await card.locator('.guest-stepper output').textContent()) > 2) await less.click();
    await openCart(page);
    await expect(page.locator('.guest-cart .guest-stepper output')).toHaveText('2');
    await page.getByLabel(tr('Комментарий к заявке')).fill('Terrace');
    await send.click();
    await expect(retry).toBeEnabled();
    await expect(startNew).toHaveCount(0);
    await expect.poll(saved).toEqual({ id: inputs[0].id, input: inputs[0] });
    expect(inputs[0].lines[0].quantity).toBe(2);

    await page.reload();
    await openCart(page);
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
    await openCart(page);
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
