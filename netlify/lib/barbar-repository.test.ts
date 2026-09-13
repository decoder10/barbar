import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import auth from '../functions/barbar-auth';
import { sessionCookie } from './barbar-auth';
import { handleBarApi } from './barbar-handler';
import { commitSnapshot, readSnapshot, type Storage, legacyRepository } from './barbar-repository';
import { applyCommand, initialData, stock } from '../../src/barbar/model';
import type { Command } from '../../src/barbar/types';
function memoryStore() {
  const files = new Map<string, { value: unknown; etag: string }>();
  let version = 0;
  const storage: Storage = {
    read: async (key) => (files.has(key) ? structuredClone(files.get(key)!) : null),
    write: async (key, value, condition) => {
      const old = files.get(key);
      if (
        ('onlyIfNew' in condition && old) ||
        ('onlyIfMatch' in condition && old?.etag !== condition.onlyIfMatch)
      ) {
        return { modified: false };
      }
      const etag = `"${++version}"`;
      files.set(key, { value: structuredClone(value), etag });
      return { modified: true, etag };
    },
    remove: async (key) => {
      files.delete(key);
    },
  };
  return { files, storage };
}
function request(command?: Command, revision: string | null = null) {
  const url = 'https://barbar.example/api/barbar';
  const base = new Request(url);
  return new Request(url, {
    method: command ? 'POST' : 'GET',
    headers: { origin: 'https://barbar.example', cookie: sessionCookie(base, false, 'admin').split(';')[0] },
    ...(command ? { body: JSON.stringify({ command, revision }) } : {}),
  });
}
beforeEach(() => {
  vi.stubEnv('BARBAR_ADMIN_PASSWORD', 'admin-fixture-password-123');
  vi.stubEnv('BARBAR_ADMIN_USERNAME', 'admin');
  vi.stubEnv('BARBAR_PASSWORD', 'fixture-password-123');
  vi.stubEnv('BARBAR_USERNAME', 'barbar');
});
afterEach(() => vi.unstubAllEnvs());
describe('Node API and daily files', () => {
  it('requires authentication and checks login and origin', async () => {
    const { storage } = memoryStore();
    const repository = legacyRepository(storage);
    expect((await handleBarApi(new Request('https://barbar.example/api/barbar'), repository)).status).toBe(
      401,
    );
    const login = (username: string, password: string, origin = 'https://barbar.example') =>
      new Request('https://barbar.example/api/barbar/auth', {
        method: 'POST',
        headers: { origin },
        body: JSON.stringify({ username, password }),
      });
    expect((await auth(login('other', 'fixture-password-123'))).status).toBe(401);
    expect((await auth(login('barbar', 'wrong'))).status).toBe(401);
    expect((await auth(login('barbar', 'fixture-password-123', 'https://evil.example'))).status).toBe(403);
    const ok = await auth(login('barbar', 'fixture-password-123'));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toContain('HttpOnly');
    expect(ok.headers.get('set-cookie')).toContain('Secure');
  });
  it('stores each day under sales/ while keeping the manifest small', async () => {
    const { storage, files } = memoryStore();
    let data = initialData();
    data = applyCommand(data, {
      id: 'purchase',
      type: 'purchase',
      value: { id: 'p', alcoholId: 'vodka', date: '2026-09-01', ml: 1000, costPerLiter: 4000 },
    });
    data = applyCommand(data, {
      id: 'sale',
      type: 'sale',
      value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-02' },
    });
    const result = await commitSnapshot(storage, await readSnapshot(storage), data);
    expect(result.modified).toBe(true);
    expect([...files.keys()].some((k) => k.startsWith('sales/2026-09-02/'))).toBe(true);
    expect(JSON.stringify(files.get('data.json')?.value)).not.toContain('"revenue"');
    expect((await readSnapshot(storage)).data.sales).toEqual(data.sales);
  });
  it('rejects one of two simultaneous sales that exceed stock', async () => {
    const { storage } = memoryStore();
    const repository = legacyRepository(storage);
    const purchase: Command = {
      type: 'purchase',
      id: 'purchase',
      value: { id: 'p', alcoholId: 'vodka', date: '2026-09-01', ml: 100, costPerLiter: 4000 },
    };
    expect((await handleBarApi(request(purchase), repository)).status).toBe(200);
    const sale = (id: string): Command => ({
      type: 'sale',
      id,
      value: { kind: 'alcohol', productId: 'vodka', quantity: 80, date: '2026-09-02' },
    });
    const results = await Promise.all([
      handleBarApi(request(sale('sale-1')), repository),
      handleBarApi(request(sale('sale-2')), repository),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const state = await readSnapshot(storage);
    expect(stock(state.data, 'vodka')).toBe(20);
    expect(state.data.sales).toHaveLength(1);
  });
  it('removes purged day files and preserves stock', async () => {
    const { storage, files } = memoryStore();
    const repository = legacyRepository(storage);
    await handleBarApi(
      request({
        id: 'p',
        type: 'purchase',
        value: { id: 'purchase', alcoholId: 'vodka', ml: 1000, costPerLiter: 4000, date: '2026-09-01' },
      }),
      repository,
    );
    await handleBarApi(
      request({
        id: 's',
        type: 'sale',
        value: { kind: 'alcohol', productId: 'vodka', quantity: 50, date: '2026-09-02' },
      }),
      repository,
    );
    const before = await readSnapshot(storage);
    const result = await handleBarApi(
      request({ id: 'clean', type: 'purge', before: '2026-09-05' }, before.revision),
      repository,
    );
    expect(result.status).toBe(200);
    expect([...files.keys()].filter((k) => k.startsWith('sales/'))).toEqual([]);
    expect(stock((await readSnapshot(storage)).data, 'vodka')).toBe(950);
  });
  it('blocks destructive changes based on a stale revision', async () => {
    const { storage } = memoryStore();
    const repository = legacyRepository(storage);
    await handleBarApi(
      request({
        id: 'p',
        type: 'purchase',
        value: { id: 'purchase', alcoholId: 'vodka', ml: 1000, costPerLiter: 4000, date: '2026-09-01' },
      }),
      repository,
    );
    const response = await handleBarApi(
      request({ id: 'restore', type: 'restore', value: initialData() }, null),
      repository,
    );
    expect(response.status).toBe(409);
    expect(stock((await readSnapshot(storage)).data, 'vodka')).toBe(1000);
  });
  it('never reports success on a missing storage ETag', async () => {
    const storage: Storage = {
      read: async () => null,
      write: async () => ({ modified: true, etag: '' }),
      remove: async () => undefined,
    };
    await expect(commitSnapshot(storage, await readSnapshot(storage), initialData())).rejects.toThrow(
      'acknowledged',
    );
  });
});
