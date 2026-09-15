import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { localApi } from './server/local-api';
export default defineConfig({
  plugins: [react(), localApi()],
  server: { port: 4001, strictPort: true },
  build: {
    // CSP allows same-origin fonts only; keep even small subsets as cacheable files.
    assetsInlineLimit: (filePath) => (/\.(?:woff2?|ttf|otf)$/i.test(filePath) ? false : undefined),
  },
  test: { include: ['src/**/*.test.ts', 'netlify/**/*.test.ts', 'server/**/*.test.ts'] },
});
