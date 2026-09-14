import { expect, test } from '@playwright/test';
import { staffData } from '../netlify/lib/barbar-access';
import { fixtureData } from './fixtures';
import type { Preferences } from '../src/barbar/domain/identity/preferences';

test('worker preferences persist across screens and refresh without exposing financial tools', async ({
  page,
}) => {
  const data = fixtureData();
  let preferences: Preferences = { language: 'ru', currency: 'AMD', theme: 'light' };
  let rates = 0;
  await page.route('**/api/barbar/auth', async (r) => {
    if (r.request().method() === 'PATCH') preferences = r.request().postDataJSON();
    await r.fulfill({
      json: {
        authenticated: true,
        role: 'barbar',
        user: { id: 'worker', fullName: 'Ника', role: 'worker', preferences },
      },
    });
  });
  await page.route('**/api/barbar', (r) =>
    r.fulfill({ json: { role: 'barbar', revision: 'shared', staffData: staffData(data) } }),
  );
  await page.route('**/api/barbar/rates', (r) => {
    rates++;
    return r.fulfill({
      json: {
        date: '2026-09-14',
        fetchedAt: '2026-09-14T12:00:00Z',
        amdPerUnit: { AMD: 1, EUR: 450, USD: 400, RUB: 4 },
      },
    });
  });
  await page.goto('/inventory');
  await page.getByLabel('Валюта отображения', { exact: true }).selectOption('EUR');
  await page.locator('.theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Язык', { exact: true }).selectOption('en');
  await page.reload();
  await expect(page.getByLabel('Language', { exact: true })).toHaveValue('en');
  await expect(page.getByLabel('Display currency', { exact: true })).toHaveValue('EUR');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Language', { exact: true }).selectOption('hy');
  await expect(page.locator('.preference-controls select').first()).toHaveValue('hy');
  for (const path of ['/', '/inventory', '/cocktails']) {
    await page.goto(path);
    await expect(page.locator('.preference-controls')).toBeVisible();
    await expect(page.locator('main h1')).toHaveCount(1);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await expect(page.locator('main')).not.toContainText(/Себестоимость|Прибыль|Закупочная/);
    if (path === '/') await expect(page.locator('.drink-card').first()).toContainText('€');
    else await expect(page.locator('main')).not.toContainText(/֏|\$|€|₽/);
  }
  expect(rates).toBeGreaterThan(0);
  await page.locator('.preference-controls select').first().selectOption('ru');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'История операций' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Отчёты|Журнал действий|Пользователи/ })).toHaveCount(0);
  const toolbar = page.locator('.sales-mode-toolbar');
  await expect(toolbar.getByRole('button', { name: 'На весь экран', exact: true })).toBeVisible();
  await expect(toolbar.getByLabel('Дата продаж')).toBeVisible();
  await page.goto('/inventory');
  await expect(page.getByRole('button', { name: /Закупка|Сброс|Изменить|Новый напиток/ })).toHaveCount(0);
});

test('owner and worker share inventory art, shortage styles, and responsive grid in both themes', async ({
  page,
}) => {
  const data = fixtureData();
  data.purchases = [];
  let role = 'admin';
  let theme = 'light';
  await page.route('**/api/barbar/auth', (r) =>
    r.fulfill({
      json: {
        authenticated: true,
        role,
        user: {
          id: role,
          role: role === 'admin' ? 'owner' : 'worker',
          preferences: { language: 'ru', currency: 'AMD', theme },
        },
      },
    }),
  );
  await page.route('**/api/barbar', (r) =>
    r.fulfill({
      json: { role, revision: 'parity', ...(role === 'admin' ? { data } : { staffData: staffData(data) }) },
    }),
  );
  for (const nextTheme of ['light', 'dark']) {
    theme = nextTheme;
    let ownerStyles: unknown;
    for (const nextRole of ['admin', 'barbar']) {
      role = nextRole;
      await page.goto('/inventory');
      await page.getByRole('button', { name: 'Сетка', exact: true }).click();
      const row = page.locator('.inventory-grid-view tbody tr').filter({ hasText: 'Gin Beefeater' });
      await expect(row).toHaveClass('inventory-shortage');
      const styles = await row.evaluate((e) => {
        const image = e.querySelector('.bottle-art')!;
        return {
          background: getComputedStyle(e).backgroundColor,
          photoHeight: getComputedStyle(image).height,
          firstCellShadow: getComputedStyle(e.querySelector('td')!).boxShadow,
          titleSize: getComputedStyle(e.querySelector('strong')!).fontSize,
        };
      });
      expect(styles.firstCellShadow).toBe('none');
      if (role === 'admin') ownerStyles = styles;
      else expect(styles).toEqual(ownerStyles);
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
      if (role === 'barbar') {
        for (const img of await page.locator('.inventory-grid-view tbody tr').first().locator('img').all()) {
          await expect
            .poll(() =>
              img.evaluate(
                (e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0,
              ),
            )
            .toBe(true);
        }
        await page.screenshot({ path: `/tmp/barbar-worker-shared-${theme}.png` });
      }
      await page.getByRole('button', { name: 'Список', exact: true }).click();
      await expect(row).toHaveCount(0);
      await expect(page.locator('.inventory-table')).toContainText('Нет в наличии');
    }
  }
});
