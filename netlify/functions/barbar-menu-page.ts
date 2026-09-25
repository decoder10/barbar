import type { DeployInfo } from '../lib/barbar-mongo';
import { handleGuestMenuPage } from '../lib/guest-menu-page';
import { guestRepository } from '../lib/guest-repository';
import { observe } from '../lib/observability';

// The built page is a static file of this deploy; it is read once per function instance.
let template: { deploy: string; html: Promise<string> } | undefined;
function builtPage(request: Request, deploy: string) {
  if (template?.deploy !== deploy) {
    // Never follow a redirect: `/menu.html` must not lead back to this function.
    const html = fetch(new URL('/menu.html', request.url), { redirect: 'manual' }).then((response) => {
      if (response.status !== 200) throw new Error(`menu.html: ${response.status}`);
      return response.text();
    });
    template = { deploy, html };
    html.catch(() => {
      if (template?.html === html) template = undefined;
    });
  }
  return template.html;
}

export default async (request: Request, context: { deploy: DeployInfo }) => {
  const started = performance.now();
  const deploy = context?.deploy?.id || 'unknown';
  try {
    const response = await handleGuestMenuPage(
      request,
      guestRepository(context.deploy),
      () => builtPage(request, deploy),
      deploy,
    );
    return observe('/menu', request, response, started);
  } catch {
    // The static page renders the menu in the browser, as before server rendering. The marker stops a
    // loop should `/menu.html` ever be redirected back here.
    const url = new URL(request.url);
    if (url.searchParams.has('static'))
      return new Response('Меню временно недоступно. Обновите страницу через минуту.', {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'Retry-After': '60',
        },
      });
    url.searchParams.set('static', '1');
    return Response.redirect(new URL(`/menu.html${url.search}`, url), 302);
  }
};
export const config = {
  path: ['/menu', '/menu/'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
