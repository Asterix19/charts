// The Lab (home page of the React and Angular demos): every capability is a visible control, drawn from the shared schema.
// This spec is driven from that same schema, so a new control is covered the moment it is added, and a ChartProps field
// without a control already fails the unit test in examples/shared.
import { expect, test, type Page } from '@playwright/test';
import { LAB_CAPABILITIES } from '../chart-engine/src/lab';
import { DEMO_PACKAGES } from '../examples/shared/src/demoPackages';

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && list.push(m.text()));
  await page.goto('/');
  await page.getByTestId('lab').waitFor();
  await page.locator('.lab-chart canvas').first().waitFor();
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'console / page errors').toEqual([]);
});

const demo = () => (test.info().project.name.startsWith('angular') ? DEMO_PACKAGES.angular : DEMO_PACKAGES.react);
const id = (page: Page, x: string) => page.getByTestId(`lab-${x}`);
const sw = (page: Page, x: string) => page.getByTestId(`lab-${x}-switch`);
const isOn = async (page: Page, x: string) => (await sw(page, x).getAttribute('aria-checked')) === 'true';
const setBool = async (page: Page, x: string, on: boolean) => {
  if ((await isOn(page, x)) !== on) await sw(page, x).click();
  await expect(sw(page, x)).toHaveAttribute('aria-checked', String(on)); // zoneless frameworks render on the next tick
};
const canvases = (page: Page) => page.locator('.lab-chart canvas').count();
const stage = (page: Page) => page.locator('.lab-chart').screenshot();
const candles = async (page: Page) => Number((await page.getByTestId('candle-count').textContent())!.match(/([\d,]+) candles/)![1].replace(/,/g, ''));

test('the page says which package it demonstrates, with its version and the renderer', async ({ page }) => {
  const banner = page.getByTestId('package-banner');
  await expect(banner).toContainText(demo().pkg);
  await expect(banner).toContainText(/v\d+\.\d+\.\d+/);
  await expect(banner).toContainText(demo().renderer);
  await expect(banner).toContainText('engine v');
  await expect(banner).toBeVisible();
});

test('every capability that is always shown has a control on the page', async ({ page }) => {
  for (const cap of LAB_CAPABILITIES.filter((c) => !c.needs)) {
    await expect(id(page, cap.id), `control for ${cap.id}`).toBeVisible();
  }
});

test('dependent controls appear only with their feature (periods, custom colours)', async ({ page }) => {
  await expect(id(page, 'smaPeriod')).toHaveCount(0);
  await setBool(page, 'sma', true);
  await expect(id(page, 'smaPeriod')).toBeVisible();
  await expect(id(page, 'cBackground')).toHaveCount(0);
  await page.getByTestId('lab-theme-custom').click();
  await expect(id(page, 'cBackground')).toBeVisible();
});

test.describe('every control changes what is drawn (or the state it reports)', () => {
  for (const cap of LAB_CAPABILITIES) {
    if (cap.control.kind === 'enum') {
      for (const o of cap.control.options) {
        test(`${cap.label} = ${o.label}`, async ({ page }) => {
          await page.getByTestId(`lab-${cap.id}-${o.value}`).click();
          await expect(page.getByTestId(`lab-${cap.id}-${o.value}`)).toHaveAttribute('aria-pressed', 'true');
          if (cap.id === 'empty') return;
          // Whatever the option, the chart stays on screen (a 50k-candle dataset or a tiny box included).
          await expect(page.locator('.lab-chart canvas').first()).toBeVisible({ timeout: 15000 });
        });
      }
    } else if (cap.control.kind === 'bool') {
      test(`${cap.label} toggles on and off`, async ({ page }) => {
        const start = await isOn(page, cap.id);
        await sw(page, cap.id).click();
        await expect(sw(page, cap.id)).toHaveAttribute('aria-checked', String(!start));
        await sw(page, cap.id).click();
        await expect(sw(page, cap.id)).toHaveAttribute('aria-checked', String(start));
        if (cap.id !== 'empty') await expect(page.locator('.lab-chart canvas').first()).toBeVisible();
      });
    }
  }
});

test('panels add and remove canvases: RSI, MACD, volume, custom', async ({ page }) => {
  const base = await canvases(page);
  for (const x of ['rsi', 'macd', 'volume', 'customPanel']) {
    await setBool(page, x, true);
    await expect.poll(() => canvases(page), { message: `${x} on` }).toBe(base + 1);
    await setBool(page, x, false);
    await expect.poll(() => canvases(page), { message: `${x} off` }).toBe(base);
  }
});

test('overlays, markers, theme, chart type, grid, 12-hour clock and zoom all repaint', async ({ page }) => {
  const changes: [string, () => Promise<void>][] = [
    ['SMA', () => setBool(page, 'sma', true)],
    ['EMA', () => setBool(page, 'ema', true)],
    ['Bollinger + shaded area', () => setBool(page, 'bb', true)],
    ['VWAP', () => setBool(page, 'vwap', true)],
    ['markers', () => setBool(page, 'markers', true)],
    ['light theme', () => page.getByTestId('lab-theme-light').click()],
    ['line chart', () => page.getByTestId('lab-chartType-line').click()],
    ['grid off', () => setBool(page, 'grid', false)],
    ['12-hour clock', () => setBool(page, 'hour12', true)],
    ['zoom 240', () => page.getByTestId('lab-zoom-240').click()],
  ];
  let previous = await stage(page);
  for (const [name, change] of changes) {
    await change();
    await expect.poll(async () => !(await stage(page)).equals(previous), { message: `${name} should repaint` }).toBe(true);
    previous = await stage(page);
  }
});

test('a custom theme repaints with each colour you pick', async ({ page }) => {
  await page.getByTestId('lab-theme-custom').click();
  let previous = await stage(page);
  for (const [x, colour] of [['cBackground', '#0d3b2e'], ['cUp', '#22d3ee'], ['cDown', '#facc15']]) {
    await page.getByTestId(`lab-${x}-${colour}`).click();
    await expect.poll(async () => !(await stage(page)).equals(previous), { message: `${x} should repaint` }).toBe(true);
    previous = await stage(page);
  }
});

test('HUD on shows the crosshair readout and fires crosshair events; HUD off does not', async ({ page }) => {
  await setBool(page, 'hud', true);
  const box = (await page.locator('.lab-chart canvas').first().boundingBox())!;
  await expect(page.getByTestId('readout')).toContainText('Hover the chart');
  await page.mouse.move(box.x + box.width * 0.5, box.y + 100);
  await expect(page.getByTestId('readout')).toContainText(/ O \d.* C \d/);
  await expect(page.getByTestId('candle-count')).toContainText(/[1-9]\d* crosshair events/);
  await page.mouse.move(box.x - 60, box.y - 60);
  await expect(page.getByTestId('readout')).toContainText('Hover the chart');
  await setBool(page, 'hud', false);
  await page.mouse.move(box.x + box.width * 0.5, box.y + 100);
  await expect(page.getByTestId('readout')).toContainText('Hover the chart');
});

test('drag-pan, wheel-zoom and hover work over the main chart AND over every sub-panel', async ({ page }) => {
  for (const x of ['rsi', 'macd', 'volume', 'customPanel']) await setBool(page, x, true);
  await setBool(page, 'hud', true);
  await page.getByTestId('lab-zoom-40').click();
  const n = await canvases(page);
  expect(n).toBe(5);
  for (let i = 0; i < n; i++) {
    const target = page.locator('.lab-chart canvas').nth(i);
    const box = (await target.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + Math.min(box.height / 2, 30);
    const before = await stage(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 160, cy, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => !(await stage(page)).equals(before), { message: `drag-pan over canvas #${i}` }).toBe(true);
    const panned = await stage(page);
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -500);
    await expect.poll(async () => !(await stage(page)).equals(panned), { message: `wheel-zoom over canvas #${i}` }).toBe(true);
    await page.getByTestId('lab-now').click();
    await page.getByTestId('lab-zoom-40').click();
  }
});

test('stress: +5K adds 5,000 candles, 50k candles still draws, and the live feed keeps moving at 100 ms', async ({ page }) => {
  const n0 = await candles(page);
  await id(page, 'bulk').click();
  await expect.poll(() => candles(page)).toBe(n0 + 5000);
  await page.getByTestId('lab-count-50000').click();
  await expect.poll(() => candles(page), { timeout: 15000 }).toBe(50000);
  await expect(page.locator('.lab-chart canvas').first()).toBeVisible();
  await page.getByTestId('lab-count-500').click();
  await page.getByTestId('lab-live-100').click();
  const before = await stage(page);
  await expect.poll(async () => !(await stage(page)).equals(before), { timeout: 8000, message: 'live feed repaints' }).toBe(true);
  await page.getByTestId('lab-live-off').click();
});

test('dirty feed (NaN, duplicates, out-of-order) still draws; no data shows the placeholder and no canvases', async ({ page }) => {
  await setBool(page, 'dirty', true);
  await expect(page.locator('.lab-chart canvas').first()).toBeVisible();
  const painted = await page.locator('.lab-chart canvas').first().evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) k++; return k;
  });
  expect(painted).toBeGreaterThan(1000);
  await setBool(page, 'dirty', false);
  await setBool(page, 'empty', true);
  await expect.poll(() => canvases(page)).toBe(0);
  await expect(page.locator('.lab-chart')).toContainText(/no data/i);
  await setBool(page, 'empty', false);
  await expect.poll(() => canvases(page)).toBeGreaterThan(0);
});

test('Reset everything restores the defaults', async ({ page }) => {
  await setBool(page, 'rsi', true);
  await page.getByTestId('lab-theme-light').click();
  await id(page, 'reset').click();
  await expect(sw(page, 'rsi')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('lab-theme-dark')).toHaveAttribute('aria-pressed', 'true');
});

test('the scenarios page is one click away and keeps the same package banner', async ({ page }) => {
  await page.getByTestId('nav-scenarios').click();
  await expect(page.getByTestId('package-banner')).toContainText(demo().pkg);
  await page.locator('canvas').first().waitFor();
  await page.getByTestId('nav-lab').click();
  await page.getByTestId('lab').waitFor();
});
