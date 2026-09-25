import { json } from '../lib/barbar-auth';
import type { DeployInfo } from '../lib/barbar-mongo';
import { handleGuestMenu } from '../lib/guest-menu-handler';
import { guestRepository } from '../lib/guest-repository';
import { observe } from '../lib/observability';

export default async (request: Request, context: { deploy: DeployInfo }) => {
  const started = performance.now();
  try {
    return observe(
      '/api/menu',
      request,
      await handleGuestMenu(request, guestRepository(context.deploy)),
      started,
    );
  } catch {
    return json({ error: 'Меню временно недоступно.' }, 503);
  }
};
export const config = {
  path: '/api/menu',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
