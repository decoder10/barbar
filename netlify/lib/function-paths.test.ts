import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Netlify answers an empty HTTP 500 before invoking a function whose `config.path` equals a static page
// `<path>.html` (or `<path>/index.html`) of the publish directory. `/menu` failed this way while the
// guest template was built as `dist/menu.html`.
const functionPaths = readdirSync('netlify/functions')
  .filter((file) => /\.(m?[jt]sx?)$/.test(file))
  .flatMap((file) => {
    const source = readFileSync(`netlify/functions/${file}`, 'utf8');
    const config = source.slice(source.indexOf('export const config'));
    const value = config.match(/\bpath:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/)?.[1] ?? '';
    return [...value.matchAll(/['"]([^'"]+)['"]/g)].map((m) => ({ file, path: m[1] }));
  });

// Pages Vite writes to `dist`: its HTML inputs (kept at their repo-relative names) and `public/`.
const vite = readFileSync('vite.config.ts', 'utf8');
const inputs = [...(vite.match(/input:\s*\{([^}]*)\}/)?.[1] ?? '').matchAll(/'([^']+\.html)'/g)].map(
  (m) => m[1],
);
const publicPages = (dir: string, prefix = ''): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? publicPages(`${dir}/${entry.name}`, `${prefix}${entry.name}/`)
          : entry.name.endsWith('.html')
            ? [`${prefix}${entry.name}`]
            : [],
      )
    : [];
const pages = new Set([...inputs, ...publicPages('public')]);

describe('function routes', () => {
  it('reads the routes and the built pages', () => {
    expect(functionPaths).toContainEqual({ file: 'barbar-menu-page.ts', path: '/menu' });
    expect(pages).toContain('index.html');
    expect(pages).toContain('guest-menu.html');
  });

  it('never share a path with a static page', () => {
    for (const { file, path } of functionPaths) {
      const base = path.replace(/^\/+|\/+$/g, '');
      if (!base || base.includes('*') || base.includes(':')) continue;
      for (const page of [`${base}.html`, `${base}/index.html`])
        expect(pages.has(page), `${file}: ${path} collides with ${page}`).toBe(false);
    }
  });
});
