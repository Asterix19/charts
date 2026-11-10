import { defineConfig, devices } from '@playwright/test';

// E2E runs against the real demo apps (Vite) in real Chromium — React (chart-web) and
// Angular (chart-angular) — exercising the *built* packages exactly as a consumer would.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'react-web', testMatch: /web-chart\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5199' } },
    { name: 'angular', testMatch: /angular-chart\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5200' } },
  ],
  webServer: [
    {
      command: 'npm run dev --workspace=web-demo -- --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev --workspace=angular-demo -- --port 5200 --strictPort',
      url: 'http://localhost:5200',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
