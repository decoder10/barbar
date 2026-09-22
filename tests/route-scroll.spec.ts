import { expect, test } from '@playwright/test';
import { fixtureData } from './fixtures';

for (const width of [390, 1440]) {
  test(`section navigation resets scroll at ${width}px, including browser history`, async ({ page }) => {
    const data = fixtureData();
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/barbar/auth', (r) =>
      r.fulfill({ json: { authenticated: true, role: 'admin' } }),
    );
    await page.route('**/api/barbar', (r) =>
      r.fulfill({ json: { data, role: 'admin', revision: 'scroll-navigation' } }),
    );
    await page.goto('/sales');
    await expect(page.locator('.drink-card').first()).toBeVisible();
    const scrollDown = async () => {
      await page.evaluate(() => window.scrollTo(0, 900));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    };
    const navigate = async (path: string) => {
      if (width === 390) await page.getByRole('button', { name: 'Открыть меню' }).click();
      await page.locator(`.sidebar nav a[href="${path}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path + '$'}`));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    };
    await scrollDown();
    await navigate('/inventory');
    await expect(
      page.locator('.inventory-categories:visible, .category-select:visible').first(),
    ).toBeVisible();
    await scrollDown();
    await navigate('/sales');
    await scrollDown();
    await page.goBack();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await scrollDown();
    await page.goForward();
    await expect(page).toHaveURL(/\/sales$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    // Normal updates on the same page must not jump to the top.
    await scrollDown();
    await page
      .getByRole('button', { name: 'Обновить данные', exact: true })
      .evaluate((el: HTMLButtonElement) => el.click());
    await expect(page.getByRole('button', { name: 'Обновить данные', exact: true })).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  });
}
