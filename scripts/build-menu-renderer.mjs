// Pre-builds the `/menu` server renderer as one self-contained ESM file: React, react-dom/server,
// lucide-react and the guest UI are bundled inside it. Netlify keeps packages of a function external and
// links their imports when the function loads; loading this file at request time instead lets
// `barbar-menu-page` catch and log a renderer failure and still answer with the built `menu.html`.
// `mongodb` stays external: the function already ships it (shared with `/api/menu`).
import { build } from 'esbuild';
import { statSync } from 'node:fs';

const outfile = 'netlify/generated/guest-menu-renderer.mjs';
await build({
  entryPoints: ['netlify/lib/guest-menu-page.tsx'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  jsx: 'automatic',
  external: ['mongodb'],
  define: { 'process.env.NODE_ENV': '"production"' },
  // CommonJS packages inside the bundle may `require` Node built-ins.
  banner: {
    js: "import { createRequire as __barbarRequire } from 'node:module'; const require = __barbarRequire(import.meta.url);",
  },
  legalComments: 'none',
  logLevel: 'warning',
});
console.log(`${outfile}: ${(statSync(outfile).size / 1024).toFixed(1)} kB`);
