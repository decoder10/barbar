import { json } from '../lib/barbar-auth';
import { mongoConnection, type DeployInfo } from '../lib/barbar-mongo';
import { mongoUsers } from '../lib/barbar-users';
import { handlePhotoUpload } from '../lib/photos/upload';
import { blobPhotoFiles } from '../lib/photos/store';
let connection: ReturnType<typeof mongoConnection> | undefined;
let users: ReturnType<typeof mongoUsers> | undefined;
export default async (request: Request, context: { deploy: DeployInfo }) => {
  try {
    connection ||= mongoConnection(false, context?.deploy);
    users ||= mongoUsers(connection.db);
    return await handlePhotoUpload(request, users, blobPhotoFiles(context?.deploy));
  } catch {
    return json({ error: 'Загрузка фото временно недоступна.' }, 503);
  }
};
export const config = {
  path: '/api/barbar/photos',
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
