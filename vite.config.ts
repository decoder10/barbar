import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { localApi } from './server/local-api';
export default defineConfig({
  plugins: [react(), localApi()],
  server: { port: 4001, strictPort: true },
  test: { include: ['src/**/*.test.ts', 'netlify/**/*.test.ts'] },
});
