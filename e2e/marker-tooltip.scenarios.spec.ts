import { expect, test } from '@playwright/test';
import { scenarioHash } from '@stacklatte/chart-examples';
import type { MarkerPoint } from '@stacklatte/chart-engine';

/**
 * Real-browser check of the marker tooltip. The vanilla demo exposes its ChartController as `window.__SL_CHART__`
 * so the test can ask where a marker is instead of re-deriving the layout.
 */
test.beforeEach(({}, info) => {
  test.skip(!info.project.name.startsWith('vanilla'), 'only the vanilla demo exposes its controller');
});

const markers = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __SL_CHART__: { getVisibleMarkers(): MarkerPoint[] } }).__SL_CHART__.getVisibleMarkers());

test('hovering a trade marker shows its tooltip; moving away hides it', async ({ page }) => {
  await page.goto('/');
  await page.goto(`/${scenarioHash('markers')}`);
  await page.getByTestId('chart-host').locator('canvas').first().waitFor();
  await expect.poll(async () => (await markers(page)).length).toBeGreaterThan(0);

  const [m] = await markers(page);
  const box = (await page.getByTestId('chart-host').locator('canvas').first().boundingBox())!;
  await page.mouse.move(box.x + m.x, box.y + m.y);

  const tip = page.locator('[data-sl-layer="marker-tooltip"]');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(m.label ?? '');
  await expect(tip).toContainText('Price');

  await page.mouse.move(box.x + 4, box.y + box.height - 4);
  await expect(tip).toHaveCount(0);
});

test('markers supplied out of order (one off-screen) are all drawn', async ({ page }) => {
  await page.goto('/');
  await page.goto(`/${scenarioHash('edge-unsorted-markers')}`);
  await page.getByTestId('chart-host').locator('canvas').first().waitFor();
  await expect.poll(async () => (await markers(page)).length).toBe(6);
});
