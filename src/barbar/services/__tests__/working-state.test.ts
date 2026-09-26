import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureData } from '../../../../tests/fixtures';
import { compactData } from '../../../../netlify/lib/barbar-working';
import { publicCatalog } from '../../../../netlify/lib/barbar-sync';
import { staffData } from '../../../../netlify/lib/barbar-access';
import { api } from '../api-client';
import { loadWorking } from '../working-state';
import { initialData } from '../../domain/model';
import type { CatalogResponse, StockResponse, CatalogPartResponse } from '../../domain/sync/contracts';
import type { BarData } from '../../domain/types';
vi.mock('../api-client', () => ({ api: vi.fn() }));
const mock = vi.mocked(api);
const data = compactData(fixtureData());
const catalog: CatalogResponse = {
  role: 'admin',
  catalogRevision: 'catalog-1',
  data: { alcohol: data.alcohol, cocktails: data.cocktails },
};
const stock: StockResponse = {
  role: 'admin',
  revision: 'stock-1',
  catalogRevision: 'catalog-1',
  stock: data.opening!.ingredients,
};
const supply = (value: StockResponse) => value as Awaited<ReturnType<typeof api<'/api/barbar'>>>;
const parts = (value: CatalogResponse): CatalogPartResponse[] =>
  (['alcohol', 'cocktails'] as const).map((resource) => ({
    role: value.role,
    catalogRevision: value.catalogRevision,
    resource,
    ...(value.data
      ? { [resource]: value.data[resource] }
      : resource === 'alcohol'
        ? {
            ingredients: value.staffData!.ingredients,
            products: value.staffData!.products.filter((p) => p.kind === 'alcohol'),
          }
        : {
            recipes: value.staffData!.recipes,
            products: value.staffData!.products.filter((p) => p.kind === 'cocktail'),
          }),
  }));
const queueCatalog = (value: CatalogResponse) => {
  const [alcohol, cocktails] = parts(value);
  return mock.mockResolvedValueOnce(alcohol).mockResolvedValueOnce(cocktails);
};
beforeEach(() => {
  mock.mockReset();
});
describe('working-state synchronization', () => {
  it('loads catalog once, reuses its arrays after sales and performs no reads for a valid delta', async () => {
    queueCatalog(catalog);
    const first = await loadWorking(null, supply(stock));
    expect(mock).toHaveBeenCalledTimes(2);
    const next = await loadWorking(
      first,
      supply({
        ...stock,
        revision: 'stock-2',
        partial: true,
        baseRevision: first.revision,
        stock: [{ alcoholId: 'gin', ml: 1950, cost: 17940 }],
      }),
    );
    expect(mock).toHaveBeenCalledTimes(2);
    expect(next.data.alcohol).toBe(first.data.alcohol);
    expect(next.data.cocktails).toBe(first.data.cocktails);
    expect(next.stock!.find((b) => b.alcoholId === 'gin')!.ml).toBe(1950);
    expect(next.stock!.find((b) => b.alcoholId === 'tonic')).toEqual(
      first.stock!.find((b) => b.alcoholId === 'tonic'),
    );
    expect(
      await loadWorking(
        next,
        supply({ ...stock, revision: next.revision, unchanged: true, stock: undefined }),
      ),
    ).toBe(next);
  });
  it('recovers a crossed catalog edit without mixing versions', async () => {
    queueCatalog({ ...catalog, catalogRevision: 'catalog-2' }).mockResolvedValueOnce(
      supply({ ...stock, revision: 'stock-2', catalogRevision: 'catalog-2' }),
    );
    const result = await loadWorking(null, supply(stock));
    expect(result.catalog!.catalogRevision).toBe('catalog-2');
    expect(result.revision).toBe('stock-2');
    expect(mock.mock.calls.map(([path]) => path)).toEqual([
      '/api/barbar/catalog/alcohol',
      '/api/barbar/catalog/cocktails',
      '/api/barbar',
    ]);
  });
  it('rejects stale delta baseline and fetches complete stock without reloading the catalog', async () => {
    queueCatalog(catalog);
    const first = await loadWorking(null, supply(stock));
    mock.mockResolvedValueOnce(supply({ ...stock, revision: 'stock-current' }));
    const result = await loadWorking(
      first,
      supply({ ...stock, revision: 'stock-3', partial: true, baseRevision: 'another-device', stock: [] }),
    );
    expect(result.revision).toBe('stock-current');
    expect(result.stock).toHaveLength(data.alcohol.length);
    expect(mock.mock.calls.filter(([path]) => path.startsWith('/api/barbar/catalog/'))).toHaveLength(2);
  });
  it('reprojects worker availability identically, including selected glass volumes, with no private costs', async () => {
    const wineData: BarData = {
      ...data,
      alcohol: [
        ...data.alcohol,
        {
          id: 'test-wine',
          name: 'Wine',
          color: '#993344',
          category: 'wine',
          unit: 'bottle',
          bottleSizeMl: 750,
          glassSizeMl: 150,
          costPerLiter: 1000,
          pricePerLiter: 2000,
        },
      ],
      cocktails: [
        ...data.cocktails,
        {
          id: 'test-glass',
          name: 'Wine glass',
          price: 1000,
          image: 1,
          stockAlcoholId: 'test-wine',
          serving: 'glass',
          category: 'wine',
          ingredients: [{ alcoholId: 'test-wine', ml: 0.2 }],
        },
      ],
      opening: {
        mode: 'read-model',
        ingredients: [...data.opening!.ingredients, { alcoholId: 'test-wine', ml: 1.5, cost: 1000 }],
      },
    };
    const workerCatalog = publicCatalog({ catalogRevision: 'catalog-1', data: wineData }, 'barbar');
    queueCatalog(workerCatalog);
    const result = await loadWorking(
      null,
      supply({
        ...stock,
        role: 'barbar',
        stock: wineData.opening!.ingredients.map(({ alcoholId, ml }) => ({ alcoholId, ml })),
      }),
    );
    const expected = staffData(wineData);
    expect(result.staffData!.products).toEqual(expected.products);
    expect(result.staffData!.ingredients).toEqual(expected.ingredients);
    expect(result.staffData!.products.find((p) => p.id === 'test-glass')!.availableMl).toBe(1125);
    expect(JSON.stringify(result.staffData)).not.toMatch(/"(?:cost|operations)"/);
  });
  it('does not reuse owner catalog after a role change', async () => {
    queueCatalog(catalog);
    const owner = await loadWorking(null, supply(stock));
    queueCatalog(publicCatalog({ catalogRevision: 'catalog-1', data }, 'barbar'));
    const worker = await loadWorking(
      owner,
      supply({
        ...stock,
        role: 'barbar',
        stock: stock.stock!.map(({ alcoholId, ml }) => ({ alcoholId, ml })),
      }),
    );
    expect(worker.catalog!.data).toBeUndefined();
    expect(worker.staffData).not.toBeNull();
    expect(mock).toHaveBeenCalledTimes(4);
  });
  it('starts the first stock and catalog reads together, without waiting for stock', async () => {
    let release!: (value: ReturnType<typeof supply>) => void;
    mock.mockImplementation((path) =>
      path === '/api/barbar'
        ? new Promise((resolve) => {
            release = resolve as typeof release;
          })
        : (Promise.resolve(parts(catalog)[path.endsWith('/alcohol') ? 0 : 1]) as ReturnType<typeof api>),
    );
    const pending = loadWorking(null);
    expect(mock.mock.calls.map(([path]) => path)).toEqual([
      '/api/barbar',
      '/api/barbar/catalog/alcohol',
      '/api/barbar/catalog/cocktails',
    ]);
    release(supply(stock));
    expect((await pending).revision).toBe('stock-1');
  });
  it('gives worker screens the same bundled catalog as before, loaded on demand', async () => {
    queueCatalog(publicCatalog({ catalogRevision: 'catalog-1', data }, 'barbar'));
    const worker = await loadWorking(
      null,
      supply({
        ...stock,
        role: 'barbar',
        stock: stock.stock!.map(({ alcoholId, ml }) => ({ alcoholId, ml })),
      }),
    );
    expect(worker.data).toEqual(initialData());
    expect(worker.data.cocktails.length).toBeGreaterThan(0);
    mock
      .mockResolvedValueOnce({ role: 'barbar', revision: 'legacy', data, staffData: staffData(data) })
      .mockRejectedValueOnce(new Error('Endpoint not available'));
    expect((await loadWorking(null)).data).toEqual(initialData());
  });
  it('keeps legacy full-snapshot servers usable when the speculative catalog endpoint is absent', async () => {
    mock
      .mockResolvedValueOnce({ role: 'admin', revision: 'legacy', data })
      .mockRejectedValueOnce(new Error('Endpoint not available'));
    expect((await loadWorking(null)).data).toBe(data);
  });
});
