#!/usr/bin/env node
/**
 * Visual QA: drives every scenario (and the playground) in the React and Angular demos like a user would, records a
 * video of each, grabs key frames, and writes contact sheets + a report to qa-output/ that a human (or Claude) can inspect.
 *
 *   npm run qa                         all scenarios, both demos
 *   npm run qa -- --demo=angular       one demo
 *   npm run qa -- --only=hud,lab       selected scenarios (lab = the every-capability page)
 *   npm run qa -- --native             also build an overview sheet from the newest iOS simulator run
 *
 * Output (git-ignored): qa-output/report.md, qa-output/sheets/*.png, qa-output/videos/<demo>/*.webm
 * Automatic flags: console/page errors, blank chart, no canvas, hover/pan/zoom/live that change nothing, sideways overflow.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { DEMO_PACKAGES, LAB_CAPABILITIES, SCENARIOS } from '@stacklatte/chart-examples';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'qa-output');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const only = arg('only')?.split(',');
const DEMOS = [
  { name: 'react', workspace: 'react-demo', port: 5199 },
  { name: 'angular', workspace: 'angular-demo', port: 5200 },
].filter((d) => !arg('demo') || d.name === arg('demo'));
const VIEWPORT = { width: 1000, height: 760 };

rmSync(out, { recursive: true, force: true });
for (const d of ['sheets', ...DEMOS.map((x) => `videos/${x.name}`)]) mkdirSync(join(out, d), { recursive: true });

// ---------------------------------------------------------------- pixel helpers
const decode = (buf) => PNG.sync.read(buf);
function diffFraction(a, b) {
  const A = decode(a), B = decode(b);
  if (A.width !== B.width || A.height !== B.height) return 1;
  let n = 0;
  for (let i = 0; i < A.data.length; i += 16) if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) n++;
  return n / (A.data.length / 16);
}
function paintedFraction(buf) {
  const P = decode(buf);
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < P.data.length; i += 28) {
    const key = (P.data[i] << 16) | (P.data[i + 1] << 8) | P.data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total++;
  }
  return 1 - Math.max(...counts.values()) / total;
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ---------------------------------------------------------------- servers
const servers = [];
async function start(d) {
  const p = spawn('npm', ['run', 'dev', `--workspace=${d.workspace}`, '--', '--port', String(d.port), '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
  servers.push(p);
  const url = `http://localhost:${d.port}`;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return url; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${d.name} dev server did not start`);
}

// ---------------------------------------------------------------- contact sheet
async function sheet(browser, title, frames, file, cols = Math.min(frames.length, 5)) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  const cells = frames
    .map((f) => `<figure><img src="data:image/png;base64,${f.buf.toString('base64')}"><figcaption>${f.name}${f.note ? ` <b>${f.note}</b>` : ''}</figcaption></figure>`)
    .join('');
  await page.setContent(`<style>body{margin:0;padding:14px;background:#fff;font:12px system-ui;color:#111}h1{font-size:14px;margin:0 0 10px}
    .row{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;flex:0 0 calc(${100 / cols}% - 10px);min-width:0}img{width:100%;border:1px solid #bbb;display:block}figcaption{margin-top:4px}b{color:#b00}</style>
    <h1>${title}</h1><div class="row">${cells}</div>`);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

// ---------------------------------------------------------------- one scenario
async function runScenario(browser, d, url, sc) {
  const flags = [];
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: join(out, 'videos', d.name), size: VIEWPORT } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/#/scenarios/${sc.id}`);
  const host = page.getByTestId('chart-host');
  await host.waitFor({ timeout: 15000 });
  const expectsCanvas = !/empty/.test(sc.id);
  if (expectsCanvas) await host.locator('canvas').first().waitFor({ timeout: 15000 }).catch(() => flags.push('no canvas rendered'));
  await page.waitForTimeout(700);

  const shot = () => host.screenshot();
  const frames = [{ name: 'mount', buf: await shot() }];
  const raw = await host.boundingBox();
  // Interact inside the visible part of the chart: a tall multi-panel chart can extend below the viewport.
  const box = raw && (() => { const y = Math.max(raw.y, 0); const bottom = Math.min(raw.y + raw.height, VIEWPORT.height); return { x: raw.x, y, width: raw.width, height: Math.max(bottom - y, 50) }; })();
  const props = (() => { try { return sc.props(sc.data()); } catch { return {}; } })();
  const m = { canvases: await host.locator('canvas').count(), painted: paintedFraction(frames[0].buf) };

  if (expectsCanvas && m.painted < 0.01) flags.push(`chart looks blank (${pct(m.painted)} painted)`);
  if (expectsCanvas && m.canvases === 0) flags.push('no canvases');

  if (box && expectsCanvas) {
    // hover: the crosshair/HUD should appear when the scenario enables the HUD
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.35);
    await page.waitForTimeout(250);
    const hover = await shot();
    m.hover = diffFraction(frames[0].buf, hover);
    frames.push({ name: 'hover', buf: hover, note: pct(m.hover) });
    if (props.showOhlcHud && m.hover === 0) flags.push('hover changed nothing but the HUD is enabled');

    // pan
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.78, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const pan = await shot();
    m.pan = diffFraction(hover, pan);
    frames.push({ name: 'pan', buf: pan, note: pct(m.pan) });
    if (sc.candles > 30 && m.pan === 0) flags.push('drag-pan changed nothing');

    // zoom
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(250);
    const zoom = await shot();
    m.zoom = diffFraction(pan, zoom);
    frames.push({ name: 'wheel-zoom', buf: zoom, note: pct(m.zoom) });
    if (sc.candles > 30 && m.zoom === 0) flags.push('wheel-zoom changed nothing');

    // back to latest
    const now = page.getByTestId('now');
    if (await now.count()) {
      await now.click();
      await page.waitForTimeout(250);
      frames.push({ name: 'Now', buf: await shot() });
    }
  }
  if (sc.live) {
    const before = await shot();
    await page.waitForTimeout(Math.max(1500, sc.live.tickMs * 3));
    const after = await shot();
    m.live = diffFraction(before, after);
    frames.push({ name: `live +${Math.round(Math.max(1500, sc.live.tickMs * 3) / 100) / 10}s`, buf: after, note: pct(m.live) });
    if (m.live === 0) flags.push('live feed did not change the chart');
  }

  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) flags.push('sideways page overflow');
  if (errors.length) flags.push(`${errors.length} console/page error(s): ${[...new Set(errors)].slice(0, 2).join(' | ').slice(0, 160)}`);

  await sheet(browser, `${d.name} · ${sc.id} · ${sc.title} (${sc.kind}, ${sc.candles} candles)`, frames, join(out, 'sheets', `${d.name}-${sc.id}.png`));
  const video = page.video();
  await context.close();
  try { renameSync(await video.path(), join(out, 'videos', d.name, `${sc.id}.webm`)); } catch { /* video optional */ }
  return { demo: d.name, id: sc.id, kind: sc.kind, ...m, flags };
}

// ---------------------------------------------------------------- the Lab: every capability, driven from the shared schema
// Controls whose effect is legitimately invisible in a static frame at the rich baseline.
const MAY_LOOK_THE_SAME = new Set(['maxZoom', 'now', 'interval', 'reset', 'dirty', 'live', 'withVolume']);

async function runLab(browser, d, url) {
  const flags = [];
  const size = { width: 1280, height: 860 };
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: join(out, 'videos', d.name), size } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${url}/`);
  await page.getByTestId('lab').waitFor({ timeout: 15000 });
  await page.locator('canvas').first().waitFor({ timeout: 15000 });

  // The page must say which package it demonstrates.
  const expected = DEMO_PACKAGES[d.name];
  const banner = (await page.getByTestId('package-banner').textContent()) ?? '';
  if (!banner.includes(expected.pkg)) flags.push(`banner does not name ${expected.pkg}`);
  if (!/v\d+\.\d+\.\d+/.test(banner)) flags.push('banner shows no version');

  const stage = page.locator('.lab-stage');
  const id = (x) => page.getByTestId(`lab-${x}`);
  const isOn = async (x) => (await page.getByTestId(`lab-${x}-switch`).getAttribute('aria-checked')) === 'true';
  const setBool = async (x, on) => { if ((await isOn(x)) !== on) await page.getByTestId(`lab-${x}-switch`).click(); };
  const settle = (ms = 300) => page.waitForTimeout(ms);
  const shot = async () => { await settle(); return stage.screenshot(); };

  // Rich baseline so a control that toggles something off is as visible as one that toggles something on.
  await id('reset').click();
  for (const x of ['sma', 'ema', 'bb', 'vwap', 'rsi', 'macd', 'volume', 'markers', 'customPanel']) await setBool(x, true);
  const baseline = await shot();
  const steps = [{ name: 'baseline (everything on)', buf: baseline }];
  const results = [];
  const record = async (name, change, restore, { expectChange = true, extra } = {}) => {
    await change();
    const buf = await shot();
    const diff = diffFraction(baseline, buf);
    const note = pct(diff);
    steps.push({ name, buf, note });
    results.push({ name, diff });
    if (expectChange && diff === 0) flags.push(`${name}: no visible change`);
    if (extra) await extra(diff);
    await restore();
    await settle(150);
  };

  for (const cap of LAB_CAPABILITIES) {
    const c = cap.control;
    const mayBeSame = MAY_LOOK_THE_SAME.has(cap.id);
    if (cap.id === 'reset') continue;
    if (c.kind === 'bool') {
      const was = await isOn(cap.id);
      await record(`${cap.label}: ${was ? 'off' : 'on'}`, () => setBool(cap.id, !was), () => setBool(cap.id, was), { expectChange: !mayBeSame });
    } else if (c.kind === 'enum') {
      const current = await page.locator(`[data-testid^="lab-${cap.id}-"][aria-pressed="true"]`).first().getAttribute('data-testid');
      for (const o of c.options) {
        const tid = `lab-${cap.id}-${o.value}`;
        if (current === tid) continue;
        await record(`${cap.label} = ${o.label}`, () => page.getByTestId(tid).click(), () => (current ? page.getByTestId(current).click() : Promise.resolve()), { expectChange: !mayBeSame });
      }
    } else if (c.kind === 'number') {
      const needsOn = { smaPeriod: 'sma', emaPeriod: 'ema', bbPeriod: 'bb', bbMult: 'bb', rsiPeriod: 'rsi' }[cap.id];
      if (needsOn && !(await isOn(needsOn))) continue;
      const range = page.getByTestId(`lab-${cap.id}-range`);
      const original = await range.inputValue();
      await record(`${cap.label} = ${c.max}`, () => range.fill(String(c.max)), () => range.fill(original));
    } else if (c.kind === 'color') {
      if (cap.id === 'cBackground') await page.getByTestId('lab-theme-custom').click();
      if (await page.getByTestId(`lab-${cap.id}-#22d3ee`).count()) await record(`${cap.label} = cyan`, () => page.getByTestId(`lab-${cap.id}-#22d3ee`).click(), async () => {});
      if (cap.id === 'cCrosshair') await page.getByTestId('lab-theme-dark').click();
    } else if (c.kind === 'action') {
      if (cap.id === 'bulk') {
        const n0 = Number((await page.getByTestId('candle-count').textContent()).replace(/\D/g, '').slice(0, 7));
        await record('+5K candles', () => id('bulk').click(), async () => {}, { expectChange: false });
        const n1 = Number((await page.getByTestId('candle-count').textContent()).replace(/\D/g, '').slice(0, 7));
        if (!(n1 > n0)) flags.push(`+5K did not add candles (${n0} → ${n1})`);
      } else {
        await record(cap.label, () => id(cap.id).click(), async () => {}, { expectChange: cap.id === 'regen' });
      }
    }
  }

  // Live feed: ⚡ must keep repainting.
  await id('reset').click();
  await setBool('rsi', true);
  const b0 = await shot();
  await page.getByTestId('lab-live-100').click();
  await page.waitForTimeout(2200);
  const live = await stage.screenshot();
  const liveDiff = diffFraction(b0, live);
  steps.push({ name: '⚡ 100 ms live, after 2.2 s', buf: live, note: pct(liveDiff) });
  if (liveDiff === 0) flags.push('⚡ live feed did not change the chart');

  // Hover shows the HUD readout and fires crosshair events.
  await page.getByTestId('lab-live-off').click();
  const box = await page.locator('.lab-chart').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + Math.min(box.height * 0.3, 150));
  await page.waitForTimeout(300);
  if (!(await page.getByTestId('readout').textContent())?.includes(' O ')) flags.push('hover did not populate the crosshair readout');

  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) flags.push('sideways page overflow');
  if (errors.length) flags.push(`${errors.length} console/page error(s): ${[...new Set(errors)].slice(0, 2).join(' | ').slice(0, 160)}`);

  for (let i = 0, n = 1; i < steps.length; i += 6, n++) {
    await sheet(browser, `${d.name} · Lab, every capability (${n}) — ${expected.pkg}`, steps.slice(i, i + 6), join(out, 'sheets', `${d.name}-lab-${n}.png`), 3);
  }
  const video = page.video();
  await context.close();
  try { renameSync(await video.path(), join(out, 'videos', d.name, 'lab.webm')); } catch { /* video optional */ }
  return { demo: d.name, id: 'lab', kind: 'lab', controls: results.length, flags };
}

// ---------------------------------------------------------------- native overview from the newest simulator run
async function nativeOverview(browser) {
  const base = join(root, 'e2e-native', '.compare', 'native');
  if (!existsSync(base)) { console.log('native: no run found (npm run test:native:compat creates one) — skipped'); return; }
  const dir = join(base, readdirSync(base).sort().at(-1), 'scenarios-clean', 'takeScreenshot');
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  for (let i = 0; i < files.length; i += 6) {
    const frames = files.slice(i, i + 6).map((f) => ({ name: f.replace(/^scenario-|\.png$/g, ''), buf: readFileSync(join(dir, f)) }));
    await sheet(browser, `iOS simulator · scenarios ${i + 1}–${i + frames.length} (from the newest test:native:compat run)`, frames, join(out, 'sheets', `ios-${String(i / 6 + 1).padStart(2, '0')}.png`));
  }
}

// ---------------------------------------------------------------- main
const browser = await chromium.launch();
const results = [];
try {
  for (const d of DEMOS) {
    const url = await start(d);
    console.log(`\n== ${d.name} (${url})`);
    for (const sc of SCENARIOS) {
      if (only && !only.includes(sc.id)) continue;
      try {
        const r = await runScenario(browser, d, url, sc);
        results.push(r);
        console.log(`${r.flags.length ? '⚠' : '✓'} ${sc.id}${r.flags.length ? ' — ' + r.flags.join('; ') : ''}`);
      } catch (e) {
        results.push({ demo: d.name, id: sc.id, kind: sc.kind, flags: [`run failed: ${e.message.split('\n')[0]}`] });
        console.log(`✗ ${sc.id} — ${e.message.split('\n')[0]}`);
      }
    }
    if (!only || only.includes('lab')) {
      try { const r = await runLab(browser, d, url); results.push(r); console.log(`${r.flags.length ? '⚠' : '✓'} lab (${r.controls} control states)${r.flags.length ? ' — ' + r.flags.join('; ') : ''}`); }
      catch (e) { results.push({ demo: d.name, id: 'lab', kind: 'lab', flags: [`run failed: ${e.message.split('\n')[0]}`] }); console.log(`✗ lab — ${e.message.split('\n')[0]}`); }
    }
  }
  if (process.argv.includes('--native')) await nativeOverview(browser);
} finally {
  await browser.close();
  for (const s of servers) { try { process.kill(-s.pid); } catch { /* already gone */ } }
}

// ---------------------------------------------------------------- report
const flagged = results.filter((r) => r.flags.length);
const md = [
  '# Visual QA report',
  '',
  `${results.length} runs · ${flagged.length} flagged · generated ${new Date().toISOString()}`,
  '',
  flagged.length ? '## Flagged' : '## Nothing flagged',
  ...flagged.map((r) => `- **${r.demo} / ${r.id}**: ${r.flags.join('; ')} → \`qa-output/sheets/${r.demo}-${r.id}${r.id === 'lab' ? '-1' : ''}.png\``),
  '',
  '## All runs',
  '| demo | scenario | kind | canvases | painted | hover Δ | pan Δ | zoom Δ | live Δ | flags |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.demo} | ${r.id} | ${r.kind} | ${r.canvases ?? ''} | ${r.painted != null ? pct(r.painted) : ''} | ${r.hover != null ? pct(r.hover) : ''} | ${r.pan != null ? pct(r.pan) : ''} | ${r.zoom != null ? pct(r.zoom) : ''} | ${r.live != null ? pct(r.live) : ''} | ${r.flags.length || ''} |`),
  '',
  'Sheets: `qa-output/sheets/`. Videos: `qa-output/videos/<demo>/`.',
].join('\n');
writeFileSync(join(out, 'report.md'), md);
writeFileSync(join(out, 'report.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length} runs, ${flagged.length} flagged → qa-output/report.md`);
process.exit(0);
