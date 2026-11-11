import { describe, expect, it } from 'vitest';
import { normalizeCandles, validateChartConfig } from '@stacklatte/chart-engine';

import { createRng, generateCandles } from './data';
import { SCENARIOS, SCENARIO_IDS, getScenario, scenariosByKind } from './scenarios';

describe('data generation', () => {
  it('is deterministic for a given seed and different across seeds', () => {
    expect(generateCandles(50, { seed: 1 })).toEqual(generateCandles(50, { seed: 1 }));
    expect(generateCandles(50, { seed: 1 })).not.toEqual(generateCandles(50, { seed: 2 }));
  });

  it('produces internally consistent OHLC candles', () => {
    for (const c of generateCandles(2_000, { seed: 9 })) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      expect(c.low).toBeGreaterThan(0);
    }
  });

  it('createRng stays within [0,1)', () => {
    const r = createRng(5);
    for (let i = 0; i < 10_000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('scenario catalogue', () => {
  it('has unique, URL-safe ids', () => {
    expect(new Set(SCENARIO_IDS).size).toBe(SCENARIO_IDS.length);
    for (const id of SCENARIO_IDS) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('covers every kind, including stress and edge cases', () => {
    for (const kind of ['feature', 'edge', 'stress', 'live'] as const) expect(scenariosByKind(kind).length).toBeGreaterThan(0);
    expect(scenariosByKind('stress').some((s) => s.candles >= 50_000)).toBe(true);
  });

  it('getScenario throws a helpful error for unknown ids', () => {
    expect(() => getScenario('nope')).toThrow(/Known: basic/);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s: declared candle count matches its data', (_id, s) => {
    const data = s.data();
    // edge-unsorted / edge-gaps intentionally differ after normalisation, so compare the raw length loosely
    if (s.kind !== 'edge' || [0, 1, 5].includes(s.candles)) expect(data.length).toBe(s.candles);
    else expect(data.length).toBeGreaterThan(0);
    expect(s.description.length).toBeGreaterThan(10);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s: data() is stable (cached/deterministic) and never mutated by props()', (_id, s) => {
    const a = s.data();
    const snapshot = JSON.stringify(a.slice(0, 20));
    s.props(a);
    expect(JSON.stringify(s.data().slice(0, 20))).toBe(snapshot);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s: normalised data is strictly ascending', (_id, s) => {
    const n = normalizeCandles(s.data());
    for (let i = 1; i < n.length; i++) expect(n[i].timestamp).toBeGreaterThan(n[i - 1].timestamp);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s: indicator ids are unique and shaded areas reference real indicators', (_id, s) => {
    const p = s.props(s.data());
    const ids = (p.indicators ?? []).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const area of p.shadedAreas ?? []) { expect(ids).toContain(area.fromId); expect(ids).toContain(area.toId); }
  });

  it('live scenarios append monotonic timestamps and never lose the forming candle', () => {
    for (const s of scenariosByKind('live')) {
      let data = s.data();
      for (let tick = 1; tick <= 60; tick++) {
        const before = data.length;
        data = s.live!.next(data, tick);
        expect(Math.abs(data.length - before)).toBeLessThanOrEqual(1);
      }
      for (let i = 1; i < data.length; i++) expect(data[i].timestamp).toBeGreaterThan(data[i - 1].timestamp);
    }
  });

  it('live-burst is capped at 10,000 candles', () => {
    const s = getScenario('live-burst');
    let data = generateCandles(10_000, { seed: 5 });
    for (let tick = 5; tick <= 25; tick += 5) data = s.live!.next(data, tick);
    expect(data.length).toBeLessThanOrEqual(10_000);
  });

  it('every stress scenario declares a budget', () => {
    for (const s of scenariosByKind('stress')) expect(s.budget).toBeDefined();
  });
});

describe('ChartConfig fixtures stay valid', () => {
  it('a config built for the basic scenario validates', () => {
    expect(validateChartConfig({
      version: '1', theme: 'dark', priceDisplay: 'candle', interval: '1m', overlays: [], shadedAreas: [], subPanels: [],
      viewport: { visibleCandles: 60, followLive: true }, hud: { showOhlcHud: false },
    })).toEqual({ valid: true });
  });
});

import { reportAttributes, summarizeFrames } from './perf';
import { scenarioHash, scenarioIdFromHash } from './route';

describe('perf + routing helpers', () => {
  it('summarizeFrames computes percentiles, fps and hitch count', () => {
    const s = summarizeFrames([16, 16, 17, 16, 80, 16, 16, 16, 16, 120], 1000);
    expect(s.frames).toBe(10);
    expect(s.fps).toBe(10);
    expect(s.max).toBe(120);
    expect(s.long).toBe(2);
    expect(s.p50).toBe(16);
    expect(s.p95).toBeGreaterThanOrEqual(80);
  });

  it('summarizeFrames tolerates no frames', () => {
    expect(summarizeFrames([], 0)).toEqual({ frames: 0, durationMs: 0, fps: 0, p50: 0, p95: 0, max: 0, long: 0 });
  });

  it('round-trips every scenario id through the hash', () => {
    for (const id of SCENARIO_IDS) expect(scenarioIdFromHash(scenarioHash(id))).toBe(id);
    expect(scenarioIdFromHash('#/scenarios/nope')).toBeNull();
    expect(scenarioIdFromHash('')).toBeNull();
  });

  it('reportAttributes stringifies for data-* attributes', () => {
    expect(reportAttributes({ scenario: 'x', candles: 5, mountMs: 1.234, ticks: 2 })).toEqual({
      'data-scenario': 'x', 'data-candles': '5', 'data-mount-ms': '1.2', 'data-ticks': '2',
    });
  });
});

// ─── every ChartProps field must be tested somewhere, on purpose ──────────────

import type { ChartProps } from '@stacklatte/chart-engine';

type How = 'scenario' | 'always' | { elsewhere: string } | { deprecated: string };

/**
 * Exhaustive by construction: adding a field to ChartProps without listing it here is a COMPILE error, so a new
 * feature cannot ship untested by accident. 'scenario' fields must be set by at least one catalogue scenario.
 */
const COVERAGE = {
  data: 'always', width: 'always', height: 'always',
  indicators: 'scenario', shadedAreas: 'scenario', markers: 'scenario', customPanels: 'scenario',
  intervalMs: 'scenario', visibleDataPoints: 'scenario', theme: 'scenario', showOhlcHud: 'scenario',
  showRsiPanel: 'scenario', rsiPeriod: 'scenario', showMacdPanel: 'scenario', showVolumePanel: 'scenario',
  chartType: 'scenario', scrollToLatestTrigger: 'scenario', hour12: 'scenario', maxZoom: 'scenario', showGrid: 'scenario',
  onCrosshairChange: { elsewhere: 'every demo wires it to data-crosshair; the e2e hover test asserts it' },
  bufferRatio: { deprecated: 'accepted for backwards compatibility; no renderer reads it' },
} satisfies Record<keyof ChartProps, How>;

describe('ChartProps coverage', () => {
  const setBy = (key: string) => SCENARIOS.filter((s) => (s.props(s.data()) as Record<string, unknown>)[key] !== undefined).map((s) => s.id);

  it.each(Object.entries(COVERAGE).filter(([, how]) => how === 'scenario').map(([k]) => [k]))('%s is set by at least one scenario', (key) => {
    expect(setBy(key), `no scenario exercises "${key}"`).not.toHaveLength(0);
  });

  it('covers every marker kind, both built-in themes plus a custom palette, both chart types and every panel', () => {
    const props = SCENARIOS.map((s) => s.props(s.data()) as ChartProps);
    const kinds = new Set(props.flatMap((p) => (p.markers ?? []).map((m) => m.kind)));
    for (const k of ['entry-long', 'exit-long', 'entry-short', 'exit-short', 'stop-loss', 'take-profit']) expect(kinds.has(k as never), k).toBe(true);
    const themes = new Set<string>(props.map((p) => (typeof p.theme === 'object' ? 'custom' : p.theme ?? 'default')));
    for (const t of ['dark', 'light', 'custom']) expect(themes.has(t), t).toBe(true);
    expect(new Set(props.map((p) => p.chartType ?? 'candle'))).toEqual(new Set(['candle', 'line']));
    expect(props.some((p) => p.showRsiPanel && p.showMacdPanel && p.showVolumePanel && p.customPanels?.length)).toBe(true);
  });

  it('exercises both custom-panel y-range modes and a multi-series panel', () => {
    const panels = SCENARIOS.flatMap((s) => (s.props(s.data()) as ChartProps).customPanels ?? []);
    expect(panels.some((p) => p.yRange === 'auto')).toBe(true);
    expect(panels.some((p) => typeof p.yRange === 'object')).toBe(true);
    expect(panels.some((p) => p.series.length > 1)).toBe(true);
  });

  it('the ChartConfig scenario really uses the compiled pipeline, including VWAP', () => {
    const s = SCENARIOS.find((x) => x.id === 'config-pipeline')!;
    const p = s.props(s.data()) as ChartProps;
    expect((p.indicators ?? []).map((i) => i.id)).toEqual(expect.arrayContaining(['ema-9', 'sma-30', 'vwap', 'bb-u', 'bb-l', 'bb-b']));
    expect(p.shadedAreas).toHaveLength(1);
    expect(p.markers).toHaveLength(3);
  });
});
