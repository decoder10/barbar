import { createServer } from 'vite';
import { performance } from 'node:perf_hooks';
const server = await createServer({
  configFile: false,
  cacheDir: '/tmp/barbar-benchmark-vite',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: 'custom',
});
try {
  const { initialData, averageCost, stock } = await server.ssrLoadModule('/src/barbar/domain/model.ts');
  const { inventoryCalculations } = await server.ssrLoadModule(
    '/src/barbar/domain/inventory-calculations.ts',
  );
  const data = initialData();
  data.sales = [];
  data.purchases = data.alcohol.map((a) => ({
    id: a.id,
    alcoholId: a.id,
    ml: 1000000,
    costPerLiter: 1000,
    date: '2026-01-01',
  }));
  for (let i = 0; i < 10000; i++) {
    const a = data.alcohol[i % data.alcohol.length];
    data.sales.push({
      id: String(i),
      date: '2026-09-14',
      kind: 'cocktail',
      productId: 'benchmark',
      name: 'Benchmark',
      quantity: 1,
      revenue: 100,
      cost: 1,
      ingredients: [{ alcoholId: a.id, ml: 1, cost: 1 }],
    });
  }
  const measure = (fn) => {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      fn();
      samples.push(performance.now() - start);
    }
    return samples.sort((a, b) => a - b)[2];
  };
  const legacy = measure(() => data.alcohol.map((a) => [stock(data, a.id), averageCost(data, a.id)]));
  const indexed = measure(() => {
    const inventory = inventoryCalculations(data);
    return data.alcohol.map((a) => [inventory.stock(a.id), inventory.averageCost(a.id)]);
  });
  console.log(
    JSON.stringify(
      {
        products: data.alcohol.length,
        sales: data.sales.length,
        medianOf: 5,
        legacyMs: Math.round(legacy * 100) / 100,
        indexedMs: Math.round(indexed * 100) / 100,
        speedup: Math.round((legacy / indexed) * 10) / 10,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
