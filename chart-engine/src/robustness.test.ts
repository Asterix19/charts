import { describe, expect, it } from 'vitest';

import {
  buildPaddedRange, calcBollingerBands, calcEMA, calcMACD, calcRSI, calcSMA, computeLayout, computePriceRange,
  getPriceTicks, normalizeCandles,
} from './index';
import type { Candle } from './types';

const make = (n: number, patch: (c: Candle, i: number) => Partial<Candle> = () => ({})): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const base = { timestamp: i * 60_000, open: 100 + (i % 7), high: 108 + (i % 7), low: 95, close: 100 + (i % 5), volume: 10 };
    return { ...base, ...patch(base, i) };
  });

const finite = (xs: Array<{ value: number }>) => xs.every((p) => Number.isFinite(p.value));

describe('normalizeCandles — dirty feed data', () => {
  it.each([
    ['NaN close', { close: NaN }],
    ['NaN open', { open: NaN }],
    ['Infinity high', { high: Infinity }],
    ['-Infinity low', { low: -Infinity }],
    ['NaN timestamp', { timestamp: NaN }],
    ['string price', { close: '101' as unknown as number }],
    ['null price', { open: null as unknown as number }],
  ])('drops a candle with %s so one bad tick cannot blank the chart', (_name, bad) => {
    const input = make(100, (_, i) => (i === 50 ? bad : {}));
    const out = normalizeCandles(input);
    expect(out).toHaveLength(99);
    expect(out.every((c) => [c.timestamp, c.open, c.high, c.low, c.close].every(Number.isFinite))).toBe(true);
    const { priceMin, priceMax } = computePriceRange(out);
    expect(Number.isFinite(priceMin) && Number.isFinite(priceMax)).toBe(true);
  });

  it('drops null/undefined entries inside the array', () => {
    const input = [...make(5), null as unknown as Candle, undefined as unknown as Candle, ...make(3).map((c) => ({ ...c, timestamp: c.timestamp + 1e7 }))];
    expect(normalizeCandles(input)).toHaveLength(8);
  });

  it.each([NaN, Infinity, 'abc' as unknown as number])('strips a garbage volume (%s) but keeps the candle', (volume) => {
    const out = normalizeCandles(make(10, (_, i) => (i === 3 ? { volume } : {})));
    expect(out).toHaveLength(10);
    expect(out[3]).not.toHaveProperty('volume');
    expect(out[2].volume).toBe(10);
  });

  it('leaves absent and null volume alone', () => {
    const out = normalizeCandles(make(5, (_, i) => (i === 1 ? { volume: undefined } : i === 2 ? { volume: null as unknown as number } : {})));
    expect(out).toHaveLength(5);
  });

  it('is a pure function: same output for the same input, input untouched', () => {
    const input = make(50, (_, i) => (i === 10 ? { close: NaN } : {}));
    const snapshot = JSON.stringify(input);
    expect(normalizeCandles(input)).toEqual(normalizeCandles(input));
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('handles empty, all-bad and single-candle input', () => {
    expect(normalizeCandles([])).toEqual([]);
    expect(normalizeCandles(make(5, () => ({ close: NaN })))).toEqual([]);
    expect(normalizeCandles(make(1))).toHaveLength(1);
  });

  it('keeps the first of duplicate timestamps and sorts reversed input', () => {
    const rev = make(20).reverse();
    const out = normalizeCandles([...rev, { ...rev[0], close: 999 }]);
    expect(out.map((c) => c.timestamp)).toEqual(make(20).map((c) => c.timestamp));
    expect(out.at(-1)!.close).not.toBe(999);
  });
});

describe('indicators never throw and never emit non-finite values on clean data', () => {
  const sizes = [0, 1, 2, 5, 13, 14, 15, 26, 34, 35, 36, 100, 5_000];
  it.each(sizes)('n=%i', (n) => {
    const d = make(n);
    expect(finite(calcRSI(d, 14))).toBe(true);
    const macd = calcMACD(d);
    if (macd) { expect(finite(macd.macd) && finite(macd.signal) && finite(macd.histogram)).toBe(true); }
    for (const line of [calcEMA(d, 9, 'a', '#fff'), calcSMA(d, 9, 'b', '#fff')]) if (line) expect(finite(line.data)).toBe(true);
    const bb = calcBollingerBands(d, 20, 2, { upper: '#1', lower: '#2', basis: '#3' });
    if (bb) for (const l of [bb.upper, bb.lower, bb.basis]) expect(finite(l.data)).toBe(true);
  });

  it('never throws for degenerate periods', () => {
    const d = make(100);
    for (const period of [0, -1, 1, 1000, NaN, 1.5]) {
      expect(() => calcRSI(d, period)).not.toThrow();
      expect(() => calcEMA(d, period, 'x', '#fff')).not.toThrow();
      expect(() => calcSMA(d, period, 'x', '#fff')).not.toThrow();
      expect(() => calcBollingerBands(d, period, 2, { upper: '#1', lower: '#2', basis: '#3' })).not.toThrow();
    }
  });

  it('RSI is bounded to [0,100] on trending and flat data', () => {
    for (const d of [make(200, (_, i) => ({ close: 100 + i })), make(200, (_, i) => ({ close: 300 - i })), make(200, () => ({ close: 100 }))]) {
      for (const p of calcRSI(d, 14)) { expect(p.value).toBeGreaterThanOrEqual(0); expect(p.value).toBeLessThanOrEqual(100); }
    }
  });
});

describe('scale helpers on degenerate input', () => {
  it('buildPaddedRange widens a zero-height range', () => {
    const r = buildPaddedRange(5, 5, 0.05);
    expect(r.max).toBeGreaterThan(r.min);
  });

  it('getPriceTicks returns [] rather than looping forever on bad ranges', () => {
    expect(getPriceTicks(NaN, NaN, 5)).toEqual([]);
    expect(getPriceTicks(0, Infinity, 5)).toEqual([]);
    expect(getPriceTicks(10, 0, 5)).toEqual([]);
  });

  it('computeLayout stays finite for zero, negative and NaN sizes', () => {
    for (const [w, h] of [[0, 0], [-10, -10], [1, 1], [50, 50]] as const) {
      const l = computeLayout(w, h, true, true, true, 3);
      expect(Number.isFinite(l.chartWidth) && Number.isFinite(l.mainChartHeight)).toBe(true);
      expect(l.chartWidth).toBeGreaterThanOrEqual(0);
      expect(l.mainChartHeight).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('scale: large inputs', () => {
  it('normalises, computes RSI and MACD on 1,000,000 candles in bounded time', () => {
    const d = make(1_000_000);
    const t0 = performance.now();
    const n = normalizeCandles(d);
    calcRSI(n, 14);
    calcMACD(n);
    expect(n).toHaveLength(1_000_000);
    expect(performance.now() - t0).toBeLessThan(5_000);
  });

  it('computePriceRange handles 1,000,000 candles without a spread-argument stack overflow', () => {
    expect(() => computePriceRange(make(1_000_000))).not.toThrow();
  });
});
