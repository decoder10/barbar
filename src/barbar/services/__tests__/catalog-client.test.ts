import { beforeEach, expect, it, vi } from 'vitest';
import { api } from '../api-client';
import { assembleCatalog, readCatalog } from '../catalog-client';
import { publicCatalog, publicCatalogPart } from '../../../../netlify/lib/barbar-sync';
import { fixtureData } from '../../../../tests/fixtures';
import type { CatalogPartResponse } from '../../domain/sync/contracts';
vi.mock('../api-client', () => ({ api: vi.fn() }));
const mock = vi.mocked(api);
const fixture = fixtureData();
const snapshot = { catalogRevision: 'v1', data: { alcohol: fixture.alcohol, cocktails: fixture.cocktails } };
beforeEach(() => {
  mock.mockReset();
});
it('requests both independent resources immediately and assembles the owner catalog', async () => {
  let finish!: (value: CatalogPartResponse) => void;
  mock.mockImplementation((path) =>
    path.endsWith('/alcohol')
      ? new Promise((resolve) => {
          finish = resolve as typeof finish;
        })
      : (Promise.resolve(publicCatalogPart(snapshot, 'admin', 'cocktails')) as ReturnType<typeof api>),
  );
  const pending = readCatalog();
  expect(mock.mock.calls.map(([path]) => path)).toEqual([
    '/api/barbar/catalog/alcohol',
    '/api/barbar/catalog/cocktails',
  ]);
  finish(publicCatalogPart(snapshot, 'admin', 'alcohol'));
  expect(await pending).toEqual(publicCatalog(snapshot, 'admin'));
});
it('does not combine resources from different catalog versions', async () => {
  mock
    .mockResolvedValueOnce(publicCatalogPart(snapshot, 'admin', 'alcohol'))
    .mockResolvedValueOnce(publicCatalogPart({ ...snapshot, catalogRevision: 'v2' }, 'admin', 'cocktails'))
    .mockResolvedValueOnce(publicCatalogPart({ ...snapshot, catalogRevision: 'v2' }, 'admin', 'alcohol'))
    .mockResolvedValueOnce(publicCatalogPart({ ...snapshot, catalogRevision: 'v2' }, 'admin', 'cocktails'));
  expect((await readCatalog()).catalogRevision).toBe('v2');
  expect(mock).toHaveBeenCalledTimes(4);
});
it('reconstructs safe worker glass metadata without fetching the alcohol collection from cocktails', () => {
  const wine = {
    id: 'wine-test',
    name: 'Wine',
    category: 'wine' as const,
    unit: 'bottle' as const,
    bottleSizeMl: 750,
    glassSizeMl: 150,
    color: '#fff',
    costPerLiter: 2000,
    pricePerLiter: 4000,
  };
  const glass = {
    id: 'glass-test',
    name: 'Wine glass',
    category: 'wine' as const,
    stockAlcoholId: wine.id,
    serving: 'glass' as const,
    image: 1,
    price: 1000,
    ingredients: [{ alcoholId: wine.id, ml: 0.2 }],
  };
  const value = { ...snapshot, data: { alcohol: [wine], cocktails: [glass] } };
  const alcohol = publicCatalogPart(value, 'barbar', 'alcohol');
  const cocktails = publicCatalogPart(value, 'barbar', 'cocktails');
  expect(alcohol).not.toHaveProperty('recipes');
  expect(cocktails).not.toHaveProperty('ingredients');
  expect(JSON.stringify([alcohol, cocktails])).not.toMatch(
    /"(?:price|cost|costPerLiter|pricePerLiter|extraCosts)"/,
  );
  expect(assembleCatalog(alcohol, cocktails)).toEqual(publicCatalog(value, 'barbar'));
  expect(() => assembleCatalog({ ...alcohol, role: 'admin' }, cocktails)).toThrow();
});
