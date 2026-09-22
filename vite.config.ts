import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { localApi } from './server/local-api';
export default defineConfig({
  plugins: [react(), localApi()],
  // `npm run dev` opens the browser; CI and test runners set CI to keep the terminal quiet.
  server: { port: 4001, strictPort: true, open: !process.env.CI },
  build: {
    // The public guest menu (`/menu`) is its own page and never downloads the workspace bundle.
    rollupOptions: {
      input: { main: 'index.html', menu: 'menu.html' },
      output: {
        // React and the photo manifest change on different schedules: separate chunks keep a
        // photo edit from invalidating the cached framework, and both pages reuse the same files.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('photo-manifest.json')) return 'photo-manifest';
          return undefined;
        },
      },
    },
    // CSP allows same-origin fonts only; keep even small subsets as cacheable files.
    assetsInlineLimit: (filePath) => (/\.(?:woff2?|ttf|otf)$/i.test(filePath) ? false : undefined),
  },
  test: { include: ['src/**/*.test.ts', 'netlify/**/*.test.ts', 'server/**/*.test.ts'] },
});
