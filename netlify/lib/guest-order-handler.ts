import { guestTokenValid, type GuestRequestInput } from '../../src/barbar/domain/guest-requests';
import { json, sameOrigin } from './barbar-auth';
import type { guestOrderStore } from './guest-order-store';
import { HttpError, respondError } from './http';

export async function handleGuestOrder(request: Request, store: ReturnType<typeof guestOrderStore>) {
  let response: Response;
  try {
    if (!['GET', 'POST'].includes(request.method)) throw new HttpError('Метод не поддерживается.', 405);
    const params = new URL(request.url).searchParams;
    if (request.method === 'GET') {
      const code = params.get('code');
      if (!code || !/^[a-zA-Z0-9]{6,32}$/.test(code)) throw new HttpError('Стол недоступен.', 404);
      const id = params.get('id');
      if (id && !guestTokenValid(id)) throw new HttpError('Заявка не найдена.', 404);
      const result = id ? await store.status(id, code) : await store.table(code);
      if (!result) throw new HttpError(id ? 'Заявка не найдена.' : 'Стол недоступен.', 404);
      response = json(id ? { request: result } : { table: result });
    } else {
      if (!sameOrigin(request)) throw new HttpError('Недопустимый источник запроса.', 403);
      const text = await request.text();
      if (text.length > 12000) throw new HttpError('Заявка слишком большая.', 413);
      let input: GuestRequestInput;
      try {
        input = JSON.parse(text);
      } catch {
        throw new HttpError('Некорректный JSON.');
      }
      if (
        !input ||
        !guestTokenValid(input.id) ||
        typeof input.code !== 'string' ||
        !/^[a-zA-Z0-9]{6,32}$/.test(input.code)
      )
        throw new HttpError('Некорректная заявка.');
      response = json({ request: await store.submit(input) });
    }
  } catch (error) {
    response = respondError(error, 'Не удалось отправить заявку. Повторите попытку.');
  }
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Netlify-CDN-Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
