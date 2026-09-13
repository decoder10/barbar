import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'barbar_session';
const hash = (s: string) => createHash('sha256').update(s).digest();
export type Role = 'admin' | 'barbar';
const passwordFor = (role: Role) =>
  process.env[role === 'admin' ? 'BARBAR_ADMIN_PASSWORD' : 'BARBAR_PASSWORD'] || '';
const usernameFor = (role: Role) =>
  role === 'admin' ? process.env.BARBAR_ADMIN_USERNAME || 'admin' : process.env.BARBAR_USERNAME || 'barbar';
export const passwordConfigured = (role: Role = 'barbar') => passwordFor(role).length >= 12;
export function loginRole(username: unknown, password: unknown): Role | null {
  if (typeof password !== 'string' || password.length > 1024) return null;
  // Ambiguous accounts must never grant owner access.
  if (usernameFor('admin') === usernameFor('barbar')) return null;
  for (const role of ['barbar', 'admin'] as const) {
    if (
      passwordConfigured(role) &&
      username === usernameFor(role) &&
      timingSafeEqual(hash(password), hash(passwordFor(role)))
    )
      return role;
  }
  return null;
}
const sign = (value: string, role: Role) =>
  createHmac('sha256', passwordFor(role))
    .update(`barbar-v2:${usernameFor(role)}:${value}`)
    .digest('hex');
export function authenticated(request: Request): Role | null {
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!value) return null;
  const [role, expires, signature, extra] = value.split('.');
  if (
    (role !== 'admin' && role !== 'barbar') ||
    !passwordConfigured(role) ||
    extra !== undefined ||
    !expires ||
    !signature ||
    !/^\d+$/.test(expires) ||
    Number(expires) <= Date.now()
  )
    return null;
  return timingSafeEqual(hash(signature), hash(sign(`${role}.${expires}`, role))) ? role : null;
}
export function sessionCookie(request: Request, clear = false, role: Role = 'barbar') {
  const expires = String(Date.now() + 12 * 60 * 60 * 1000);
  const value = `${role}.${expires}`;
  return `${COOKIE}=${clear ? '' : `${value}.${sign(value, role)}`}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 43200}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export const sameOrigin = (request: Request) => request.headers.get('origin') === new URL(request.url).origin;
export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
