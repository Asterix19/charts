import { defineConfig, devices } from '@playwright/test';

// E2E runs against the real demo apps (Vite) in real Chromium — React (chart-web), Angular
// (chart-angular) and vanilla JS (chart-canvas) — exercising the *built* packages exactly as a
// consumer would. Every demo serves the same scenario catalogue at /#/scenarios/<id>.
const DEMOS = [
  { name: 'react-web', workspace: 'web-demo', port: 5199, legacySpec: /web-chart\.spec\.ts/ },
  { name: 'angular', workspace: 'angular-demo', port: 5200, legacySpec: /angular-chart\.spec\.ts/ },
  { name: 'vanilla', workspace: 'canvas-demo', port: 5202, legacySpec: null },
] as const;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Perf measurements need a quiet machine; scenario suites run with fewer workers than correctness suites.
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    // Renderer regression oracle vs the published chart-web (no demo server needed).
    { name: 'oracle', testMatch: /oracle-web\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    ...DEMOS.flatMap((d) => [
    ...(d.legacySpec ? [{ name: d.name, testMatch: d.legacySpec, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${d.port}` } }] : []),
    { name: `${d.name}-scenarios`, testMatch: /scenarios\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${d.port}` } },
  ]),
  ],
  webServer: DEMOS.map((d) => ({
    command: `npm run dev --workspace=${d.workspace} -- --port ${d.port} --strictPort`,
    url: `http://localhost:${d.port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  })),
});
