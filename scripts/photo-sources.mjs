import { readFileSync } from 'node:fs';

export const publicRoot = new URL('../public/', import.meta.url);
export const photoRoot = new URL('barbar/photos/', publicRoot);
export const sources = JSON.parse(readFileSync(new URL('sources.json', photoRoot), 'utf8'));
export const imageInputs = {
  ...sources,
  'brand-logo': { file: '/barbar/logo.png', author: 'Barbar Cafe' },
  'generated-beer': { file: '/barbar/photos/generated-beer.webp', author: 'Barbar Cafe · AI illustration' },
  'generated-wine': { file: '/barbar/photos/generated-wine.webp', author: 'Barbar Cafe · AI illustration' },
};
export const inputUrl = (file) => new URL(file.replace(/^\//, ''), publicRoot);
