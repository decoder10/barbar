import { identityStore } from '../lib/barbar-identity';
import { mongoConnection, type DeployInfo } from '../lib/barbar-mongo';
import { handlePush } from '../lib/notifications/subscriptions';
import { json } from '../lib/barbar-auth';
export default async (request: Request, context: { deploy: DeployInfo }) => {
  try {
    const { db } = mongoConnection(false, context.deploy);
    return await handlePush(request, db, identityStore(context.deploy));
  } catch {
    return json({ error: 'Уведомления временно недоступны.' }, 503);
  }
};
export const config = { path: '/api/barbar/push' };
