import {
  authenticated,
  json,
  passwordConfigured,
  passwordMatches,
  sameOrigin,
  sessionCookie,
} from '../lib/barbar-auth';

export default async (request: Request) => {
  if (!passwordConfigured()) {
    return json(
      {
        error:
          'Владелец сайта должен задать BARBAR_PASSWORD (от 12 символов) в Netlify и выполнить новый deploy.',
        setup: true,
      },
      503,
    );
  }
  if (request.method === 'GET') {
    return json({ authenticated: authenticated(request) });
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
    if (
      credentials.username !== (process.env.BARBAR_USERNAME || 'barbar') ||
      !passwordMatches(credentials.password)
    ) {
      return json({ error: 'Неверный логин или пароль.' }, 401);
    }
    return json({ authenticated: true }, 200, { 'Set-Cookie': sessionCookie(request) });
  } catch {
    return json({ error: 'Некорректный запрос.' }, 400);
  }
};

export const config = {
  path: '/api/barbar/auth',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
