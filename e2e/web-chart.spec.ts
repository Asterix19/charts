import { expect, test, type Page } from '@playwright/test';

/** Hash of the first (main) canvas' pixels, so tests can assert "the chart repainted". */
const mainCanvasHash = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    const url = c.toDataURL();
    let h = 0;
    for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
    return h;
  });

const paintedPixels = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
    return n;
  });

const pill = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await page.locator('canvas').first().waitFor();
  // Turn off live ticks so pixel comparisons are deterministic.
  await pill(page, 'Off').click();
  test.info().annotations.push({ type: 'errors', description: 'asserted in afterEach' });
  (page as Page & { __errors: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { __errors: string[] }).__errors).toEqual([]);
});

test('renders a painted main canvas at a non-zero size', async ({ page }) => {
  const box = await page.locator('canvas').first().boundingBox();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(100);
  expect(await paintedPixels(page)).toBeGreaterThan(1000);
});

test('sub-panel toggles add and remove canvases', async ({ page }) => {
  const base = await page.locator('canvas').count();
  for (const label of ['RSI', 'MACD', 'Volume']) {
    await pill(page, label).click();
    await expect(page.locator('canvas')).toHaveCount(base + 1);
    await pill(page, label).click();
    await expect(page.locator('canvas')).toHaveCount(base);
  }
});

test('theme switch repaints the chart', async ({ page }) => {
  const dark = await mainCanvasHash(page);
  await pill(page, 'Light').click();
  await expect.poll(() => mainCanvasHash(page)).not.toBe(dark);
});

test('chart type switch repaints the chart', async ({ page }) => {
  const candle = await mainCanvasHash(page);
  await pill(page, 'Line').click();
  await expect.poll(() => mainCanvasHash(page)).not.toBe(candle);
});

test('indicator overlays repaint the chart', async ({ page }) => {
  const before = await mainCanvasHash(page);
  await pill(page, 'SMA').click();
  await expect.poll(() => mainCanvasHash(page)).not.toBe(before);
});

test('dragging pans the viewport', async ({ page }) => {
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const before = await mainCanvasHash(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => mainCanvasHash(page)).not.toBe(before);
});

test('mouse wheel zooms the viewport', async ({ page }) => {
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const before = await mainCanvasHash(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => mainCanvasHash(page)).not.toBe(before);
});

test('hovering draws a crosshair and leaving removes it', async ({ page }) => {
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const idle = await mainCanvasHash(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => mainCanvasHash(page)).not.toBe(idle);
  await page.mouse.move(box.x - 50, box.y - 50);
  await expect.poll(() => mainCanvasHash(page)).toBe(idle);
});

test('live ticks keep painting without errors', async ({ page }) => {
  await pill(page, '⚡').click();
  const a = await mainCanvasHash(page);
  await expect.poll(() => mainCanvasHash(page), { timeout: 5000 }).not.toBe(a);
});

test('events arriving faster than the display refresh repaint at most once per frame', async ({ page }) => {
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const { draws, frames } = await page.evaluate(async () => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const orig = ctx.clearRect.bind(ctx);
    let draws = 0;
    ctx.clearRect = (...a: Parameters<typeof orig>) => { draws++; return orig(...a); };

    let frames = 0;
    let running = true;
    const tick = () => { frames++; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);

    // 200 wheel events, each in its own task (like a high-polling-rate input device).
    const channel = new MessageChannel();
    let sent = 0;
    await new Promise<void>((resolve) => {
      channel.port1.onmessage = () => {
        c.dispatchEvent(new WheelEvent('wheel', { deltaY: sent % 2 ? 4 : -4, clientX: 400, clientY: 200, bubbles: true, cancelable: true }));
        if (++sent < 200) channel.port2.postMessage(0); else resolve();
      };
      channel.port2.postMessage(0);
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    running = false;
    return { draws, frames };
  });
  // Without per-frame coalescing this is ~200 draws; with it, bounded by frames elapsed.
  expect(draws).toBeLessThanOrEqual(frames + 1);
});
