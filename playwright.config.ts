import { defineConfig, devices } from '@playwright/test';

// E2E runs against the real web-demo (Vite) in real Chromium — it exercises the
// built-from-source chart-web + chart-engine packages exactly as a consumer would.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev --workspace=web-demo -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
