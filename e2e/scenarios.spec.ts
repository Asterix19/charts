import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { SCENARIOS, expectedCanvasCount, scenarioHash, type Scenario } from '@stacklatte/chart-examples';

/**
 * The same suite runs against every web demo (React, Angular, vanilla JS). Each scenario in the shared
 * catalogue is loaded, inspected, driven with real input and — for stress / live scenarios — measured.
 */

const emptyHasCanvas = (info: TestInfo) => !info.project.name.startsWith('react');

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && list.push(`console: ${m.text()}`));
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'no page or console errors').toEqual([]);
});

const open = async (page: Page, s: Scenario) => {
  await page.goto('/');
  await page.goto(`/${scenarioHash(s.id)}`);
  await expect(page.getByTestId('title')).toHaveText(s.title);
  await expect(page.getByTestId('stats')).toHaveAttribute('data-scenario', s.id);
  if (s.candles > 0 || s.kind === 'edge') await page.getByTestId('chart-host').locator('canvas, div').first().waitFor();
};

const canvasHash = (page: Page, index = 0) =>
  page.evaluate((i) => {
    const c = document.querySelectorAll('[data-testid="chart-host"] canvas')[i] as HTMLCanvasElement;
    const url = c.toDataURL();
    let h = 0;
    for (let k = 0; k < url.length; k += 7) h = (Math.imul(31, h) + url.charCodeAt(k)) | 0;
    return h;
  }, index);

const paintedPixels = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="chart-host"] canvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 17) if (d[i] !== 0) n++;
    return n;
  });

const results: Record<string, unknown> = {};
const saveResults = (info: TestInfo) => {
  const dir = join(process.cwd(), 'e2e', 'perf-results');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${info.project.name}.json`);
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  writeFileSync(file, JSON.stringify({ ...prev, ...results }, null, 2));
};

for (const s of SCENARIOS) {
  test.describe(`scenario ${s.id}`, () => {
    test('renders the expected canvases with painted content', async ({ page }, info) => {
      await open(page, s);
      const expected = expectedCanvasCount(s, { emptyHasCanvas: emptyHasCanvas(info) });
      await expect(page.getByTestId('chart-host').locator('canvas')).toHaveCount(expected);
      if (!s.live) await expect(page.getByTestId('stats')).toHaveAttribute('data-candles', String(s.data().length));
      // Renderers draw on the next animation frame, so the canvas can exist a frame before it is painted.
      if (s.data().length > 0) await expect.poll(() => paintedPixels(page)).toBeGreaterThan(20);
    });

    if (s.data().length >= 20) {
      test('responds to drag-pan and wheel-zoom', async ({ page }) => {
        test.skip(!!s.live, 'live scenarios repaint on their own, so a pixel diff would prove nothing');
        await open(page, s);
        const box = (await page.getByTestId('chart-host').locator('canvas').first().boundingBox())!;
        const cx = box.x + box.width / 2;
        const cy = box.y + Math.min(box.height / 2, 120);
        const before = await canvasHash(page);
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 180, cy, { steps: 8 });
        await page.mouse.up();
        await expect.poll(() => canvasHash(page)).not.toBe(before);
        const panned = await canvasHash(page);
        await page.mouse.wheel(0, -500);
        await expect.poll(() => canvasHash(page)).not.toBe(panned);
      });
    }

    if (s.budget) {
      test(`stays within its performance budget (mount < ${s.budget.mountMs} ms, p95 frame < ${s.budget.frameMs} ms)`, async ({ page }, info) => {
        await open(page, s);
        const mountOf = async () => Number(await page.getByTestId('stats').getAttribute('data-mount-ms'));
        await expect.poll(mountOf, { message: 'mount time is reported once the first frame is painted' }).toBeGreaterThan(0);
        const mountMs = await mountOf();
        const box = (await page.getByTestId('chart-host').locator('canvas').first().boundingBox())!;
        const cx = box.x + box.width / 2;
        const cy = box.y + Math.min(box.height / 2, 100);

        await page.evaluate(() => window.__SL__!.probe.start());
        // A realistic burst of input: repeated drags and wheel zooms while the scenario (and its feed) runs.
        for (let sweep = 0; sweep < 3; sweep++) {
          await page.mouse.move(cx, cy);
          await page.mouse.down();
          await page.mouse.move(cx + 220, cy, { steps: 24 });
          await page.mouse.move(cx - 220, cy, { steps: 24 });
          await page.mouse.up();
          for (let i = 0; i < 12; i++) await page.mouse.wheel(0, i % 2 ? 120 : -120);
        }
        const stats = await page.evaluate(() => window.__SL__!.probe.stop());

        results[s.id] = { candles: s.candles, mountMs: Math.round(mountMs), fps: Math.round(stats.fps), p50: +stats.p50.toFixed(1), p95: +stats.p95.toFixed(1), max: +stats.max.toFixed(1), long: stats.long, frames: stats.frames };
        saveResults(info);
        await info.attach('perf', { body: JSON.stringify(results[s.id], null, 2), contentType: 'application/json' });

        expect(mountMs, 'mount time').toBeLessThan(s.budget!.mountMs);
        expect(stats.frames, 'the page kept producing frames').toBeGreaterThan(10);
        expect(stats.p95, 'p95 frame time').toBeLessThan(s.budget!.frameMs);
      });
    }

    if (s.live) {
      test('keeps ticking and growing/mutating the series', async ({ page }) => {
        await open(page, s);
        const ticks = () => page.getByTestId('stats').getAttribute('data-ticks').then(Number);
        const first = await ticks();
        await expect.poll(ticks, { timeout: s.live!.tickMs * 8 + 2_000 }).toBeGreaterThanOrEqual(first + 3);
        const before = await canvasHash(page);
        await expect.poll(() => canvasHash(page), { timeout: s.live!.tickMs * 6 + 2_000 }).not.toBe(before);
      });
    }
  });
}
