import { guestMenuPageFunction, type GuestMenuRenderer } from '../lib/guest-menu-entry';
import { guestRepository } from '../lib/guest-repository';

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

// The renderer (React, react-dom/server and the guest UI) is pre-built by `scripts/build-menu-renderer.mjs`
// into one self-contained file shipped next to this function (`included_files` in netlify.toml). A
// non-literal specifier keeps this a real runtime import: the bundler neither inlines the renderer nor
// hoists its packages to the top of this function, so a failure to load it is caught and logged by
// `guestMenuPageFunction` and the guest still gets the built `menu.html`.
type RendererModule = typeof import('../lib/guest-menu-page');
const rendererUrl = () => new URL('../generated/guest-menu-renderer.mjs', import.meta.url).href;
let renderer: Promise<RendererModule> | undefined;
async function loadRenderer(): Promise<GuestMenuRenderer> {
  const loading = (renderer ??= import(/* @vite-ignore */ rendererUrl()) as Promise<RendererModule>);
  loading.catch(() => {
    if (renderer === loading) renderer = undefined;
  });
  const { handleGuestMenuPage } = await loading;
  return (request, context, page, deploy) =>
    handleGuestMenuPage(request, guestRepository(context.deploy), page, deploy);
}

export default guestMenuPageFunction(loadRenderer, builtPage);
export const config = {
  path: ['/menu', '/menu/'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
