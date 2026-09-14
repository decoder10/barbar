import { existsSync } from 'node:fs';
import { expect, test } from 'vitest';
import sources from '../../../../../../public/barbar/photos/sources.json';
import { bottlePhoto, menuPhoto, photos } from '../photo-catalog';

test('beer flavours cannot resolve to fruit ingredients and unknown brands get named bottle templates', () => {
  expect(bottlePhoto('379 — Вишня', 'beer')).toMatchObject({ key: '', template: 'beer' });
  expect(bottlePhoto('379 — Citrus', 'beer')).toMatchObject({ key: '', template: 'beer' });
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
  expect(Object.values(sources).every((p) => p.source.startsWith('https://'))).toBe(true);
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
