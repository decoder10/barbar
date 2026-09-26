import type { DeployInfo } from './barbar-mongo';
import { logError, observe } from './observability';
import { siteHeaders } from './site-headers';

// Every answer a guest can see is HTML: mobile and in-app browsers (a QR link opened from a messenger)
// save a `text/plain` response as a file instead of showing it.
const unavailablePage =
  '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Меню</title></head><body><p>Меню временно недоступно. Обновите страницу через минуту.</p></body></html>';

/** The server renderer of `/menu`, loaded on the first request (it pulls in React and the guest UI). */
export type GuestMenuRenderer = (
  request: Request,
  context: { deploy: DeployInfo },
  template: () => Promise<string>,
  deploy: string,
) => Promise<Response>;

/**
 * `/menu` entry point with a minimal import graph: a renderer that cannot load or throws is logged as
 * `barbar.error` and the guest still gets the built `guest-menu.html`, which renders the menu in the browser.
 * A redirect to the static page is the last resort, when even the template cannot be read.
 */
export function guestMenuPageFunction(
  loadRenderer: () => Promise<GuestMenuRenderer>,
  template: (request: Request, deploy: string) => Promise<string>,
) {
  return async (request: Request, context: { deploy: DeployInfo }) => {
    const started = performance.now();
    const deploy = context?.deploy?.id || 'unknown';
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', {
        status: 405,
        headers: { ...siteHeaders, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    let stage = 'load';
    try {
      const render = await loadRenderer();
      stage = 'render';
      const response = await render(request, context, () => template(request, deploy), deploy);
      return observe('/menu', request, response, started);
    } catch (error) {
      logError('/menu', stage, error);
    }
    const html = await template(request, deploy).catch((error: unknown) => {
      logError('/menu', 'template', error);
      return undefined;
    });
    if (html !== undefined)
      return observe(
        '/menu',
        request,
        new Response(request.method === 'HEAD' ? null : html, {
          status: 200,
          headers: {
            ...siteHeaders,
            'Content-Type': 'text/html; charset=utf-8',
            'X-Robots-Tag': 'noindex',
            'Cache-Control': 'no-store',
          },
        }),
        started,
      );
    // The static page renders the menu in the browser, as before server rendering. The marker stops a
    // loop should the template ever be redirected back here.
    const url = new URL(request.url);
    if (url.searchParams.has('static'))
      return new Response(request.method === 'HEAD' ? null : unavailablePage, {
        status: 503,
        headers: {
          ...siteHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'X-Robots-Tag': 'noindex',
          'Cache-Control': 'no-store',
          'Retry-After': '60',
        },
      });
    url.searchParams.set('static', '1');
    return Response.redirect(new URL(`/guest-menu.html${url.search}`, url), 302);
  };
}
