import { mongoConnection, type DeployInfo } from '../lib/barbar-mongo';
import { guestOrderStore } from '../lib/guest-order-store';
import { handleGuestOrder } from '../lib/guest-order-handler';
import { safelyDeliverNotifications } from '../lib/notifications/deliver';
import { json } from '../lib/barbar-auth';

export default async (request: Request, context: { deploy: DeployInfo }) => {
  try {
    const { db } = mongoConnection(false, context?.deploy);
    const response = await handleGuestOrder(request, guestOrderStore(db));
    if (request.method === 'POST' && response.ok) await safelyDeliverNotifications(db);
    return response;
  } catch {
    return json({ error: 'Заявки временно недоступны.' }, 503);
  }
};
export const config = {
  path: '/api/guest-order',
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
