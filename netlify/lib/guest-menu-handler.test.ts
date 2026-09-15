import { describe, expect, it } from 'vitest';
import { initialData } from '../../src/barbar/domain/model';
import { handleGuestMenu } from './guest-menu-handler';
import type { Repository } from './barbar-repository';

const repository = {
  readCatalog: async () => ({ catalogRevision: 'rev-9', data: initialData() }),
} as unknown as Repository;
describe('public guest menu route', () => {
  it('serves without a session, with a revision ETag and conditional 304', async () => {
    const response = await handleGuestMenu(new Request('https://barbar.test/api/menu'), repository);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('public');
    const etag = response.headers.get('etag')!;
    expect(etag).toContain('rev-9');
    const body = await response.json();
    expect(body.sections.length).toBeGreaterThan(3);
    const again = await handleGuestMenu(
      new Request('https://barbar.test/api/menu', { headers: { 'if-none-match': etag } }),
      repository,
    );
    expect(again.status).toBe(304);
  });
  it('rejects writes', async () => {
    const response = await handleGuestMenu(
      new Request('https://barbar.test/api/menu', { method: 'POST', body: '{}' }),
      repository,
    );
    expect(response.status).toBe(405);
  });
});
