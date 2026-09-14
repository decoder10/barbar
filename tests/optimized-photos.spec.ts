import { expect, test } from '@playwright/test';
import { fixtureData } from './fixtures';

test('catalog serves AVIF, renders WebP fallback and retains contained image layout', async ({ page }) => {
  await page.route('**/api/barbar/auth', (r) => r.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/barbar', (r) =>
    r.fulfill({ json: { data: fixtureData(), role: 'admin', revision: 'photo-test' } }),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const photo = page.locator('.drink-card .catalog-picture img').first();
  await photo.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      photo.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.currentSrc.includes('.avif'),
      ),
    )
    .toBe(true);
  expect(await photo.evaluate((img) => getComputedStyle(img).objectFit)).toBe('contain');
  const before = await photo.boundingBox();
  await photo.hover();
  const after = await photo.boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  // Unsupported AVIF browsers skip this source and use the WebP img srcset.
  await photo.evaluate((img) =>
    img.parentElement!.querySelector('source')!.setAttribute('type', 'image/unsupported'),
  );
  await expect
    .poll(() =>
      photo.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.currentSrc.includes('.webp'),
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  await photo.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/barbar-avif-mobile.png' });
  expect(errors).toEqual([]);
});
