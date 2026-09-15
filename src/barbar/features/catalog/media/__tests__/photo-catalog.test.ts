import { existsSync } from 'node:fs';
import { describe, expect, it, test } from 'vitest';
import sources from '../../../../../../public/barbar/photos/sources.json';
import { bottlePhoto, menuPhoto, photos } from '../photo-catalog';

test('beer flavours never resolve to fruit ingredients and unknown brands get named bottle templates', () => {
  expect(bottlePhoto('Новая марка', 'beer')).toMatchObject({ template: 'beer' });
  expect(bottlePhoto('Vayk Cherry wine', 'wine')).toMatchObject({ template: 'wine' });
  expect(bottlePhoto('Вишня', 'products').key).toBe('cherry');
});
test('wine bottles and glasses differ, and brand variants keep separate photos', () => {
  expect(menuPhoto('Voskeni White dry Voskehat', 60, 'wine', 'bottle').key).toBe('voskeni-voskehat');
  expect(menuPhoto('Voskeni White dry Voskehat', 60, 'wine', 'glass').key).toBe('white-wine-glass');
  expect(menuPhoto('Bacardi dark', 60, 'alcohol').key).toBe('bacardi-dark');
  expect(bottlePhoto('Bacardi white').key).toBe('bacardi-white');
  expect(bottlePhoto('379 — Weizen', 'beer').key).toBe('379-weizen');
});
test('every catalog image is a bundled file with attribution', () => {
  // A public source link, or an explicit note that the owner supplied the photo.
  expect(
    Object.values(sources).every(
      (p) => p.source.startsWith('https://') || p.author.includes('photo supplied by the owner'),
    ),
  ).toBe(true);
  for (const photo of Object.values(photos)) {
    expect(existsSync(`public${photo.file.split('?')[0]}`), photo.file).toBe(true);

    expect(photo.author.length).toBeGreaterThan(0);
  }
});

test('responsive photo variants are bundled and content-addressed', async () => {
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const sharp = (await import('sharp')).default;
  for (const photo of Object.values(photos)) {
    expect(photo.width).toBeGreaterThan(0);
    expect(photo.height).toBeGreaterThan(0);
    for (const [format, srcSet] of [
      ['avif', photo.avif],
      ['webp', photo.webp],
    ]) {
      for (const candidate of srcSet.split(', ').filter(Boolean)) {
        const [url, descriptor] = candidate.split(' ');
        const bytes = readFileSync(`public${url}`);
        const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
        expect(url).toContain(`-${hash}.${format}`);
        const metadata = await sharp(bytes).metadata();
        expect(metadata.width).toBe(Number(descriptor.slice(0, -1)));
        expect(metadata.width).toBeLessThanOrEqual(photo.width);
        expect(metadata.width).toBeLessThanOrEqual(640);
      }
    }
  }
});

describe('snack product photos', () => {
  it('shows the raw product instead of a serving illustration', () => {
    expect(bottlePhoto('Хлеб', 'food')).toEqual({ key: 'food-bread' });
    expect(bottlePhoto('Лаваш', 'food')).toEqual({ key: 'food-lavash' });
    expect(bottlePhoto('Маринованные огурцы', 'food')).toEqual({ key: 'food-pickles' });
    expect(bottlePhoto('Огурцы', 'food')).toEqual({ key: 'food-cucumber' });
    expect(bottlePhoto('Сыр Микаелян', 'food')).toEqual({ key: 'food-mikayelyan' });
    expect(bottlePhoto('Мини-колбаски', 'food')).toEqual({ key: 'food-sausages' });
  });
  it('keeps an illustrative fallback for products without a verified photo', () => {
    expect(bottlePhoto('Трюфельная паста', 'food')).toMatchObject({ example: true });
  });
});

test('piece goods show their menu photo in stock', () => {
  expect(bottlePhoto('Cola', 'goods', 'soft').key).toBe('cola-bottle');
  expect(bottlePhoto('Black tea', 'goods', 'hot').key).toBe('tea-black');
  expect(bottlePhoto('Chips', 'goods', 'snack').key).toBe('food-chips');
  expect(bottlePhoto('Honey', 'goods', 'snack').key).toBe('honey');
  expect(bottlePhoto('Olives green/black', 'goods', 'snack').key).toBe('food-olives');
});

test('Vayk wines use the winery bottle photos', () => {
  expect(bottlePhoto('Vayk · Zakare pomegranate reserve', 'wine').key).toBe(
    'vayk-zakare-pomegranate-reserve',
  );
  expect(bottlePhoto('Vayk · Zakare apricot', 'wine').key).toBe('vayk-zakare-apricot');
  expect(bottlePhoto('Vayk · Kars city white dry', 'wine').key).toBe('vayk-kars-white');
});

test('remaining beers use original bottle photos', () => {
  expect(bottlePhoto('379 — Вишня', 'beer').key).toBe('379-cherry');
  expect(bottlePhoto('379 — Citrus', 'beer').key).toBe('379-citrus');
  expect(bottlePhoto('Blanc', 'beer').key).toBe('blanc');
  expect(bottlePhoto('IPA Volkovskaya', 'beer').key).toBe('volkovskaya-ipa');
  expect(bottlePhoto('Cider', 'beer')).toMatchObject({ key: 'cider-bottle', example: true });
});

test('merged bar drinks keep their own packshots under Russian names', () => {
  expect(bottlePhoto('Кола', 'goods', 'soft').key).toBe('cola-bottle');
  expect(bottlePhoto('Тоник', 'goods', 'soft').key).toBe('tonic');
  expect(bottlePhoto('Содовая', 'goods', 'soft').key).toBe('water-bottle');
});
