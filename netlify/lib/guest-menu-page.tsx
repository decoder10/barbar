import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import GuestMenu from '../../src/barbar/guest/GuestMenu';
import {
  acceptedLanguage,
  guestCookie,
  guestDataId,
  guestLanguages,
  guestTitle,
  readGuestCookie,
  type GuestInitial,
} from '../../src/barbar/guest/guest-initial';
import en from '../../src/barbar/presentation/i18n/en.json';
import hy from '../../src/barbar/presentation/i18n/hy.json';
import { recordTranslations, setTranslations } from '../../src/barbar/presentation/i18n/runtime';
import type { Repository } from './barbar-repository';
import { guestCdnCache, readGuestMenu } from './guest-menu-handler';

/**
 * Site-wide headers from `netlify.toml`. Netlify applies them to static files; a function response sets
 * them itself (a test keeps both copies equal).
 */
export const siteHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
};
const dictionaries = { en, hy, ru: {} } as Record<GuestInitial['language'], Record<string, string>>;
// JSON inside <script type="application/json">: `<`, `>` and `&` can only occur inside strings, where the
// \u escapes keep the same value and no name can close the element early. The script is never executed.
const safeJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const root = '<div id="root"></div>';

/** Server-rendered `/menu`: the built `menu.html` with the menu markup and the state it was rendered from. */
export function renderGuestMenuPage(template: string, initial: GuestInitial) {
  if (!template.includes(root)) throw new Error('menu.html has no empty #root');
  // Rendering is synchronous: nothing else can switch the shared dictionary before it finishes.
  setTranslations(initial.language, dictionaries[initial.language]);
  const { result: markup, translations } = recordTranslations(() =>
    renderToString(
      <StrictMode>
        <GuestMenu initial={initial} />
      </StrictMode>,
    ),
  );
  // The browser hydrates with the few translations this render used, without the whole dictionary.
  const data: GuestInitial = { ...initial, translations };
  return template
    .replace(/<html lang="[^"]*"/, `<html lang="${initial.language}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${guestTitle(initial.language)}</title>`)
    .replace(
      root,
      () =>
        `<div id="root">${markup}</div><script type="application/json" id="${guestDataId}">${safeJson(data)}</script>`,
    );
}

/**
 * `GET /menu`: positions and prices are in the HTML before any script runs. Cached like `/api/menu` and
 * varied by the guest's language, theme and view; the table code only matters to the browser.
 * Without the database the unrendered page is served, which loads the menu in the browser as before.
 */
export async function handleGuestMenuPage(
  request: Request,
  repository: Repository,
  template: () => Promise<string>,
  deploy: string,
) {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...siteHeaders, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  const html = await template();
  const page = (body: string | null, status: number, headers: Record<string, string>) =>
    new Response(request.method === 'HEAD' ? null : body, {
      status,
      headers: {
        ...siteHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex',
        ...headers,
      },
    });
  try {
    const current = await readGuestMenu(repository);
    if (!current) throw new Error('No catalog');
    const saved = readGuestCookie(request.headers.get('cookie'));
    const preferences = {
      language: saved.language || acceptedLanguage(request.headers.get('accept-language')),
      theme: saved.theme || 'dark',
      view: saved.view || 'grid',
    } as const;
    const choice = `${preferences.language}.${preferences.theme}.${preferences.view}`;
    const etag = `"guest-page-v1-${current.version}-${choice}-${deploy}"`;
    const headers = {
      // The browser always revalidates (the ETag covers prices, choices and the deployed scripts).
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': guestCdnCache,
      'Netlify-Vary': `cookie=${guestCookie},language=${guestLanguages.join('|')}`,
      ETag: etag,
    };
    if (request.headers.get('if-none-match') === etag) return page(null, 304, headers);
    const menu = current.menu();
    if (!menu) throw new Error('Empty catalog');
    return page(renderGuestMenuPage(html, { menu, ...preferences }), 200, headers);
  } catch {
    return page(html, 200, { 'Cache-Control': 'no-store' });
  }
}
