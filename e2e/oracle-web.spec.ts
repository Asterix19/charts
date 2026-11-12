import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCENARIOS } from '@stacklatte/chart-examples';

/**
 * Renderer regression oracle for people on the published @stacklatte/chart-web 1.x (now renamed @stacklatte/chart-react).
 *
 * Renders every scenario with the PUBLISHED chart-web 1.3.2 and with this workspace's chart-react, at the same size, and
 * compares what is actually drawn (every canvas pixel + the HUD / tooltip DOM). Anything that differs must be listed
 * in INTENTIONAL below with the reason — an unexplained difference is a regression.
 */
const root = process.cwd();
const cache = join(root, 'compat', '.cache');
const oldWeb = join(cache, 'chart-web-1.3.2', 'package', 'dist', 'index.mjs');
const oldCore = join(cache, 'chart-core-2.3.3', 'package', 'dist', 'core.mjs');
const out = join(cache, 'oracle');
/** Download the published packages on first use (the contract tests use the same cache). */
function ensurePublished(name: string, version: string) {
  const dir = join(cache, `${name}-${version}`);
  if (existsSync(join(dir, 'package', 'package.json'))) return;
  try {
    mkdirSync(dir, { recursive: true });
    execFileSync('npm', ['pack', `@stacklatte/${name}@${version}`, '--pack-destination', dir, '--silent'], { cwd: dir, stdio: 'pipe' });
    execFileSync('sh', ['-c', 'tar -xzf *.tgz'], { cwd: dir, stdio: 'pipe' });
  } catch {
    /* offline: the suite skips itself below */
  }
}
ensurePublished('chart-web', '1.3.2');
ensurePublished('chart-core', '2.3.3');
const hasPublished = existsSync(oldWeb) && existsSync(oldCore);

/** Scenarios whose output is EXPECTED to differ, and why. */
const INTENTIONAL: Record<string, string> = {
  'edge-dirty': 'NaN / Infinity / null candles are now dropped (the old chart went blank)',
  'edge-bad-period': 'a negative RSI period made the published chart throw (React unmounts it); it now yields an empty panel',
  'edge-unsorted-markers': 'markers supplied out of order are now sorted instead of silently dropped',
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const esbuild = require('esbuild') as typeof import('esbuild');

async function bundle(name: 'old' | 'new') {
  const alias: Record<string, string> =
    name === 'old'
      ? { '@stacklatte/chart-react': oldWeb, '@stacklatte/chart-core/core': oldCore } // the entry imports chart-react; point it at the published chart-web
      : { '@stacklatte/chart-react': join(root, 'chart-react', 'dist', 'index.mjs') };
  await esbuild.build({
    entryPoints: [join(root, 'e2e', 'oracle', 'entry.tsx')],
    outfile: join(out, `${name}.js`),
    bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    alias, absWorkingDir: root, logLevel: 'silent',
    nodePaths: [join(root, 'node_modules')],
  });
  return join(out, `${name}.js`);
}

let bundles: { old: string; new: string };
test.beforeAll(async () => {
  test.skip(!hasPublished, 'published packages not downloaded (run the contract tests once while online)');
  bundles = { old: await bundle('old'), new: await bundle('new') };
});

async function snapshot(page: Page, script: string, props: Record<string, unknown>, interact: boolean) {
  await page.setContent('<!doctype html><html><body style="margin:0"><div id="root"></div></body></html>');
  await page.addScriptTag({ path: script });
  await page.evaluate((p) => window.renderChart(p), props);
  if (interact && (await page.locator('canvas').count()) > 0) {
    const box = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(150);
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 140, box.y + 80, { steps: 8 });
    await page.mouse.up();
    await page.mouse.move(box.x - 50, box.y - 50);
  }
  await page.waitForTimeout(120); // let the (new) per-frame coalescing and any effects settle
  return page.evaluate(() => ({
    canvases: [...document.querySelectorAll('canvas')].map((c) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let h1 = 0, h2 = 0;
      for (let i = 0; i < d.length; i++) { h1 = (Math.imul(31, h1) + d[i]) | 0; h2 = (h2 ^ d[i]) + ((h2 << 5) | 0) | 0; }
      return { w: c.width, h: c.height, h1, h2 };
    }),
    dom: document.getElementById('root')!.innerText.replace(/\s+/g, ' ').trim(),
    crashed: (window as unknown as { __renderError?: string }).__renderError ?? null,
  }));
}

// Stress-50k is a perf scenario, not a rendering one; the 2k stress scenario covers large data.
const SCENARIOS_TO_COMPARE = SCENARIOS.filter((s) => s.id !== 'stress-extreme');

for (const s of SCENARIOS_TO_COMPARE) {
  for (const interact of [false, true]) {
    test(`${s.id}${interact ? ' after zoom + pan' : ''}: published 1.3.2 vs workspace`, async ({ browser }, info) => {
      test.skip(!hasPublished);
      const data = s.data();
      const props = { data, width: 640, height: s.height, ...s.props(data) };
      const ctx = await browser.newContext({ viewport: { width: 720, height: 900 } });
      const a = await ctx.newPage();
      const b = await ctx.newPage();
      const before = await snapshot(a, bundles.old, props, interact);
      const after = await snapshot(b, bundles.new, props, interact);
      await ctx.close();

      const same = JSON.stringify(before) === JSON.stringify(after);
      if (INTENTIONAL[s.id]) {
        info.annotations.push({ type: 'intentional', description: INTENTIONAL[s.id] });
        test.skip(same, 'expected to differ, but it is identical');
        expect(same, `expected to differ: ${INTENTIONAL[s.id]}`).toBe(false);
        return;
      }
      expect(after.canvases.length, 'same number of canvases').toBe(before.canvases.length);
      expect(after.dom, 'same HUD / DOM text').toBe(before.dom);
      expect(after.canvases, `${s.id}: canvas pixels differ from published chart-web 1.3.2`).toEqual(before.canvases);
    });
  }
}
