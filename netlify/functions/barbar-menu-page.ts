import { guestMenuPageFunction, type GuestMenuRenderer } from '../lib/guest-menu-entry';

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

// React, the guest UI and the database driver load inside the request, so a failure while initialising
// them is caught and logged instead of failing the function before it can answer.
async function loadRenderer(): Promise<GuestMenuRenderer> {
  const [{ handleGuestMenuPage }, { guestRepository }] = await Promise.all([
    import('../lib/guest-menu-page'),
    import('../lib/guest-repository'),
  ]);
  return (request, context, page, deploy) =>
    handleGuestMenuPage(request, guestRepository(context.deploy), page, deploy);
}

export default guestMenuPageFunction(loadRenderer, builtPage);
export const config = {
  path: ['/menu', '/menu/'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
