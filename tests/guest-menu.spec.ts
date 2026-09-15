import { expect, test } from '@playwright/test';
import { migrateBottleCatalog } from '../src/barbar/domain/catalog/bottles';
import { guestMenu } from '../src/barbar/domain/guest-menu';
import { applyCommand } from '../src/barbar/domain/model';
import { fixtureData } from './fixtures';

const shots =
  '/private/tmp/claude-501/-Users-aram-Desktop-projects-barbar/ff9ef08f-92f1-4626-9f9e-7261ddeb9af3/scratchpad';

test('public guest menu opens without a session, switches language and follows price changes', async ({
  page,
}) => {
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
  await expect(page.getByRole('navigation', { name: 'Menu sections' })).toContainText('Wine');
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
  await page.screenshot({ path: `${shots}/guest-menu-mobile.png` });
  await page.getByRole('link', { name: 'Wine' }).click();
  await page.screenshot({ path: `${shots}/guest-menu-wine.png` });

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
  await page.screenshot({ path: `${shots}/guest-menu-desktop.png` });
});

test('owner prints a QR card for the stable guest menu link', async ({ page }) => {
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
  await dialog.screenshot({ path: `${shots}/guest-qr-modal.png` });
});
