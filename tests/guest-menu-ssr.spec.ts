import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { startGuestMenuStand, type GuestMenuStand } from '../scripts/guest-menu-stand.mjs';

// Runs on the built page (`npm run build` or `vite build`) with an in-memory catalog: no database, no dev server.
test.skip(!existsSync('dist/guest-menu.html'), 'Build the site first: dist/guest-menu.html is missing');
let stand: GuestMenuStand;
let photos: string;
test.beforeAll(async () => {
  photos = mkdtempSync(join(tmpdir(), 'barbar-photos-'));
  stand = await startGuestMenuStand({ photos });
});
test.afterAll(async () => {
  await stand?.close();
  rmSync(photos, { recursive: true, force: true });
});
const priced = () => stand.data.cocktails.find((c) => c.price > 0 && !c.guestHidden && !c.stockAlcoholId)!;
const amount = (value: number) => new Intl.NumberFormat('en-US').format(value);

test('the phone menu has positions and prices in the HTML, before any script runs', async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
  });
  const page = await context.newPage();
  const item = priced();
  await page.goto(`${stand.origin}/menu?table=SECRET-TABLE-CODE`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Cocktails' })).toBeVisible();
  expect(await page.locator('.menu-card').count()).toBeGreaterThan(50);
  await expect(page.locator('.menu-card').filter({ hasText: item.name }).first()).toContainText(
    amount(item.price),
  );
  const html = await page.content();
  expect(html).not.toContain('SECRET-TABLE-CODE');
  expect(html).not.toMatch(/costPerLiter|"ingredients"|"stockAlcoholId"|purchases/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('the browser hydrates the rendered menu and then shows the current price', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const item = priced();
  const changed = structuredClone({ alcohol: stand.data.alcohol, cocktails: stand.data.cocktails });
  changed.cocktails.find((c) => c.id === item.id)!.price = item.price + 700;
  stand.use('api', changed);
  // Hold the fresh menu until the rendered prices are checked.
  let release!: () => void;
  const held = new Promise<void>((done) => (release = done));
  await page.route('**/api/menu', async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto(`${stand.origin}/menu`);
    const card = page.locator('.menu-card').filter({ hasText: item.name }).first();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(card).toContainText(new Intl.NumberFormat('ru-RU').format(item.price));
    // Interactive after hydration: search filters the rendered cards.
    await page.getByRole('searchbox').fill(item.name);
    await expect(page.locator('.menu-card').filter({ hasText: item.name }).first()).toBeVisible();
    release();
    await expect(card).toContainText(new Intl.NumberFormat('ru-RU').format(item.price + 700));
    expect(errors).toEqual([]);
  } finally {
    release();
    stand.use('api', undefined);
    await context.close();
  }
});

test('an owner photo is shown whole on the phone menu instead of the example', async ({
  browser,
}, testInfo) => {
  const item = priced();
  const name = 'u-0123456789ab-320x400';
  const source = await sharp({
    create: { width: 320, height: 400, channels: 3, background: { r: 120, g: 30, b: 50 } },
  })
    .png()
    .toBuffer();
  for (const width of [160, 320])
    await sharp(source)
      .resize({ width })
      .webp()
      .toFile(join(photos, `${name}-${width}.webp`));
  stand.data.cocktails.find((c) => c.id === item.id)!.photo = name;
  stand.changed();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await context.newPage();
  try {
    await page.goto(`${stand.origin}/menu`);
    const card = page.locator('.menu-card').filter({ hasText: item.name }).first();
    const image = card.locator('.menu-card-photo img');
    await card.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('srcset', new RegExp(`/api/photos/${name}-160\\.webp 160w`));
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    expect(await image.evaluate((img) => getComputedStyle(img).objectFit)).toBe('contain');
    await expect(card.locator('.photo-example')).toHaveCount(0);
    const box = (await image.boundingBox())!;
    const frame = (await card.locator('.menu-card-photo').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(frame.width + 1);
    expect(box.height).toBeLessThanOrEqual(frame.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.screenshot({ path: testInfo.outputPath('guest-own-photo-mobile.png') });
  } finally {
    delete stand.data.cocktails.find((c) => c.id === item.id)!.photo;
    stand.changed();
    await context.close();
  }
});
