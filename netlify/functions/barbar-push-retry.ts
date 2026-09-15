import { mongoConnection, type DeployInfo } from '../lib/barbar-mongo';
import { safelyDeliverNotifications } from '../lib/notifications/deliver';
import { pushConfig } from '../lib/notifications/subscriptions';
export default async (_request: Request, context: { deploy: DeployInfo }) => {
  if (pushConfig()) await safelyDeliverNotifications(mongoConnection(false, context.deploy).db);
  return new Response(null, { status: 204 });
};
export const config = { schedule: '*/5 * * * *' };
