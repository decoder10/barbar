import type { UserProfile } from '../../src/barbar/domain/identity/user';
import { authenticated, json, roleFor, sameOrigin } from './barbar-auth';
import type { Repository } from './barbar-repository';
import type { IdentityStore } from './barbar-users';
import { respondError } from './http';
import { handleCards } from './routes/cards';
import { catalogRoute, handleCatalog } from './routes/catalog';
import { handleCommand } from './routes/commands';
import { handleOrders } from './routes/orders';
import { handleWorkingRead } from './routes/working';

/**
 * Transport only: who is asking, is the method and origin acceptable, which route — then one
 * route module does the work and one error mapping answers whatever it throws.
 */
export const handleBarApi = async (
  request: Request,
  repository: Repository,
  users: IdentityStore,
  resolvedUser?: UserProfile,
) => {
  const user = resolvedUser || (await authenticated(request, users));
  if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
  const role = roleFor(user);
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Метод не поддерживается.' }, 405);
  if (request.method === 'POST' && !sameOrigin(request))
    return json({ error: 'Недопустимый источник запроса.' }, 403);
  try {
    const split = request.headers.get('X-Barbar-Protocol') === '2' && !!repository.readStock;
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/barbar/catalog/cards') return await handleCards(request, repository, role);
    if (pathname === '/api/barbar/orders') return await handleOrders(request, repository, role);
    const catalog = catalogRoute(pathname);
    if (catalog)
      return await handleCatalog(
        request,
        repository,
        role,
        catalog[1] as 'alcohol' | 'cocktails' | undefined,
      );
    if (request.method === 'GET') return await handleWorkingRead(request, repository, role, split);
    return await handleCommand(request, repository, user, role, split);
  } catch (error) {
    return respondError(
      error,
      'Хранилище временно недоступно. Проверьте подключение и повторите попытку в той же форме.',
    );
  }
};
