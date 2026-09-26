import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeployInfo } from './barbar-mongo';
import { guestMenuPageFunction, type GuestMenuRenderer } from './guest-menu-entry';
import { siteHeaders } from './site-headers';

const html = '<!doctype html><html lang="ru"><body><div id="root"></div></body></html>';
const context = { deploy: { id: 'deploy-1', context: 'production' } as DeployInfo };
const get = (url = 'https://barbar.test/menu', init: RequestInit = {}) =>
  new Request(url, { headers: { cookie: 'barbar-guest=en.dark.grid; session=secret' }, ...init });
const broken = (message: string) => async (): Promise<GuestMenuRenderer> => {
  throw new Error(message);
};
const errorLines = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls
    .map((call: unknown[]) => JSON.parse(String(call[0])))
    .filter((line: { metric?: string }) => line.metric === 'barbar.error');

afterEach(() => vi.restoreAllMocks());

describe('/menu function entry', () => {
  it('passes the rendered page through when the renderer loads', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const renderer: GuestMenuRenderer = async (_request, _context, template, deploy) =>
      new Response(`${await template()}<!-- ${deploy} -->`, { status: 200 });
    const handler = guestMenuPageFunction(
      async () => renderer,
      async () => html,
    );
    const response = await handler(get(), context);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(`${html}<!-- deploy-1 -->`);
    expect(response.headers.get('server-timing')).toMatch(/^total;dur=/);
  });

  it('serves the built page uncached and logs the error when the renderer cannot load', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = guestMenuPageFunction(broken('react-dom failed to initialise'), async () => html);
    const response = await handler(get(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    for (const [name, value] of Object.entries(siteHeaders)) expect(response.headers.get(name)).toBe(value);
    expect(await response.text()).toBe(html);
    const [line] = errorLines(errors);
    expect(line).toMatchObject({
      metric: 'barbar.error',
      route: '/menu',
      stage: 'load',
      message: 'react-dom failed to initialise',
    });
    expect(line.stack.split('\n').length).toBeLessThanOrEqual(6);
    // No cookies or other request data in the log.
    expect(JSON.stringify(errors.mock.calls)).not.toContain('secret');

    const head = await handler(get('https://barbar.test/menu', { method: 'HEAD' }), context);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('logs a render failure with its stage', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = guestMenuPageFunction(
      async () => async () => {
        throw new TypeError('boom');
      },
      async () => html,
    );
    expect((await handler(get(), context)).status).toBe(200);
    expect(errorLines(errors)[0]).toMatchObject({ stage: 'render', message: 'boom' });
  });

  it('redirects to the static page only without a template, and never loops', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = guestMenuPageFunction(broken('down'), async () => {
      throw new Error('menu.html: 404');
    });
    const redirect = await handler(get('https://barbar.test/menu?table=T7'), context);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('https://barbar.test/menu.html?table=T7&static=1');
    const again = await handler(get('https://barbar.test/menu?static=1'), context);
    expect(again.status).toBe(503);
    expect(again.headers.get('retry-after')).toBe('60');
    expect(errorLines(errors).map((line: { stage: string }) => line.stage)).toEqual([
      'load',
      'template',
      'load',
      'template',
    ]);
  });

  it('refuses writes without loading the renderer', async () => {
    const load = vi.fn(broken('must not load'));
    const handler = guestMenuPageFunction(load, async () => html);
    const post = await handler(get('https://barbar.test/menu', { method: 'POST', body: 'x' }), context);
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    expect(load).not.toHaveBeenCalled();
  });
});
