import { json } from '../lib/barbar-auth';
import { identityStore } from '../lib/barbar-identity';
import type { DeployInfo } from '../lib/barbar-mongo';
import { handleUsers } from '../lib/barbar-user-handler';
export default async (request: Request, context: { deploy: DeployInfo }) => {
  try {
    return await handleUsers(request, identityStore(context?.deploy));
  } catch {
    return json({ error: 'Не удалось подключить базу пользователей.' }, 503);
  }
};
export const config = {
  path: '/api/barbar/users',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
