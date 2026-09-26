import { readFileSync } from 'node:fs';
import { StrictMode, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialData } from '../../src/barbar/domain/model';
import GuestMenu from '../../src/barbar/guest/GuestMenu';
import type { GuestInitial } from '../../src/barbar/guest/guest-initial';
import { acceptedLanguage, readGuestCookie } from '../../src/barbar/guest/guest-initial';
import en from '../../src/barbar/presentation/i18n/en.json';
import hy from '../../src/barbar/presentation/i18n/hy.json';
import { setTranslations } from '../../src/barbar/presentation/i18n/runtime';
import type { Repository } from './barbar-repository';
import { handleGuestMenuPage, siteHeaders } from './guest-menu-page';

const template = readFileSync('guest-menu.html', 'utf8');
const catalog = (data = initialData()) =>
  ({ readCatalog: async () => ({ catalogRevision: 'rev-7', data }) }) as unknown as Repository;
const render = (repository: Repository, url = 'https://barbar.test/menu', headers: HeadersInit = {}) =>
  handleGuestMenuPage(new Request(url, { headers }), repository, async () => template, 'deploy-1');
const embedded = (html: string) =>
  JSON.parse(
    html.match(/<script type="application\/json" id="guest-menu-data">([^<]*)<\/script>/)![1],
  ) as GuestInitial;

describe('server-rendered guest menu page', () => {
  it('embeds just the translations that reproduce the rendered markup for hydration', async () => {
    for (const [language, dictionary] of [
      ['en', en],
      ['hy', hy],
    ] as const) {
      const html = await (
        await render(catalog(), 'https://barbar.test/menu', { 'accept-language': language })
      ).text();
      const initial = embedded(html);
      const used = Object.keys(initial.translations!).length;
      expect(used).toBeGreaterThan(10);
      expect(used).toBeLessThan(Object.keys(dictionary).length / 5);
      // The browser's first render: the same state, with only the embedded translations.
      setTranslations(language, initial.translations);
      const browser = renderToString(createElement(StrictMode, null, createElement(GuestMenu, { initial })));
      const server = html.slice(
        html.indexOf('<div id="root">') + '<div id="root">'.length,
        html.indexOf('</div><script type="application/json"'),
      );
      expect(browser).toBe(server);
    }
    const russian = embedded(await (await render(catalog(), undefined, { 'accept-language': 'ru' })).text());
    expect(russian.translations).toEqual({});
  });

  it('puts names and prices into the HTML with the state the browser hydrates', async () => {
    const data = initialData();
    const item = data.cocktails.find((c) => c.price > 0 && !c.guestHidden && !c.stockAlcoholId)!;
    const response = await render(catalog(data), 'https://barbar.test/menu', { 'accept-language': 'en-US' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    const markup = html.slice(0, html.indexOf('id="guest-menu-data"'));
    expect(markup).toContain(`<html lang="en"`);
    expect(markup).toContain('<title>BAR BAR · Menu</title>');
    expect(markup).toContain(item.name);
    // React separates adjacent text nodes with an empty comment.
    expect(markup).toContain(`<b>${new Intl.NumberFormat('en-US').format(item.price)}<!-- --> ֏</b>`);
    expect(markup).toMatch(/class="menu-card/);
    const initial = embedded(html);
    expect(initial).toMatchObject({ language: 'en', theme: 'dark', view: 'grid' });
    expect(initial.menu.revision).toBe('rev-7');
    expect(initial.menu.sections.flatMap((s) => s.items).some((i) => i.id === item.id)).toBe(true);
  });

  it('never renders costs, stock quantities, recipes or the table code', async () => {
    const data = initialData();
    data.alcohol = data.alcohol.map((a, index) => (index === 0 ? { ...a, costPerLiter: 987654 } : a));
    const poured = data.alcohol.find((a) => a.category === 'alcohol' && a.pricePerLiter > 0)!;
    const repository = {
      ...catalog(data),
      readStock: async () => ({
        revision: 'ledger-3',
        catalogRevision: 'rev-7',
        stock: [{ alcoholId: poured.id, ml: 55555, cost: 4444444 }],
      }),
    } as unknown as Repository;
    const response = await render(repository, 'https://barbar.test/menu?table=SECRET-CODE-123');
    const html = await response.text();
    expect(html).not.toMatch(
      /987654|55555|4444444|costPerLiter|"ingredients"|stockAlcoholId|SECRET-CODE-123/,
    );
    expect(response.headers.get('etag')).toContain('ledger-3');
  });

  it('asks for the first row of photos with the page and leaves the rest lazy', async () => {
    const html = await (await render(catalog())).text();
    const markup = html.slice(0, html.indexOf('id="guest-menu-data"'));
    const cards = markup
      .split('<article class="menu-card')
      .slice(1)
      .map((card) => card.match(/<img [^>]*>/g) || []);
    expect(cards.length).toBeGreaterThan(10);
    for (const images of cards.slice(0, 2)) {
      expect(images.length).toBeGreaterThan(0);
      for (const image of images) {
        // React writes `fetchPriority`; HTML attribute names are case-insensitive.
        expect(image).toMatch(/ fetchpriority="high"/i);
        expect(image).toContain('loading="eager"');
        expect(image).not.toContain('loading="lazy"');
      }
    }
    for (const image of cards.slice(2).flat()) {
      expect(image).toContain('loading="lazy"');
      expect(image).not.toMatch(/fetchpriority/i);
    }
  });

  it('keeps a hostile name inert in both the markup and the embedded data', async () => {
    const data = initialData();
    const index = data.cocktails.findIndex((c) => c.price > 0 && !c.guestHidden && !c.stockAlcoholId);
    const hostile = 'Evil </script><script>alert(1)</script> & <b>';
    data.cocktails[index] = { ...data.cocktails[index], name: hostile };
    const html = await (await render(catalog(data))).text();
    expect(html).not.toContain('<script>alert(1)');
    expect(html.match(/<\/script>/g)!.length).toBe(html.match(/<script\b/g)!.length);
    const names = embedded(html).menu.sections.flatMap((s) => s.items.map((i) => i.name));
    expect(names).toContain(hostile);
  });

  it('renders the saved language, theme and view; otherwise the browser language', async () => {
    const saved = await (
      await render(catalog(), 'https://barbar.test/menu', {
        cookie: 'barbar_session=x; barbar-guest=hy.light.list',
        'accept-language': 'ru-RU',
      })
    ).text();
    expect(saved).toContain('<html lang="hy"');
    expect(saved).toContain('<title>BAR BAR · Ճաշացանկ</title>');
    expect(saved).toContain('data-menu-theme="light"');
    expect(saved).toContain('menu-list');
    expect(embedded(saved)).toMatchObject({ language: 'hy', theme: 'light', view: 'list' });
    const russian = await (
      await render(catalog(), 'https://barbar.test/menu', { 'accept-language': 'ru-RU,ru;q=0.9' })
    ).text();
    expect(russian).toContain('<html lang="ru"');
    expect(russian).toContain('Коктейли');
    expect(acceptedLanguage('de-DE, ru;q=0.8, en;q=0.5')).toBe('ru');
    expect(acceptedLanguage('fr-FR')).toBe('en');
    expect(acceptedLanguage(null)).toBe('en');
    expect(readGuestCookie('barbar-guest=xx.pink.table')).toEqual({
      language: undefined,
      theme: undefined,
      view: undefined,
    });
  });

  it('is cached like /api/menu, varied by the guest choice, and answers 304 to a known ETag', async () => {
    const first = await render(catalog());
    expect(first.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(first.headers.get('netlify-cdn-cache-control')).toContain('s-maxage=60');
    expect(first.headers.get('netlify-vary')).toBe('cookie=barbar-guest,language=en|ru|hy');
    const etag = first.headers.get('etag')!;
    expect(etag).toContain('rev-7');
    expect(etag).toContain('deploy-1');
    const again = await render(catalog(), 'https://barbar.test/menu', { 'if-none-match': etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    const other = await render(catalog(), 'https://barbar.test/menu', {
      'if-none-match': etag,
      cookie: 'barbar-guest=ru.dark.grid',
    });
    expect(other.status).toBe(200);
  });

  it('serves the unrendered page, uncached, when the catalog cannot be read', async () => {
    for (const repository of [
      {} as Repository,
      { readCatalog: async () => Promise.reject(new Error('offline')) } as unknown as Repository,
    ]) {
      const response = await render(repository);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe(template);
    }
  });

  it('refuses writes and sends the site security headers of netlify.toml', async () => {
    const post = await handleGuestMenuPage(
      new Request('https://barbar.test/menu', { method: 'POST', body: 'x' }),
      catalog(),
      async () => template,
      'd',
    );
    expect(post.status).toBe(405);
    const head = await handleGuestMenuPage(
      new Request('https://barbar.test/menu', { method: 'HEAD' }),
      catalog(),
      async () => template,
      'd',
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const toml = readFileSync('netlify.toml', 'utf8');
    const block = toml.slice(toml.indexOf('for = "/*"'));
    const configured = Object.fromEntries(
      [...block.slice(0, block.indexOf('[[headers]]')).matchAll(/^\s+([\w-]+) = "(.*)"$/gm)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    expect(siteHeaders).toEqual(configured);
    for (const [name, value] of Object.entries(siteHeaders)) expect(head.headers.get(name)).toBe(value);
  });
});
