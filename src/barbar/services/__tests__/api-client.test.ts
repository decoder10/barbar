import { afterEach, describe, expect, it, vi } from 'vitest';
import { snapshotRead } from '../api-client';

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

describe('snapshotRead', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads once per snapshot, again for a new snapshot, and retries after a failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ batches: [] }))
      .mockResolvedValueOnce(json({ error: 'Ошибка' }, 500))
      .mockResolvedValue(json({ batches: [] }));
    vi.stubGlobal('fetch', fetch);
    const first = {};
    await snapshotRead(first, '/api/barbar/batches');
    // A remount after the first answer (not only a simultaneous read) reuses it.
    await snapshotRead(first, '/api/barbar/batches');
    expect(fetch).toHaveBeenCalledTimes(1);
    const second = {};
    await expect(snapshotRead(second, '/api/barbar/batches')).rejects.toThrow('Ошибка');
    await snapshotRead(second, '/api/barbar/batches');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
