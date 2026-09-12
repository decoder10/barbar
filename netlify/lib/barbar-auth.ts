import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'barbar_session';
const hash = (s: string) => createHash('sha256').update(s).digest();
export const passwordConfigured = () => (process.env.BARBAR_PASSWORD || '').length >= 12;
export const passwordMatches = (password: unknown) =>
  typeof password === 'string' &&
  password.length <= 1024 &&
  timingSafeEqual(hash(password), hash(process.env.BARBAR_PASSWORD || ''));
const sign = (value: string) =>
  createHmac('sha256', process.env.BARBAR_PASSWORD || '')
    .update(`barbar-v1:${value}`)
    .digest('hex');
export function authenticated(request: Request) {
  if (!passwordConfigured()) {
    return false;
  }
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!value) {
    return false;
  }
  const [expires, signature] = value.split('.');
  return (
    !!expires &&
    !!signature &&
    /^\d+$/.test(expires) &&
    Number(expires) > Date.now() &&
    timingSafeEqual(hash(signature), hash(sign(expires)))
  );
}
export function sessionCookie(request: Request, clear = false) {
  const expires = String(Date.now() + 12 * 60 * 60 * 1000);
  return `${COOKIE}=${clear ? '' : `${expires}.${sign(expires)}`}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 43200}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export const sameOrigin = (request: Request) => request.headers.get('origin') === new URL(request.url).origin;
export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
