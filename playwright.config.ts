import { loadEnv } from 'vite';
import { defineConfig, devices } from '@playwright/test';
Object.assign(process.env, loadEnv('development', process.cwd(), 'BARBAR_'));
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4001',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
  ],
});
