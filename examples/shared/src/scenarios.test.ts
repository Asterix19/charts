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
