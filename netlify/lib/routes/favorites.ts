import type { UserProfile } from '../../../src/barbar/domain/identity/user';
import { json } from '../barbar-auth';
import type { IdentityStore } from '../barbar-users';
import { HttpError } from '../http';

/**
 * The user's own favourites: `POST { favorites: ['kind:productId', …] }` replaces the list in the profile of
 * the session's user, and nobody else's. Only that field is written; preferences and access are untouched.
 * It lives beside the ledger API rather than the sign-in route, so tapping stars never uses sign-in's limit.
 */
export async function handleFavorites(request: Request, users: IdentityStore, user: UserProfile) {
  if (request.method !== 'POST') throw new HttpError('Метод не поддерживается.', 405);
  const text = await request.text();
  if (text.length > 4096) throw new HttpError('Запрос слишком большой.', 413);
  let value: { favorites?: unknown };
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpError('Некорректный запрос.');
  }
  if (!users.setFavorites) throw new Error('Favorites unavailable');
  return json({ user: await users.setFavorites(user.id, value?.favorites) });
}
