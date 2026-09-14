import { handleHistory } from '../lib/queries/history';
import { json } from '../lib/barbar-auth';
import { mongoConnection, type DeployInfo } from '../lib/barbar-mongo';
import { mongoUsers } from '../lib/barbar-users';
let connection: ReturnType<typeof mongoConnection> | undefined;
let users: ReturnType<typeof mongoUsers> | undefined;
export default async (request: Request, context: { deploy: DeployInfo }) => {
  try {
    const started = performance.now();
    connection ||= mongoConnection(false, context?.deploy);
    users ||= mongoUsers(connection.db);
    const response = await handleHistory(request, connection.db, users);
    response.headers.set('Server-Timing', `app;dur=${(performance.now() - started).toFixed(1)}`);
    return response;
  } catch {
    return json({ error: 'История временно недоступна.' }, 503);
  }
};
export const config = {
  path: '/api/barbar/history',
  rateLimit: { windowLimit: 180, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
