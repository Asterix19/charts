import { expect, test, type Page } from '@playwright/test';

const hash = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    const url = c.toDataURL();
    let h = 0;
    for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
    return h;
  });

const painted = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
    return n;
  });

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
  page.on('console', (m) => m.type() === 'error' && list.push(m.text()));
  await page.goto('/');
  await page.locator('sl-chart canvas').first().waitFor();
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('<sl-chart> renders a painted canvas that fills the playground area', async ({ page }) => {
  const box = (await page.locator('sl-chart canvas').first().boundingBox())!;
  const wrap = (await page.locator('.chartWrap').boundingBox())!;
  expect(Math.round(box.width)).toBe(Math.round(wrap.width));
  expect(Math.round(box.height)).toBeGreaterThan(300);
  expect(await painted(page)).toBeGreaterThan(1000);
});

test('panel inputs add and remove canvases', async ({ page }) => {
  const count = () => page.locator('sl-chart canvas').count();
  const base = await count();
  for (const id of ['rsi', 'volume', 'macd']) {
    await page.locator(`#${id}`).click();
    await expect.poll(count).toBe(base + 1);
    await page.locator(`#${id}`).click();
    await expect.poll(count).toBe(base);
  }
});

test('theme input repaints the chart', async ({ page }) => {
  const before = await hash(page);
  await page.locator('#light').click();
  await expect.poll(() => hash(page)).not.toBe(before);
});

test('hover drives the (crosshairChange) output and the built-in HUD, and releases on leave', async ({ page }) => {
  const box = (await page.locator('sl-chart canvas').first().boundingBox())!;
  await expect(page.locator('#readout')).toContainText('Hover the chart');
  await expect(page.locator('[data-sl-layer="ohlc-hud"]')).toContainText('LIVE');

  await page.mouse.move(box.x + 300, box.y + 200);
  await expect(page.locator('#readout')).toContainText(/ · O \d.* · C \d/);
  await expect(page.locator('[data-sl-layer="ohlc-hud"]')).toContainText(/\d{1,2}:\d{2}/);

  await page.mouse.move(box.x - 40, box.y - 40);
  await expect(page.locator('#readout')).toContainText('Hover the chart');
  await expect(page.locator('[data-sl-layer="ohlc-hud"]')).toContainText('LIVE');
});

test('drag pans and wheel zooms the viewport', async ({ page }) => {
  const box = (await page.locator('sl-chart canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const start = await hash(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 200, cy, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => hash(page)).not.toBe(start);

  const panned = await hash(page);
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -500);
  await expect.poll(() => hash(page)).not.toBe(panned);
});

test('a new candle in [data] repaints the chart (live follow)', async ({ page }) => {
  const before = await hash(page);
  await page.locator('#append').click();
  await expect.poll(() => hash(page)).not.toBe(before);
});
