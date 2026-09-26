import { loadEnv } from 'vite';
import { defineConfig, devices } from '@playwright/test';
Object.assign(process.env, loadEnv('development', process.cwd(), 'BARBAR_'));
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  use: {
    // A separate dev server with a throwaway database keeps e2e traffic away from the owner's :4001.
    baseURL: process.env.BARBAR_E2E_BASE_URL || 'http://127.0.0.1:4001',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
});
