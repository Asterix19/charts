#!/usr/bin/env node
/**
 * Regenerates docs/images/*.png from the seeded scenario catalogue, so the pictures in the guides always show the real
 * charts. Web shots come from the React and Angular demos (Playwright); iOS shots are cropped from the newest native
 * comparison run (`npm run test:native:compat` keeps them in e2e-native/.compare).
 *   node scripts/capture-screenshots.mjs [--web] [--native]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'images');
mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
const want = (k) => only.length === 0 || only.includes(`--${k}`);

const WEB = [
  { id: 'indicators', file: 'indicators' },
  { id: 'bollinger', file: 'bollinger' },
  { id: 'all-panels', file: 'panels' },
  { id: 'markers', file: 'markers' },
  { id: 'theme-light', file: 'light-theme' },
  { id: 'hud', file: 'hud-crosshair', hover: true },
];
const DEMOS = [
  { name: 'react', workspace: 'react-demo', port: 5199 },
  { name: 'angular', workspace: 'angular-demo', port: 5200 },
];

async function web() {
  const browser = await chromium.launch();
  for (const d of DEMOS) {
    const server = spawn('npm', ['run', 'dev', `--workspace=${d.workspace}`, '--', '--port', String(d.port), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
    try {
      const url = `http://localhost:${d.port}`;
      for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
      const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
      for (const s of WEB) {
        await page.goto(`${url}/#/scenarios/${s.id}`);
        const host = page.getByTestId('chart-host');
        await host.locator('canvas').first().waitFor();
        await page.waitForTimeout(600);
        if (s.hover) {
          const b = await host.boundingBox();
          await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.4);
          await page.waitForTimeout(300);
        }
        await host.screenshot({ path: join(out, `${d.name}-${s.file}.png`) });
        console.log(`${d.name}-${s.file}.png`);
      }
      await page.close();
    } finally { try { process.kill(-server.pid); } catch {} }
  }
  await browser.close();
}

function native() {
  const base = join(root, 'e2e-native', '.compare', 'native');
  if (!existsSync(base)) { console.warn('no native run found — run `npm run test:native:compat` first; skipping iOS shots'); return; }
  const run = readdirSync(base).sort().at(-1);
  const shots = join(base, run, 'scenarios-clean', 'takeScreenshot');
  // The chart card on a 1206x2622 iPhone screenshot (below the scenario header, above the empty area).
  const crops = { 'scenario-basic': 'ios-basic', 'scenario-indicators': 'ios-indicators', 'scenario-theme-light': 'ios-light-theme' };
  for (const [src, name] of Object.entries(crops)) {
    const f = join(shots, `${src}.png`);
    if (!existsSync(f)) continue;
    const png = PNG.sync.read(readFileSync(f));
    // Start below the "Now" button, stop above the tab bar, then drop the empty app background under the chart card.
    const x = 40, y = 590, w = png.width - 80;
    const bottom = png.height - 280;
    const at = (px, py) => (py * png.width + px) * 4;
    const bg = [png.data[at(4, bottom - 4)], png.data[at(4, bottom - 4) + 1], png.data[at(4, bottom - 4) + 2]];
    let end = bottom;
    const emptyRow = (py) => { for (let px = x; px < x + w; px += 3) { const i = at(px, py); if (png.data[i] !== bg[0] || png.data[i + 1] !== bg[1] || png.data[i + 2] !== bg[2]) return false; } return true; };
    while (end > y + 100 && emptyRow(end - 1)) end--;
    const h = end - y + 10;
    const crop = new PNG({ width: w, height: h });
    PNG.bitblt(png, crop, x, y, w, h, 0, 0);
    writeFileSync(join(out, `${name}.png`), PNG.sync.write(crop));
    console.log(`${name}.png`);
  }
}

if (want('web')) await web();
if (want('native')) native();
