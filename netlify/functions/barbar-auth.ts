import {
  authenticated,
  json,
  passwordConfigured,
  loginRole,
  sameOrigin,
  sessionCookie,
} from '../lib/barbar-auth';

export default async (request: Request) => {
  if (!passwordConfigured() && !passwordConfigured('admin')) {
    return json(
      {
        error:
          'Владелец должен настроить BARBAR_PASSWORD и отдельный BARBAR_ADMIN_PASSWORD (от 12 символов) на сервере.',
        setup: true,
      },
      503,
    );
  }
  if (request.method === 'GET') {
    const role = authenticated(request);
    return json({ authenticated: !!role, role });
  }
  if (!['POST', 'DELETE'].includes(request.method)) {
    return json({ error: 'Метод не поддерживается.' }, 405);
  }
  if (!sameOrigin(request)) {
    return json({ error: 'Недопустимый источник запроса.' }, 403);
  }
  if (request.method === 'DELETE') {
    return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie(request, true) });
  }
  try {
    const body = await request.text();
    if (body.length > 2048) {
      return json({ error: 'Слишком длинный пароль.' }, 400);
    }
    const credentials = JSON.parse(body);
    const role = loginRole(credentials.username, credentials.password);
    if (!role) {
      return json({ error: 'Неверный логин или пароль.' }, 401);
    }
    return json({ authenticated: true, role }, 200, { 'Set-Cookie': sessionCookie(request, false, role) });
  } catch {
    return json({ error: 'Некорректный запрос.' }, 400);
  }
};

export const config = {
  path: '/api/barbar/auth',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
