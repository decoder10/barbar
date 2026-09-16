import { authenticated, json, roleFor, sameOrigin, sessionCookie, sessionToken } from './barbar-auth';
import { UserError, type IdentityStore } from './barbar-users';
import { respondError } from './http';
async function body(request: Request) {
  const text = await request.text();
  if (text.length > 4096) throw new UserError('Запрос слишком большой.', 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new UserError('Некорректный запрос.');
  }
}
const failure = (error: unknown) =>
  respondError(error, 'База пользователей временно недоступна. Повторите попытку.');
export async function handleAuth(request: Request, users: IdentityStore) {
  if (!['GET', 'POST', 'DELETE', 'PATCH'].includes(request.method))
    return json({ error: 'Метод не поддерживается.' }, 405);
  if (request.method !== 'GET' && !sameOrigin(request))
    return json({ error: 'Недопустимый источник запроса.' }, 403);
  try {
    if (request.method === 'GET') {
      const user = await authenticated(request, users);
      return json({ authenticated: !!user, role: user ? roleFor(user) : null, user });
    }
    if (request.method === 'PATCH') {
      const user = await authenticated(request, users);
      if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
      if (!users.setPreferences) throw new Error('Preferences unavailable');
      return json({ user: await users.setPreferences(user.id, await body(request)) });
    }
    if (request.method === 'DELETE') {
      await users.revoke(sessionToken(request));
      return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie(request) });
    }
    const value = await body(request);
    const session = await users.login(value?.username, value?.password);
    if (!session) return json({ error: 'Неверный логин или пароль.' }, 401);
    await users.revoke(sessionToken(request));
    return json({ authenticated: true, role: roleFor(session.user), user: session.user }, 200, {
      'Set-Cookie': sessionCookie(request, session.token),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function handleUsers(request: Request, users: IdentityStore) {
  try {
    const user = await authenticated(request, users);
    if (!user) return json({ error: 'Войдите в Barbar Cafe.' }, 401);
    if (user.role !== 'owner')
      return json({ error: 'Управление пользователями доступно только владельцу.' }, 403);
    if (request.method === 'GET') return json({ users: await users.list() });
    if (!['POST', 'PATCH'].includes(request.method)) return json({ error: 'Метод не поддерживается.' }, 405);
    if (!sameOrigin(request)) return json({ error: 'Недопустимый источник запроса.' }, 403);
    const input = await body(request);
    if (request.method === 'PATCH') {
      if (!users.update) throw new Error('User updates unavailable');
      return json({ user: await users.update(input?.id, input, user) });
    }
    return json({ user: await users.create(input, user) }, 201);
  } catch (error) {
    return failure(error);
  }
}
