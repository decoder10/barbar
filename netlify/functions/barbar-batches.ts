import { json } from '../lib/barbar-auth';
import { identityStore } from '../lib/barbar-identity';
import { mongoConnection, type DeployInfo } from '../lib/barbar-mongo';
import { handleBatches } from '../lib/queries/batches';
import { observe } from '../lib/observability';

export default async (request: Request, context: { deploy: DeployInfo }) => {
  const started = performance.now();
  try {
    const response = await handleBatches(
      request,
      mongoConnection(false, context.deploy).db,
      identityStore(context.deploy),
    );
    return observe('/api/barbar/batches', request, response, started);
  } catch {
    return json({ error: 'Партии временно недоступны.' }, 503);
  }
};
export const config = {
  path: '/api/barbar/batches',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
