import { json } from '../lib/barbar-auth';
import type { DeployInfo } from '../lib/barbar-mongo';
import { handlePhotoFile } from '../lib/photos/serve';
import { blobPhotoFiles } from '../lib/photos/store';

/** Public owner photos; the CDN keeps each immutable file, so a menu view rarely reaches this function. */
export default async (request: Request, context: { deploy: DeployInfo }) => {
  try {
    return await handlePhotoFile(request, blobPhotoFiles(context?.deploy));
  } catch {
    return json({ error: 'Фото временно недоступно.' }, 503);
  }
};
export const config = {
  path: '/api/photos/*',
  rateLimit: { windowLimit: 1200, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
