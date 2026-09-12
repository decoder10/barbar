import { getStore } from '@netlify/blobs';
import { authenticated, json } from '../lib/barbar-auth';
import { handleBarApi } from '../lib/barbar-handler';
import type { Storage } from '../lib/barbar-repository';

export default async (request: Request) => {
  if (!authenticated(request)) {
    return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  }
  try {
    const preview = (process.env.BRANCH || 'local').replace(/[^a-zA-Z0-9_-]/g, '-');
    const store = getStore({
      name: process.env.CONTEXT === 'production' ? 'barbar-cafe-v1' : `barbar-cafe-preview-${preview}`,
      consistency: 'strong',
    });
    const storage: Storage = {
      read: async (key) => {
        const entry = await store.getWithMetadata(key, { type: 'json' });
        if (entry && !entry.etag) {
          throw new Error('Missing ETag');
        }
        return entry ? { value: entry.data, etag: entry.etag! } : null;
      },
      write: (key, value, condition) => store.setJSON(key, value, condition),
      remove: (key) => store.delete(key),
    };
    return handleBarApi(request, storage);
  } catch {
    return json({ error: 'Не удалось подключить Netlify Blobs. Проверьте настройки проекта.' }, 503);
  }
};
export const config = { path: '/api/barbar' };
