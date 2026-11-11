import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCENARIOS } from '@stacklatte/chart-examples';

/**
 * The OHLC + indicator HUD must read the same on every renderer. This renders a scenario with the React `SLChart`
 * and with the `ChartController` from `@stacklatte/chart-engine/canvas` (which `<sl-chart>` wraps), hovers the same spot, and compares the
 * HUD text — live, and while inspecting a candle. (The HUD is the only DOM text on the page: axis labels are canvas.)
 */
const root = process.cwd();
const out = join(root, 'compat', '.cache', 'oracle');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const esbuild = require('esbuild') as typeof import('esbuild');

async function bundle(entry: string, name: string, alias: Record<string, string>) {
  await esbuild.build({
    entryPoints: [join(root, 'e2e', 'oracle', entry)], outfile: join(out, name), bundle: true, format: 'iife', platform: 'browser',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, alias, absWorkingDir: root, logLevel: 'silent', nodePaths: [join(root, 'node_modules')],
  });
  return join(out, name);
}

let react: string;
let controller: string;
test.beforeAll(async () => {
  react = await bundle('entry.tsx', 'hud-react.js', { '@stacklatte/chart-web': join(root, 'chart-web', 'dist', 'index.mjs') });
  controller = await bundle('controller-entry.ts', 'hud-controller.js', {});
});

async function hudText(page: Page, script: string, props: Record<string, unknown>, hover: boolean) {
  await page.setContent('<!doctype html><html><body style="margin:0"><div id="root" style="position:relative"></div></body></html>');
  await page.addScriptTag({ path: script });
  await page.evaluate((p) => window.renderChart(p), props);
  await page.waitForTimeout(150);
  if (hover) {
    const box = (await page.locator('canvas').first().boundingBox())!;
    await page.mouse.move(box.x + 300, box.y + 120);
    await page.waitForTimeout(150);
  }
  return page.locator('#root').innerText().then((t) => t.replace(/\s+/g, ' ').trim());
}

declare global {
  interface Window {
    renderChart(props: Record<string, unknown>): void;
  }
}

for (const id of ['hud', 'indicators', 'config-pipeline', 'custom-panel', 'all-panels', 'markers']) {
  const s = SCENARIOS.find((x) => x.id === id)!;
  for (const hover of [false, true]) {
    test(`${id} ${hover ? 'while inspecting a candle' : 'live'}: React HUD text === Angular/ChartController HUD text`, async ({ browser }) => {
      const data = s.data();
      const props = { data, width: 640, height: s.height, ...s.props(data), showOhlcHud: true };
      const ctx = await browser.newContext({ viewport: { width: 720, height: 900 } });
      const a = await ctx.newPage();
      const b = await ctx.newPage();
      const fromReact = await hudText(a, react, props, hover);
      const fromController = await hudText(b, controller, props, hover);
      await ctx.close();
      expect(fromController.length, 'the HUD rendered something').toBeGreaterThan(20);
      expect(fromController).toBe(fromReact);
      // and it is the FULL HUD: change %, OHLC, indicator rows
      expect(fromController).toMatch(/[+-]\d+\.\d\d%/);
      expect(fromController).toContain(hover ? ':' : 'LIVE');
    });
  }
}
