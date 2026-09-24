import { handleReport } from '../lib/queries/report';
import { json } from '../lib/barbar-auth';
import { mongoConnection, type DeployInfo } from '../lib/barbar-mongo';
import { mongoUsers } from '../lib/barbar-users';
let connection: ReturnType<typeof mongoConnection> | undefined;
let users: ReturnType<typeof mongoUsers> | undefined;
export default async (request: Request, context: { deploy: DeployInfo }) => {
  try {
    connection ||= mongoConnection(false, context?.deploy);
    users ||= mongoUsers(connection.db);
    return await handleReport(request, connection.db, users);
  } catch {
    return json({ error: 'История временно недоступна.' }, 503);
  }
};
export const config = {
  path: ['/api/barbar/report', '/api/barbar/report/compare', '/api/barbar/prices'],
  rateLimit: { windowLimit: 180, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
