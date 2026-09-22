import { expect, test } from '@playwright/test';
import { staffData } from '../netlify/lib/barbar-access';
import { fixtureData } from './fixtures';

for (const role of ['admin', 'barbar'] as const) {
  test(`${role}: sidebar collapses, survives navigation and refresh, and respects mobile/fullscreen`, async ({
    page,
  }) => {
    const data = fixtureData();
    await page.route('**/api/barbar/auth', (r) =>
      r.fulfill({
        json: { authenticated: true, role, user: { id: role, role: role === 'admin' ? 'owner' : 'worker' } },
      }),
    );
    await page.route('**/api/barbar', (r) =>
      r.fulfill({
        json: {
          role,
          revision: 'sidebar',
          ...(role === 'admin' ? { data } : { staffData: staffData(data) }),
        },
      }),
    );
    await page.goto('/sales');
    const controls = page.locator('.sales-mode-toolbar');
    await expect(controls.getByRole('button', { name: 'На весь экран', exact: true })).toBeVisible();
    const boxes = await controls
      .locator(':scope > *')
      .evaluateAll((elements) =>
        elements.map((e) => e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2),
      );
    expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(2);
    const sidebar = page.locator('.sidebar');
    const workspace = page.locator('.workspace');
    const width = (locator: typeof sidebar) => locator.evaluate((e) => e.getBoundingClientRect().width);
    await expect(page.getByRole('button', { name: 'Свернуть меню', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const expandedWidth = await width(workspace);
    await page.getByRole('button', { name: 'Свернуть меню', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Развернуть меню', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(await width(sidebar)).toBe(76);
    expect(await width(workspace)).toBeGreaterThan(expandedWidth + 100);
    await expect(sidebar.getByRole('link', { name: /Склад/ })).toHaveAttribute('title', 'Склад');
    await sidebar.getByRole('link', { name: /Склад/ }).click();
    await expect(page).toHaveURL(/\/inventory$/);
    expect(await width(sidebar)).toBe(76);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Развернуть меню', exact: true })).toBeVisible();
    expect(await width(sidebar)).toBe(76);
    // Keyboard can expand the rail, and focus is retained on the toggle.
    await page.getByRole('button', { name: 'Развернуть меню', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Свернуть меню', exact: true })).toBeFocused();
    expect(await width(sidebar)).toBeGreaterThan(200);
    await page.keyboard.press('Enter');
    await page.setViewportSize({ width: 1100, height: 800 });
    expect(await width(sidebar)).toBe(76);
    await sidebar.getByRole('link', { name: 'Продажи Каждый день', exact: true }).click();
    await page.getByRole('button', { name: 'На весь экран', exact: true }).click();
    await expect(sidebar).toBeHidden();
    expect(await workspace.evaluate((e) => getComputedStyle(e).marginLeft)).toBe('0px');
    await page.getByRole('button', { name: 'Выйти из полного экрана', exact: true }).click();
    expect(await width(sidebar)).toBe(76);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.sidebar-toggle')).toBeHidden();
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    await expect(sidebar).toHaveClass(/open/);
    expect(await width(sidebar)).toBe(234);
    await expect(sidebar.getByRole('link', { name: /Меню и рецепты/ }).locator('span')).toBeVisible();
    await sidebar.getByRole('link', { name: /Склад/ }).click();
    await expect(sidebar).not.toHaveClass(/open/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    expect(await width(sidebar)).toBe(76);
    await page.screenshot({ path: `/tmp/barbar-sidebar-${role}.png` });
  });
}
