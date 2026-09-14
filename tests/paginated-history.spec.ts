import { test, expect } from '@playwright/test';
import { fixtureData } from './fixtures';
import { compactData } from '../netlify/lib/barbar-working';
import { staffData } from '../netlify/lib/barbar-access';
import { applyCommand } from '../src/barbar/domain/model';
import { businessToday } from '../src/barbar/domain/business-day';
import { aggregatedPerformance, aggregatedAnalytics } from '../src/barbar/domain/reports/aggregated';
import type { SalesGroup } from '../src/barbar/domain/reports/server-types';
for (const worker of [false, true])
  test(`${worker ? 'worker' : 'owner'} sees full-day totals while history is paginated`, async ({ page }) => {
    let full = fixtureData();
    for (let i = 0; i < 55; i++)
      full = applyCommand(full, {
        id: `page-${i}`,
        type: 'sale',
        value: { kind: 'alcohol', productId: 'vodka', quantity: 10, date: businessToday() },
      });
    const data = compactData(full),
      role = worker ? 'barbar' : 'admin';
    const groups: SalesGroup[] = [
      {
        productId: 'vodka',
        kind: 'alcohol',
        name: 'Vodka',
        quantity: 550,
        operations: 55,
        ...(!worker ? { revenue: 6930, cost: 2310, knownCost: true } : {}),
      },
    ];
    await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role } }));
    await page.route('**/api/barbar', (r) =>
      r.fulfill({
        json: { role, revision: 'paged', ...(worker ? { staffData: staffData(data) } : { data }) },
      }),
    );
    await page.route('**/api/barbar/history?*', (r) => {
      const second = new URL(r.request().url()).searchParams.has('cursor');
      const rows = [...full.sales].reverse().slice(second ? 50 : 0, second ? 55 : 50);
      return r.fulfill({
        json: {
          rows: worker ? staffData({ ...full, sales: rows }).sales : rows,
          groups,
          total: 55,
          nextCursor: second ? null : 'next-page',
        },
      });
    });
    await page.goto('/');
    const receipt = page.locator('.day-receipt');
    await expect(receipt).toContainText('55');
    await expect(receipt).toContainText('550');
    await receipt.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(receipt.getByRole('button', { name: 'Далее', exact: true })).toBeDisabled();
    await expect(receipt).toContainText('55');
    await expect(receipt).toContainText('550');
    if (worker) {
      await expect(receipt).not.toContainText(/֏|Себестоимость|Выручка/);
      await page.goto('/operations');
      await expect(page).toHaveURL(/\/$/);
      await page.goto('/audit');
      await expect(page).toHaveURL(/\/$/);
    } else {
      const performance = aggregatedPerformance(data, groups);
      await page.route('**/api/barbar/report?*', (r) =>
        r.fulfill({
          json: {
            performance,
            analytics: aggregatedAnalytics(performance, 0),
            groups,
            daily: [{ date: businessToday(), revenue: 6930 }],
            purchaseTotal: 0,
            purchaseCount: 0,
            consumed: { vodka: 550 },
            expenses: 500,
            losses: 0,
            cancellations: 0,
            forecast: [],
          },
        }),
      );
      await page.goto('/reports');
      await expect(page.getByRole('heading', { name: 'Операционный результат' })).toBeVisible();
      await expect(page.locator('.metrics')).toContainText('6 930');
      await expect(page.getByRole('heading', { name: 'Прогноз закупок' })).toBeVisible();
    }
  });
