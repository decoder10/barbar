import { getStore } from '@netlify/blobs';
import { authenticated, json } from '../lib/barbar-auth';
import { handleBarApi } from '../lib/barbar-handler';
import { readSnapshot, type Repository, type Storage } from '../lib/barbar-repository';
import { initialData } from '../../src/barbar/model';
import { mongoConnection, mongoRepository, type DeployInfo } from '../lib/barbar-mongo';

let repository: Repository | undefined;

export default async (request: Request, context: { deploy: DeployInfo }) => {
  if (!authenticated(request)) {
    return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  }
  try {
    if (!repository) {
      const { client, db } = mongoConnection(false, context?.deploy);
      repository = mongoRepository(client, db, async () => {
        // Preview deployments never import the live bar's ledger.
        if (context.deploy.context !== 'production') return initialData();
        let store = getStore({ name: 'barbar-cafe-v1', consistency: 'strong' });
        if (!(await store.getWithMetadata('data.json', { type: 'json' }))) {
          // Older Functions without runtime CONTEXT used this site-wide key even in production.
          store = getStore({ name: 'barbar-cafe-preview-local', consistency: 'strong' });
        }
        const legacy: Storage = {
          read: async (key) => {
            const entry = await store.getWithMetadata(key, { type: 'json' });
            if (entry && !entry.etag) throw new Error('Missing ETag');
            return entry ? { value: entry.data, etag: entry.etag! } : null;
          },
          write: async () => {
            throw new Error('Legacy storage is read-only');
          },
          remove: async () => {
            throw new Error('Legacy storage is read-only');
          },
        };
        return (await readSnapshot(legacy)).data;
      });
    }
    return handleBarApi(request, repository);
  } catch {
    return json(
      { error: 'Не удалось подключить MongoDB. Проверьте BARBAR_MONGODB_URI и настройки доступа к базе.' },
      503,
    );
  }
};
export const config = { path: '/api/barbar' };
