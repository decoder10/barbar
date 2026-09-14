import { expect, test, vi } from 'vitest';
import { api } from './services/api-client';
test('concurrent session checks share one request, while later reads and writes stay fresh', async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ authenticated: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  try {
    await Promise.all([api('/api/barbar/auth'), api('/api/barbar/auth')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await api('/api/barbar/auth');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await Promise.all([
      api('/api/barbar/auth', { method: 'PATCH', body: '{}' }),
      api('/api/barbar/auth', { method: 'PATCH', body: '{}' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  } finally {
    vi.unstubAllGlobals();
  }
});
