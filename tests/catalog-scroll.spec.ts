import { expect, test } from '@playwright/test';
import { fixtureData } from './fixtures';
import { staffData } from '../netlify/lib/barbar-access';

for (const role of ['admin', 'barbar'] as const) {
  for (const path of ['/', '/cocktails']) {
    test(`${role} ${path}: scrolling reveals catalog batches without extra API reads`, async ({ page }) => {
      const data = fixtureData();
      data.cocktails = Array.from({ length: 61 }, (_, index) => ({
        ...data.cocktails[0],
        id: `scroll-${index}`,
        name: `Scroll drink ${String(index).padStart(2, '0')}`,
        category: 'cocktail' as const,
      }));
      let reads = 0;
      await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role } }));
      await page.route('**/api/barbar', (r) => {
        reads++;
        return r.fulfill({
          json: {
            role,
            revision: 'scroll',
            ...(role === 'admin' ? { data } : { staffData: staffData(data) }),
          },
        });
      });
      if (role === 'barbar') await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await page.getByRole('button', { name: 'Коктейли', exact: true }).click();
      const cards = page.locator('.drink-card');
      await expect(cards).toHaveCount(24);
      const initialReads = reads;
      await page.locator('.load-more').scrollIntoViewIfNeeded();
      await expect(cards).toHaveCount(48);
      await page.locator('.load-more').scrollIntoViewIfNeeded();
      await expect(cards).toHaveCount(61);
      await expect(page.locator('.load-more')).toHaveCount(0);
      expect(reads).toBe(initialReads);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByPlaceholder(/Найти напиток|Название коктейля/).fill('Scroll drink 60');
      await expect(cards).toHaveCount(1);
      await page.getByPlaceholder(/Найти напиток|Название коктейля/).fill('');
      await expect(cards).toHaveCount(24);
    });
  }
}
