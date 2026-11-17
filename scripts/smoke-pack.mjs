#!/usr/bin/env node
// Consumer smoke test: pack every publishable package, install the tarballs into
// an empty project, and exercise the public entry points exactly as a user would.
// Run after `npm run build` (the `test:pack` script does both).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// chart-angular publishes from ng-packagr's dist/ folder, not the package root.
const PACKAGES = [
  ['chart-engine'], ['chart-native'], ['chart-react'], ['chart-mcp'], ['chart-angular', 'chart-angular/dist'],
];
const root = new URL('..', import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), 'stacklatte-smoke-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString();

const tarballs = PACKAGES.map(([workspace, dir]) => {
  const args = dir ? ['pack', join(root, dir)] : ['pack', '-w', workspace];
  const out = run('npm', [...args, '--pack-destination', work, '--json'], root);
  return join(work, JSON.parse(out)[0].filename);
});

writeFileSync(join(work, 'package.json'), '{"name":"smoke","private":true,"type":"module"}');
run('npm', ['i', '--no-audit', '--no-fund', ...tarballs, 'react@19.2.8', 'react-dom@19.2.8',
  '@angular/core@22.2.5', '@angular/common@22.2.5', '@angular/compiler@22.2.5', '@angular/platform-browser@22.2.5', 'rxjs@^7.8.0'], work);

writeFileSync(join(work, 'check.mjs'), `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToString } from 'react-dom/server';
import * as engine from '@stacklatte/chart-engine';
import * as lab from '@stacklatte/chart-engine/lab';
import * as web from '@stacklatte/chart-react';
import * as canvas from '@stacklatte/chart-engine/canvas';
const require = createRequire(import.meta.url);

const candles = Array.from({ length: 50 }, (_, i) => ({ timestamp: i * 60000, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 10 }));
const config = { version: '1', theme: 'dark', priceDisplay: 'candle', interval: '1h',
  overlays: [{ type: 'ema', id: 'e', params: { period: 9 }, color: 'cyan' }], shadedAreas: [],
  subPanels: [{ type: 'rsi', params: { period: 14 } }], viewport: { visibleCandles: 30, followLive: true }, hud: { showOhlcHud: true } };

assert.equal(typeof engine.closesToCandles, 'function', 'closesToCandles (static price lists -> chart data) is exported');
assert.equal(engine.closesToCandles([1, 2, 3]).length, 3, 'closesToCandles works');
assert.ok(engine.calcRSI(candles, 14).length > 0, 'RSI computes');
assert.equal(typeof engine.buildChartPipeline(config, candles), 'object', 'valid config compiles');
for (const bad of [{ ...config, theme: 'neon' }, { ...config, interval: '2h' }, { ...config, sparkles: 1 }]) {
  assert.throws(() => engine.buildChartPipeline(bad, candles), /Invalid ChartConfig/, 'invalid config must throw');
}
assert.equal(typeof web.SLChart, 'function', 'chart-react exports SLChart');
// The Lab entry: the configurator's schema and the code / ChartConfig / prompt generator.
const generated = lab.generateChart({ ...lab.DEFAULT_LAB_STATE, rsi: true, chartType: 'area' }, 'react');
assert.ok(generated.code.includes('SLChart') && generated.code.includes('showRsiPanel'), 'generateChart produces React code');
assert.equal(engine.validateChartConfig(generated.chartConfig).valid, true, 'the generated ChartConfig is valid');
assert.ok(generated.prompt.includes('https://stacklatte.com/llms.txt'), 'the generated prompt points at the docs');
assert.equal(typeof canvas.drawCandles, 'function', 'chart-engine/canvas exports its drawing primitives');
// The chart paints on a <canvas> in the browser; on the server it renders only its sized container (no DOM APIs touched).
assert.match(renderToString(React.createElement(web.SLChart, { data: candles, width: 400, height: 300 })), /<div[^>]*width:400px/, 'chart-react SSR renders its container without throwing');
assert.ok('definitions' in require('@stacklatte/chart-engine/ChartConfig.schema.json'), 'JSON Schema is resolvable');
assert.ok(require.resolve('@stacklatte/chart-native').includes('chart-native'), 'chart-native resolves');
// The MCP server package loads and exposes its factory (its dependencies were installed from the tarball's manifest).
const mcp = await import('@stacklatte/chart-mcp');
assert.equal(typeof mcp.createServer, 'function', 'chart-mcp exports createServer');
assert.ok(import.meta.resolve('@stacklatte/chart-mcp').includes('chart-mcp'), 'chart-mcp resolves');
// Angular: the ng-packagr output must load and expose the component plus the re-exported engine.
await import('@angular/compiler'); // partial-compiled library code is linked at runtime in Node
const ng = await import('@stacklatte/chart-angular');
assert.equal(typeof ng.SlChartComponent, 'function', 'chart-angular exports SlChartComponent');
assert.equal(typeof ng.calcRSI, 'function', 'chart-angular re-exports the engine');
assert.equal(typeof canvas.ChartController, 'function', 'chart-engine/canvas exports ChartController');
console.log('consumer smoke test passed');
`);
process.stdout.write(run('node', ['check.mjs'], work));
