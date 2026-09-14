import { json } from '../lib/barbar-auth';
import { identityStore } from '../lib/barbar-identity';
import type { DeployInfo } from '../lib/barbar-mongo';
import { handleAuth } from '../lib/barbar-user-handler';
export default async (request: Request, context: { deploy: DeployInfo }) => {
  try {
    const started = performance.now();
    const response = await handleAuth(request, identityStore(context?.deploy));
    response.headers.set('Server-Timing', `app;dur=${(performance.now() - started).toFixed(1)}`);
    return response;
  } catch {
    return json({ error: 'Не удалось подключить базу пользователей.' }, 503);
  }
};
export const config = {
  path: '/api/barbar/auth',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
