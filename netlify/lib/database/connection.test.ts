import { afterEach, expect, it, vi } from 'vitest';
import { mongoConnection } from '../barbar-mongo';
afterEach(() => vi.unstubAllEnvs());
it('reuses production pools but isolates preview databases and local reloads', async () => {
  // Construction only: these clients never connect to a server.
  vi.stubEnv('BARBAR_MONGODB_URI', 'mongodb://127.0.0.1:27017');
  vi.stubEnv('BARBAR_MONGODB_DATABASE', `connection_test_${crypto.randomUUID()}`);
  const production = mongoConnection(false, { context: 'production', id: 'prod' });
  const again = mongoConnection(false, { context: 'production', id: 'prod' });
  const preview = mongoConnection(false, { context: 'deploy-preview', id: 'preview' });
  const local = mongoConnection(true);
  const reloaded = mongoConnection(true);
  expect(again.client).toBe(production.client);
  expect(preview.client).not.toBe(production.client);
  expect(preview.db.databaseName).not.toBe(production.db.databaseName);
  expect(local.client).not.toBe(reloaded.client);
  expect(() => mongoConnection(false)).toThrow('Missing Netlify deploy context');
  await Promise.all([production, preview, local, reloaded].map((c) => c.client.close()));
});
