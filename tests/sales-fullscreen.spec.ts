import { expect, test } from '@playwright/test';
import { fixtureData, mockOrders } from './fixtures';
import { applyCommand } from '../src/barbar/domain/model';
import { staffData } from '../netlify/lib/barbar-access';

for (const role of ['admin', 'barbar'] as const) {
  for (const fallback of [false, true]) {
    test(`${role} focused sales, fullscreen fallback=${fallback}`, async ({ page }) => {
      let data = fixtureData();
      if (fallback) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addInitScript(() => {
          Element.prototype.requestFullscreen = () => Promise.reject(new Error('Unavailable'));
        });
      }
      await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role } }));
      await page.route('**/api/barbar', (r) => {
        if (r.request().method() === 'POST') data = applyCommand(data, r.request().postDataJSON().command);
        return r.fulfill({
          json: {
            role,
            revision: `fullscreen-${data.operations.length}`,
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
      // Phones show categories as a dropdown.
      if (fallback) await page.getByLabel('Категория', { exact: true }).selectOption('cocktail');
      else await page.getByRole('button', { name: 'Коктейли', exact: true }).click();
      await page.getByPlaceholder('Найти напиток…').fill('Gin tonic');
      // Search is debounced and applies to the whole catalog: Beefeater and Bombay.
      await expect(page.locator('.drink-card')).toHaveCount(2);
      const count = 2;
      await page.getByRole('button', { name: 'На весь экран', exact: true }).click();
      const exit = page.getByRole('button', { name: 'Выйти из полного экрана', exact: true });
      await expect(exit).toBeEnabled();
      await expect(page.locator('html')).toHaveClass(/sales-fullscreen/);
      await expect(page.locator('.topbar')).toBeHidden();
      await expect(page.locator('.sidebar')).toBeHidden();
      await expect(page.locator('.metrics')).toBeHidden();
      await expect(page.locator('.business-day-hint')).toBeHidden();
      // Phones keep the day receipt in a bottom bar that opens a sheet.
      await expect(page.locator(fallback ? '.day-receipt-bar' : '.day-receipt')).toBeVisible();
      await expect(page.getByPlaceholder('Найти напиток…')).toHaveValue('Gin tonic');
      await expect(page.locator('.drink-card')).toHaveCount(count);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (!fallback) expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      // A tap opens a walk-in order with the drink's dialog; the focused mode follows.
      await page.locator('.drink-card').first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('html')).toHaveClass(/sales-fullscreen/);
      await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
      await expect(exit).toBeVisible();
      await exit.click();
      await expect(page.locator('html')).not.toHaveClass(/sales-fullscreen/);
      await expect(page.locator('.topbar')).toBeVisible();
      if (fallback) await page.locator('.bottom-nav').getByRole('link', { name: 'Продажи' }).click();
      else await page.getByRole('link', { name: 'Продажи Каждый день' }).click();
      await expect(page.getByPlaceholder('Найти напиток…')).toHaveValue('Gin tonic');
      await page.getByRole('button', { name: 'На весь экран', exact: true }).click();
      await expect(exit).toBeEnabled();
      if (fallback) await page.keyboard.press('Escape');
      else await page.evaluate(() => document.exitFullscreen());
      await expect(page.locator('html')).not.toHaveClass(/sales-fullscreen/);
    });
  }
}
