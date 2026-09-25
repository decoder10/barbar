import { expect, test, type Locator } from '@playwright/test';
import { fixtureData, mockOrders } from './fixtures';
import { applyCommand } from '../src/barbar/domain/model';
import { businessToday } from '../src/barbar/domain/business-day';

const shifts = [
  {
    id: 's1',
    businessDay: '2026-09-23',
    closedAt: '',
    count: 2,
    revenue: 5000,
    payments: { cash: 5000 },
    countedCash: 150000,
    difference: 145000,
  },
  {
    id: 's2',
    businessDay: '2026-09-22',
    closedAt: '',
    count: 12,
    revenue: 48500,
    payments: { cash: 30000, card: 18500 },
    countedCash: 29000,
    difference: -1000,
  },
  {
    id: 's3',
    businessDay: '2026-09-21',
    closedAt: '',
    count: 7,
    revenue: 21000,
    payments: { cash: 21000 },
    countedCash: 21000,
    difference: 0,
  },
];

/** Elements with their own text that render below 14 px. */
const smallText = (block: Locator) =>
  block.evaluate((root) =>
    [...root.querySelectorAll('*')]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
      .map((e) => [`${e.tagName}.${e.className}`, parseFloat(getComputedStyle(e).fontSize)] as const)
      .filter(([, size]) => size < 14),
  );

for (const language of ['ru', 'hy'] as const)
  for (const theme of ['light', 'dark'] as const)
    for (const width of [1440, 390])
      test(`shift report and period comparison are readable: ${language}/${theme}/${width}`, async ({
        page,
      }) => {
        const day = (offset: number) =>
          new Date(Date.parse(`${businessToday()}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
        const monthStart = `${businessToday().slice(0, 7)}-01`;
        let data = fixtureData();
        data.purchases = data.purchases.map((p) => ({ ...p, date: day(-90) }));
        const [gin, other] = data.cocktails;
        other.price = Math.round(gin.price / 2);
        const sell = (id: string, productId: string, date: string, quantity: number) => {
          data = applyCommand(data, {
            id,
            type: 'sale',
            value: { kind: 'cocktail', productId, quantity, date },
          });
        };
        const before = new Date(Date.parse(`${monthStart}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
        // Gin grows (4 against 2), the cheaper cocktail is sold only in the base: both tones show.
        sell('now-1', gin.id, businessToday(), 4);
        sell('base-1', gin.id, before, 2);
        sell('base-2', other.id, before, 1);
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript((value) => localStorage.setItem('barbar-theme', value), theme);
        await page.route('**/api/barbar/auth', (r) =>
          r.fulfill({
            json: {
              authenticated: true,
              role: 'admin',
              user: {
                id: 'o',
                fullName: 'Owner',
                role: 'owner',
                preferences: { language, theme, currency: 'AMD' },
              },
            },
          }),
        );
        await page.route('**/api/barbar', (r) => r.fulfill({ json: { data, role: 'admin', revision: 'r' } }));
        await mockOrders(page, () => data);
        await page.route('**/api/barbar/shifts?**', (r) =>
          r.fulfill({
            json: {
              totals: { count: 21, revenue: 74500, average: 3548, payments: { cash: 56000, card: 18500 } },
              shifts,
            },
          }),
        );
        await page.goto('/reports');

        const shiftBlock = page.locator('.shift-report');
        await expect(shiftBlock.locator('.shift-report-totals > div')).toHaveCount(3);
        await expect(shiftBlock.locator('tbody tr')).toHaveCount(3);
        const differences = shiftBlock.locator('.shift-difference');
        await expect(differences.nth(0)).toHaveClass(/is-surplus/);
        await expect(differences.nth(0).locator('strong')).toHaveText(/^\+/);
        await expect(differences.nth(1)).toHaveClass(/is-shortage/);
        await expect(differences.nth(1).locator('strong')).toHaveText(/^-|^−/);
        await expect(differences.nth(2)).toHaveClass(/is-even/);
        for (let i = 0; i < 3; i++) await expect(differences.nth(i).locator('small')).not.toBeEmpty();

        const comparison = page.locator('.comparison-panel');
        await expect(comparison.locator('.comparison-periods > div')).toHaveCount(2);
        const cards = comparison.locator('.comparison-cards li');
        await expect(cards).toHaveCount(3);
        await expect(cards.first().locator('.comparison-change')).toHaveClass(/is-up/);
        await expect(cards.first().locator('.comparison-change')).toContainText('+');
        await expect(comparison.locator('.comparison-metrics li')).toHaveCount(3);
        await expect(comparison.locator('table')).toHaveCount(0);
        const parts = comparison.locator('.comparison-parts > li');
        await expect(parts).toHaveCount(4);
        await expect(parts.nth(0).locator('.comparison-change')).toHaveClass(/is-up/);
        await expect(parts.nth(3).locator('.comparison-change')).toHaveClass(/is-down/);
        await expect(parts.locator('.comparison-bar')).toHaveCount(4);
        await expect(comparison.locator('.comparison-sum .comparison-change')).toHaveClass(/is-up/);
        // No bare zero: an unchanged value reads «без изменений» / «առանց փոփոխության».
        await expect(comparison.locator('.comparison-change', { hasText: /(^|\s)[+\-−]?0\s*֏/ })).toHaveCount(
          0,
        );
        await expect(comparison.locator('.comparison-dimension')).toHaveCount(3);
        // Every section card fits its column: names wrap instead of pushing the amounts off screen.
        for (const section of await comparison.locator('.comparison-section').all())
          expect(await section.evaluate((s) => s.scrollWidth <= s.clientWidth)).toBe(true);

        for (const block of [shiftBlock, comparison]) {
          await block.scrollIntoViewIfNeeded();
          expect(await smallText(block)).toEqual([]);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      });

for (const width of [1440, 390])
  test(`period comparison without sales shows one empty state: ${width}`, async ({ page }) => {
    const data = { ...fixtureData(), sales: [] };
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/api/barbar/auth', (r) =>
      r.fulfill({
        json: { authenticated: true, role: 'admin', user: { id: 'o', fullName: 'Owner', role: 'owner' } },
      }),
    );
    await page.route('**/api/barbar', (r) => r.fulfill({ json: { data, role: 'admin', revision: 'r' } }));
    await mockOrders(page, () => data);
    await page.route('**/api/barbar/shifts?**', (r) =>
      r.fulfill({ json: { totals: { count: 0, revenue: 0, average: 0, payments: {} }, shifts: [] } }),
    );
    await page.goto('/reports');

    const comparison = page.locator('.comparison-panel');
    const empty = comparison.locator('.comparison-empty');
    await expect(empty).toContainText('В обоих периодах нет продаж');
    await expect(empty).toContainText('Выберите другой месяц');
    // The period plates stay, but no zero cards, bare column headers or «— 0 ֏» rows.
    await expect(comparison.locator('.comparison-periods > div')).toHaveCount(2);
    await expect(
      comparison.locator('.comparison-cards, .comparison-metrics, .comparison-section'),
    ).toHaveCount(0);
    await expect(comparison.locator('table')).toHaveCount(0);
    await expect(comparison).not.toContainText('Продаж в этих периодах нет.');
    expect(await smallText(comparison)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
