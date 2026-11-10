// Consumer test: the published ESM entry point works from a plain .mjs file with no build step.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as engine from '@stacklatte/chart-engine';

const candles = Array.from({ length: 120 }, (_, i) => ({ timestamp: i * 60_000, open: 100 + (i % 7), high: 109, low: 95, close: 100 + (i % 5), volume: 10 }));

test('exports the documented surface', () => {
  for (const name of ['calcRSI', 'calcMACD', 'calcSMA', 'calcEMA', 'calcBollingerBands', 'normalizeCandles', 'buildChartPipeline', 'validateChartConfig', 'computeLayout', 'getThemeColors']) {
    assert.equal(typeof engine[name], 'function', name);
  }
});

test('indicators produce finite output', () => {
  assert.ok(engine.calcRSI(candles, 14).every((p) => Number.isFinite(p.value)));
  assert.ok(engine.calcMACD(candles).histogram.every((p) => Number.isFinite(p.value)));
});

test('a hallucinated ChartConfig is rejected with itemised errors', () => {
  const bad = { version: '1', theme: 'neon', priceDisplay: 'candle', interval: '1m', overlays: [], shadedAreas: [], subPanels: [],
    viewport: { visibleCandles: 60, followLive: true }, hud: { showOhlcHud: false }, sparkles: 1 };
  assert.throws(() => engine.buildChartPipeline(bad, candles), (err) => {
    // Error order is not part of the contract — assert every problem is reported.
    assert.match(err.message, /Invalid ChartConfig/);
    assert.match(err.message, /INVALID_ENUM/);
    assert.match(err.message, /UNKNOWN_KEY/);
    return true;
  });
});

test('dirty candles are dropped rather than poisoning the range', () => {
  const dirty = [...candles, { ...candles[0], timestamp: 9e9, close: NaN }];
  assert.equal(engine.normalizeCandles(dirty).length, candles.length);
});
