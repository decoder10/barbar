import { initialData } from '../../src/barbar/domain/model';
import { json } from '../lib/barbar-auth';
import { mongoConnection, mongoRepository, type DeployInfo } from '../lib/barbar-mongo';
import type { Repository } from '../lib/barbar-repository';
import { handleGuestMenu } from '../lib/guest-menu-handler';
import { observe } from '../lib/observability';

let repository: Repository | undefined;

export default async (request: Request, context: { deploy: DeployInfo }) => {
  const started = performance.now();
  try {
    if (!repository) {
      const { client, db } = mongoConnection(false, context?.deploy);
      repository = mongoRepository(client, db, async () => {
        // A public request never imports the live ledger; the authenticated app does that once.
        if (context.deploy.context !== 'production') return initialData();
        throw new Error('Ledger is not initialised');
      });
    }
    return observe('/api/menu', request, await handleGuestMenu(request, repository), started);
  } catch {
    return json({ error: 'Меню временно недоступно.' }, 503);
  }
};
export const config = {
  path: '/api/menu',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
