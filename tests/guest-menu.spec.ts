import { expect, test } from '@playwright/test';
import { migrateBottleCatalog } from '../src/barbar/domain/catalog/bottles';
import { guestMenu } from '../src/barbar/domain/guest-menu';
import { applyCommand } from '../src/barbar/domain/model';
import { fixtureData } from './fixtures';

test('public guest menu opens without a session, switches language and follows price changes', async ({
  page,
}, testInfo) => {
  let data = migrateBottleCatalog(fixtureData());
  let revision = 1;
  let authCalls = 0;
  await page.route('**/api/barbar/**', (route) => {
    authCalls++;
    return route.fulfill({ status: 401, json: { error: 'no session' } });
  });
  await page.route('**/api/menu', (route) => route.fulfill({ json: guestMenu(data, `r${revision}`) }));
  await page.addInitScript(() => localStorage.setItem('barbar-guest-language', 'en'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Cocktails' })).toBeVisible();
  await expect(page.locator('.menu-chips nav')).toContainText('Wine');
  const negroni = page.locator('.menu-card').filter({ hasText: 'Negroni' });
  await expect(negroni).toContainText('2,900');
  const wine = page.locator('.menu-card').filter({ hasText: 'Volcani red dry Haghtanak' });
  await expect(wine).toContainText('Glass');
  await expect(wine).toContainText('1,500');
  await expect(wine).toContainText('6,500');
  await page.getByRole('searchbox', { name: 'Search the menu' }).fill('negroni');
  await expect(page.locator('.menu-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search the menu' }).fill('');
  await expect(page.locator('body')).not.toContainText(/себестоим|cost|Закупоч/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(authCalls).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('guest-menu-mobile.png') });
  await page.locator('.menu-chips').getByRole('link', { name: 'Wine', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('guest-menu-wine.png') });

  data = applyCommand(data, {
    id: 'reprice',
    type: 'cocktail',
    value: { ...data.cocktails.find((c) => c.name === 'Negroni')!, price: 3100 },
  });
  revision++;
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Коктейли' })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(negroni).toContainText('3 100');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('guest-menu-desktop.png') });
});

test('owner prints a QR card for the stable guest menu link', async ({ page }, testInfo) => {
  const data = fixtureData();
  await page.route('**/api/barbar/auth', (route) =>
    route.fulfill({ json: { authenticated: true, role: 'admin' } }),
  );
  await page.route('**/api/barbar', (route) =>
    route.fulfill({ json: { data, revision: 'test', role: 'admin' } }),
  );
  await page.goto('/cocktails');
  await page.getByRole('button', { name: 'Гостевое меню', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: 'QR-код гостевого меню' })).toBeVisible();
  await expect(dialog).toContainText('127.0.0.1:4001/menu');
  await expect(dialog.getByRole('link', { name: 'Открыть меню' })).toHaveAttribute('href', '/menu');
  await dialog.screenshot({ path: testInfo.outputPath('guest-qr-modal.png') });
});

test('guest choices persist, default to dark and follow current menu prices without private requests', async ({
  page,
}, testInfo) => {
  let data = migrateBottleCatalog(fixtureData());
  let unavailable = false;
  const privateRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/barbar')) privateRequests.push(request.url());
  });
  await page.route('**/api/menu', (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { error: 'unavailable' } })
      : route.fulfill({ json: guestMenu(data, 'test') }),
  );
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('barbar-guest-language', 'ru'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/menu');
  const root = page.locator('.guest-menu');
  await expect(root).toHaveAttribute('data-menu-theme', 'dark');
  const negroni = page.locator('.menu-card').filter({ hasText: 'Negroni' });
  await negroni.getByRole('button').click();
  const favorites = page.locator('.menu-favorites');
  await expect(favorites).toContainText('Negroni');
  await expect(favorites).toContainText('2 900');
  await page.getByRole('button', { name: 'Светлая тема', exact: true }).click();
  await expect(root).toHaveAttribute('data-menu-theme', 'light');
  await page.reload();
  await expect(root).toHaveAttribute('data-menu-theme', 'light');
  await expect(favorites).toContainText('Negroni');
  data = applyCommand(data, {
    id: 'reprice-favorite',
    type: 'cocktail',
    value: { ...data.cocktails.find((c) => c.name === 'Negroni')!, price: 3200 },
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(favorites).toContainText('3 200');
  unavailable = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('alert')).toContainText('Цены могут быть неактуальны');
  await expect(negroni).toContainText('3 200');
  unavailable = false;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('desktop-dark.png') });
  await favorites.getByRole('button', { name: 'Очистить список', exact: true }).click();
  await expect(favorites.locator('li')).toHaveCount(0);
  expect(privateRequests).toEqual([]);
});

test('responsive guest menu categories, wine prices, favorites and themes work at narrow widths', async ({
  page,
}, testInfo) => {
  const data = migrateBottleCatalog(fixtureData());
  await page.route('**/api/menu', (route) => route.fulfill({ json: guestMenu(data, 'test') }));
  await page.addInitScript(() => localStorage.setItem('barbar-guest-language', 'ru'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/menu');
  await expect(page.locator('.menu-section-head').first()).toContainText('Коктейли');
  await page.screenshot({ path: testInfo.outputPath('mobile-dark.png') });
  await page.getByRole('button', { name: 'Все разделы', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
  await dialog.getByRole('link', { name: /Вино/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).not.toBe('hidden');
  const wine = page.locator('.menu-card').filter({ hasText: 'Volcani red dry Haghtanak' });
  await expect(wine).toBeInViewport();
  await expect(wine).toContainText('Бокал');
  await expect(wine).toContainText('Бутылка');
  await wine.getByRole('button').click();
  await page.screenshot({ path: testInfo.outputPath('mobile-wine.png') });
  await page
    .locator('.menu-bottom-nav')
    .getByRole('button', { name: /Избранное/ })
    .click();
  await expect(page.locator('.menu-mobile-favorites')).toContainText('Volcani red dry Haghtanak');
  await page.reload();
  await page
    .locator('.menu-bottom-nav')
    .getByRole('button', { name: /Избранное/ })
    .click();
  await expect(page.locator('.menu-mobile-favorites')).toContainText('Volcani red dry Haghtanak');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.menu-browse')).toBeVisible();
  await expect(page.locator('.menu-favorites')).toContainText('Volcani red dry Haghtanak');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.menu-bottom-nav').getByRole('button', { name: 'Меню', exact: true }).click();
  await page.getByRole('button', { name: 'HY', exact: true }).click();
  await expect(page.locator('.menu-section-head').first()).toContainText('Կոկտեյլներ');
  for (const width of [320, 390, 760, 1024, 1232, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1280) {
      await expect(page.locator('.menu-sidebar')).toBeHidden();
      await expect(page.locator('.menu-bottom-nav')).toBeVisible();
      await expect(page.locator('.menu-all-sections')).toBeVisible();
    } else {
      await expect(page.locator('.menu-sidebar')).toBeVisible();
      await expect(page.locator('.menu-bottom-nav')).toBeHidden();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Բոլոր բաժինները', exact: true }).click();
  await expect(dialog).toContainText('Զովացուցիչ ըմպելիքներ');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await page.getByRole('button', { name: 'Светлая тема', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('mobile-light.png') });
  await page.getByRole('button', { name: 'Список', exact: true }).click();
  await expect(page.locator('.menu-grid').first()).toHaveClass(/menu-list/);
});
