import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import * as engine from '@stacklatte/chart-engine';
import { SCENARIOS } from '@stacklatte/chart-examples';

import { PACKAGES, ROOT, abs, listExports } from './exports';

/**
 * People have @stacklatte/chart-core 2.x and @stacklatte/chart-web 1.x installed. These tests download the
 * versions that are actually published and prove the new code is a drop-in replacement:
 *   1. every export that existed still exists,
 *   2. constants are identical,
 *   3. the old and new engine produce the same numbers for the same inputs.
 * Behaviour that changed on purpose is listed explicitly at the bottom.
 */
const OLD_CORE = { name: '@stacklatte/chart-core', version: '2.3.3' };
const OLD_WEB = { name: '@stacklatte/chart-web', version: '1.3.2' };
const cache = join(ROOT, 'compat', '.cache');

function fetchPublished({ name, version }: { name: string; version: string }): string | null {
  const dir = join(cache, name.split('/')[1] + '-' + version);
  if (existsSync(join(dir, 'package', 'package.json'))) return join(dir, 'package');
  try {
    mkdirSync(dir, { recursive: true });
    execFileSync('npm', ['pack', `${name}@${version}`, '--pack-destination', dir, '--silent'], { cwd: dir, stdio: 'pipe' });
    execFileSync('sh', ['-c', 'tar -xzf *.tgz'], { cwd: dir, stdio: 'pipe' });
    return join(dir, 'package');
  } catch {
    return null;
  }
}

let oldCore: string | null = null;
let oldWeb: string | null = null;
let old: any;

beforeAll(() => {
  oldCore = fetchPublished(OLD_CORE);
  oldWeb = fetchPublished(OLD_WEB);
  if (oldCore) old = createRequire(import.meta.url)(join(oldCore, 'dist', 'core.js'));
  if (!oldCore && process.env.REQUIRE_PUBLISHED === '1') throw new Error('Could not download the published packages (set REQUIRE_PUBLISHED=0 to skip offline).');
});

const online = (fn: () => void) => () => {
  if (!oldCore) return console.warn('skipped: published packages unavailable (offline?)');
  fn();
};

const names = (file: string) => new Set(listExports(file).map((e) => e.name));
const eng = engine as unknown as Record<string, any>;

describe('every previously-published export still exists', () => {
  it(`${OLD_CORE.name}@${OLD_CORE.version} index`, online(() => {
    const have = names(abs('chart-core/dist/index.d.ts'));
    const missing = [...names(join(oldCore!, 'dist/index.d.ts'))].filter((n) => !have.has(n));
    expect(missing, 'exports removed since 2.3.3').toEqual([]);
  }));

  it(`${OLD_CORE.name}@${OLD_CORE.version} /core`, online(() => {
    const have = names(abs('chart-core/dist/core.d.ts'));
    const missing = [...names(join(oldCore!, 'dist/core.d.ts'))].filter((n) => !have.has(n));
    expect(missing).toEqual([]);
  }));

  it(`${OLD_WEB.name}@${OLD_WEB.version}`, () => {
    if (!oldWeb) return console.warn('skipped: published packages unavailable (offline?)');
    const have = names(abs(PACKAGES['chart-web'].dts[0]));
    const missing = [...names(join(oldWeb, 'dist/index.d.ts'))].filter((n) => !have.has(n));
    expect(missing, 'exports removed since chart-web 1.3.2').toEqual([]);
  });

  it('all 72 runtime exports of the old core.js exist in the new engine', online(() => {
    const missing = Object.keys(old).filter((k) => !(k in eng));
    expect(missing).toEqual([]);
  }));
});

describe('constants are unchanged', () => {
  it('every non-function export is deep-equal', online(() => {
    for (const [k, v] of Object.entries(old)) {
      if (typeof v === 'function') continue;
      expect(eng[k], k).toEqual(v);
    }
  }));
});

/** Datasets both versions must treat identically: every scenario whose data is finite and (after sort) well-formed. */
const CLEAN = SCENARIOS.filter((s) => !['edge-dirty'].includes(s.id) && s.data().length > 0);

describe('numbers are identical to the published engine', () => {
  it.each(CLEAN.map((s) => [s.id, s] as const))('indicators on %s', (_id, s) => {
    if (!oldCore) return;
    const c = s.data();
    for (const period of [5, 9, 14, 20, 50]) {
      expect(eng.calcRSI(c, period), `RSI ${period}`).toEqual(old.calcRSI(c, period));
      expect(eng.calcEMA(c, period, 'x', '#fff'), `EMA ${period}`).toEqual(old.calcEMA(c, period, 'x', '#fff'));
      expect(eng.calcSMA(c, period, 'x', '#fff'), `SMA ${period}`).toEqual(old.calcSMA(c, period, 'x', '#fff'));
    }
    expect(eng.calcMACD(c)).toEqual(old.calcMACD(c));
    for (const mult of [1, 2, 2.5]) {
      const colors = { upper: '#1', lower: '#2', basis: '#3' };
      expect(eng.calcBollingerBands(c, 20, mult, colors)).toEqual(old.calcBollingerBands(c, 20, mult, colors));
    }
  });

  it.each(CLEAN.map((s) => [s.id, s] as const))('normalisation, price range and geometry on %s', (_id, s) => {
    if (!oldCore) return;
    const raw = s.data();
    const n = eng.normalizeCandles(raw);
    expect(n).toEqual(old.normalizeCandles(raw));
    if (n.length < 2) return;
    expect(eng.computePriceRange(n)).toEqual(old.computePriceRange(n));
    const { priceMin, priceMax } = eng.computePriceRange(n);
    const win = n.slice(-60);
    expect(eng.buildCandleGeometry(win, 800, 300, priceMin, priceMax, '#0f0', '#f00')).toEqual(old.buildCandleGeometry(win, 800, 300, priceMin, priceMax, '#0f0', '#f00'));
    expect(eng.buildLinePoints(win, 800, 300, priceMin, priceMax)).toEqual(old.buildLinePoints(win, 800, 300, priceMin, priceMax));
    expect(eng.buildPaddedRange(priceMin, priceMax, 0.05)).toEqual(old.buildPaddedRange(priceMin, priceMax, 0.05));
    expect(eng.inferIntervalMs(n)).toEqual(old.inferIntervalMs(n));
    expect(eng.getPriceTicks(priceMin, priceMax, 6)).toEqual(old.getPriceTicks(priceMin, priceMax, 6));
  });

  it('layout, ticks, zoom and viewport helpers', () => {
    if (!oldCore) return;
    for (const [w, h] of [[400, 300], [800, 600], [390, 844], [1280, 900], [320, 480]] as const) {
      for (const flags of [[false, false, false, 0], [true, false, false, 0], [true, true, true, 0], [false, false, true, 2], [true, true, true, 3]] as const) {
        const before = old.computeLayout(w, h, ...flags);
        const after = eng.computeLayout(w, h, ...flags);
        if (before.mainChartHeight >= 1 && before.chartWidth >= 1 && before.innerHeight >= 1) {
          expect(after, `layout ${w}x${h} ${flags}`).toEqual(before);
        } else {
          // Intentional: the published version returned a NEGATIVE plot size here (a chart with more panels than
          // fit). The new engine clamps to 1px so nothing downstream sees a negative dimension.
          expect(after.mainChartHeight).toBeGreaterThanOrEqual(1);
          expect(after.chartWidth).toBeGreaterThanOrEqual(1);
          expect(after.padding).toEqual(before.padding);
        }
      }
      expect(eng.priceTickCount(h)).toEqual(old.priceTickCount(h));
      expect(eng.maxLegibleVisibleCandles(w, 4)).toEqual(old.maxLegibleVisibleCandles(w, 4));
    }
    for (const r of [5, 40, 100, 400, 2000]) {
      expect(eng.applyZoomOutResistance(r, 200)).toEqual(old.applyZoomOutResistance(r, 200));
      expect(eng.softZoomOutCeiling(r)).toEqual(old.softZoomOutCeiling(r));
    }
    for (const vp of [{ start: 0, end: 50 }, { start: -10, end: 40 }, { start: 450, end: 520 }, { start: 100, end: 101 }]) {
      expect(eng.clampViewport(vp, 500, 4)).toEqual(old.clampViewport(vp, 500, 4));
    }
    for (const span of [60_000 * 30, 3_600_000 * 8, 86_400_000 * 3, 86_400_000 * 200]) {
      for (const h12 of [false, true]) expect(eng.formatTimeLabel(1_767_657_600_000, span, h12)).toEqual(old.formatTimeLabel(1_767_657_600_000, span, h12));
    }
  });

  it('themes resolve to the same colours', () => {
    if (!oldCore) return;
    for (const t of ['dark', 'light'] as const) expect(eng.getThemeColors(t)).toEqual(old.getThemeColors(t));
  });
});

describe('ChartConfig pipeline gives the same props for every config the old version accepted', () => {
  const configs = [
    { version: '1', theme: 'dark', priceDisplay: 'candle', interval: '1m', overlays: [], shadedAreas: [], subPanels: [], viewport: { visibleCandles: 60, followLive: true }, hud: { showOhlcHud: false } },
    { version: '1', theme: 'light', priceDisplay: 'line', interval: '1h',
      overlays: [{ type: 'ema', id: 'e', params: { period: 9 }, color: 'cyan' }, { type: 'sma', id: 's', params: { period: 20 }, color: 'orange', label: 'S' },
        { type: 'bollinger_bands', params: { period: 20, stdDev: 2 }, bands: { upper: { id: 'u', color: 'blue' }, lower: { id: 'l', color: 'blue' }, basis: { id: 'b', color: 'gray' } } }],
      shadedAreas: [{ fromOverlayId: 'u', toOverlayId: 'l', color: 'purple', opacity: 0.2 }],
      subPanels: [{ type: 'rsi', params: { period: 14 } }, { type: 'macd' }, { type: 'volume' }],
      markers: [{ timestamp: 1_767_657_600_000 + 60_000 * 100, price: 50_000, kind: 'entry-long', label: 'in' }],
      viewport: { visibleCandles: 120, followLive: false }, hud: { showOhlcHud: true } },
  ];
  const data = SCENARIOS.find((s) => s.id === 'basic')!.data();

  it.each(configs.map((c, i) => [i, c] as const))('config #%i', (_i, config) => {
    if (!oldCore) return;
    expect(eng.validateChartConfig(config)).toEqual({ valid: true });
    expect(eng.buildChartPipeline(config, data)).toEqual(old.buildChartPipeline(config, data));
  });
});

describe('@stacklatte/chart-core keeps its legacy lenient ChartConfig behaviour', () => {
  /** Configs the published 2.3.3 accepted and compiled — mistakes that "worked" because they fell back silently. */
  const sloppy: Array<[string, Record<string, unknown>]> = [
    ['unknown theme', { theme: 'neon' }],
    ['unknown interval', { interval: '2h' }],
    ['extra key', { sparkles: true }],
    ['wrongly typed boolean', { viewport: { visibleCandles: 60, followLive: 'yes' } }],
    ['raw hex colour', { overlays: [{ type: 'sma', id: 'a', params: { period: 9 }, color: '#ff0000' }] }],
  ];
  const data = SCENARIOS.find((x) => x.id === 'basic')!.data();

  it.each(sloppy)('the shim accepts "%s" and compiles to the SAME props as 2.3.3', async (_name, patch) => {
    if (!oldCore) return;
    const shim = await import('@stacklatte/chart-core/core');
    const cfg = { ...configs0(), ...patch } as never;
    expect(old.validateChartConfig(cfg).valid, '2.3.3 accepted it').toBe(true);
    expect(shim.validateChartConfig(cfg).valid, 'the shim must too').toBe(true);
    expect(shim.buildChartPipeline(cfg, data)).toEqual(old.buildChartPipeline(cfg, data));
  });

  it.each(sloppy)('strict is opt-in on the shim, and the default everywhere else ("%s")', async (_name, patch) => {
    const shim = await import('@stacklatte/chart-core/core');
    const cfg = { ...configs0(), ...patch } as never;
    expect(() => shim.buildChartPipeline(cfg, data, { strict: true })).toThrow(/Invalid ChartConfig/);
    expect(() => eng.buildChartPipeline(cfg, data)).toThrow(/Invalid ChartConfig/);
  });

  it('the shim still enforces the semantic rules 2.3.3 enforced', async () => {
    const shim = await import('@stacklatte/chart-core/core');
    expect(shim.validateChartConfig({ ...configs0(), overlays: [{ type: 'sma', id: 'a', params: { period: 0 }, color: 'blue' }] } as never).valid).toBe(false);
  });
});

describe('behaviour that changed ON PURPOSE since the published versions', () => {
  it('invalid enum values are now rejected by the strict packages (chart-core stays lenient, see above)', () => {
    if (!oldCore) return;
    const bad = { ...configs0(), theme: 'neon' };
    expect(old.validateChartConfig(bad).valid, 'old accepted it').toBe(true);
    expect(eng.validateChartConfig(bad).valid, 'new rejects it').toBe(false);
  });

  it('undrawable candles are dropped instead of blanking the chart', () => {
    if (!oldCore) return;
    const data = SCENARIOS.find((s) => s.id === 'basic')!.data().slice(0, 50);
    const bad = [...data, { ...data[0], timestamp: data[49].timestamp + 60_000, close: NaN }];
    expect(old.normalizeCandles(bad)).toHaveLength(51);
    expect(eng.normalizeCandles(bad)).toHaveLength(50);
  });

  it('the vwap overlay is now implemented (it used to be accepted but silently dropped)', () => {
    if (!oldCore) return;
    const data = SCENARIOS.find((x) => x.id === 'basic')!.data();
    const cfg = { ...configs0(), overlays: [{ type: 'vwap', id: 'v', params: {}, color: 'pink' }] };
    const oldProps = old.buildChartPipeline(cfg, data);
    const newProps = eng.buildChartPipeline(cfg, data);
    expect(oldProps.indicators ?? []).toHaveLength(0); // old: warned "not yet implemented" and skipped it
    expect(newProps.indicators).toHaveLength(1);
    expect(newProps.indicators[0].id).toBe('v');
  });

  it('an invalid indicator period returns "no data" instead of throwing', () => {
    if (!oldCore) return;
    const data = SCENARIOS.find((s) => s.id === 'basic')!.data();
    expect(eng.calcRSI(data, 0)).toEqual([]);
    expect(eng.calcEMA(data, NaN, 'x', '#fff')).toBeNull();
  });
});

function configs0() {
  return { version: '1', theme: 'dark', priceDisplay: 'candle', interval: '1m', overlays: [], shadedAreas: [], subPanels: [], viewport: { visibleCandles: 60, followLive: true }, hud: { showOhlcHud: false } };
}
