import type { UserProfile } from '../../src/barbar/domain/identity/user';
import type { IdentityStore } from './barbar-users';
export type Role = 'admin' | 'barbar';
const COOKIE = 'barbar_session';
export const roleFor = (user: UserProfile): Role => (user.role === 'owner' ? 'admin' : 'barbar');
export function sessionToken(request: Request) {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1) || ''
  );
}
export const authenticated = (request: Request, users: IdentityStore) => users.resolve(sessionToken(request));
export function sessionCookie(request: Request, token = '') {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 43200 : 0}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export const sameOrigin = (request: Request) => request.headers.get('origin') === new URL(request.url).origin;
export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
