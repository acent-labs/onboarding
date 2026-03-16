import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'VITE_API_BASE_URL=https://acent-api.fly.dev/api VITE_E2E_AUTO_LOGIN=true VITE_E2E_TEST_USER_EMAIL=playwright@wedosoft.net VITE_E2E_TEST_USER_NAME="Playwright Reviewer" npm run dev -- --host 127.0.0.1 --port 4173',
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
