import { extendToEdges, parseDashArray, normalizeCandles, abbrevName, findIndicatorValue } from './utils';
import type { TsPoint } from './types';

// ─── helpers ──────────────────────────────────────────────────────────────

const pt = (timestamp: number, value: number): TsPoint => ({ timestamp, value });

const candle = (ts: number, price = 100) => ({
  timestamp: ts,
  open: price,
  high: price + 1,
  low: price - 1,
  close: price,
});

// ─── extendToEdges ─────────────────────────────────────────────────────────
// Ensures an indicator series visually fills the entire visible window.
// Adds a synthetic leading point at leftTs and/or trailing point at rightTs
// when the series doesn't already reach those edges.

describe('extendToEdges', () => {
  it('prepends a point at leftTs when series starts after left edge', () => {
    const series = [pt(200, 10), pt(300, 20)];
    const result = extendToEdges(series, 100, 400);
    expect(result[0]).toEqual({ timestamp: 100, value: 10 });
  });

  it('appends a point at rightTs when series ends before right edge', () => {
    const series = [pt(100, 10), pt(200, 20)];
    const result = extendToEdges(series, 100, 400);
    expect(result[result.length - 1]).toEqual({ timestamp: 400, value: 20 });
  });

  it('both extends left and right when needed', () => {
    const series = [pt(200, 5), pt(300, 15)];
    const result = extendToEdges(series, 100, 400);
    expect(result[0].timestamp).toBe(100);
    expect(result[result.length - 1].timestamp).toBe(400);
    expect(result.length).toBe(4);
  });

  it('does not prepend when series already starts at leftTs', () => {
    const series = [pt(100, 10), pt(200, 20)];
    const result = extendToEdges(series, 100, 400);
    expect(result.filter(p => p.timestamp === 100).length).toBe(1);
  });

  it('does not append when series already ends at rightTs', () => {
    const series = [pt(100, 10), pt(400, 40)];
    const result = extendToEdges(series, 100, 400);
    expect(result.filter(p => p.timestamp === 400).length).toBe(1);
  });

  it('returns an empty array unchanged', () => {
    expect(extendToEdges([], 100, 400)).toEqual([]);
  });

  it('sorts input data by timestamp before extending', () => {
    const series = [pt(300, 30), pt(200, 20)]; // out of order
    const result = extendToEdges(series, 100, 400);
    // leading extension uses value of earliest point (200, value=20)
    expect(result[0]).toEqual({ timestamp: 100, value: 20 });
    // trailing extension uses value of latest point (300, value=30)
    expect(result[result.length - 1]).toEqual({ timestamp: 400, value: 30 });
  });

  it('single point: extends both left and right using same value', () => {
    const series = [pt(250, 42)];
    const result = extendToEdges(series, 100, 400);
    expect(result[0]).toEqual({ timestamp: 100, value: 42 });
    expect(result[result.length - 1]).toEqual({ timestamp: 400, value: 42 });
    expect(result.length).toBe(3);
  });
});

// ─── parseDashArray ────────────────────────────────────────────────────────
// Parses SVG-style dash strings like "4 4" into number arrays for Skia.

describe('parseDashArray', () => {
  it('parses a standard "4 4" dash string', () => {
    expect(parseDashArray('4 4')).toEqual([4, 4]);
  });

  it('parses a longer pattern like "8 4 2 4"', () => {
    expect(parseDashArray('8 4 2 4')).toEqual([8, 4, 2, 4]);
  });

  it('filters out zero values', () => {
    expect(parseDashArray('4 0 4')).toEqual([4, 4]);
  });

  it('filters out NaN entries (non-numeric tokens)', () => {
    expect(parseDashArray('4 abc 4')).toEqual([4, 4]);
  });

  it('handles extra whitespace between tokens', () => {
    expect(parseDashArray('  4   4  ')).toEqual([4, 4]);
  });

  it('returns empty array for empty string', () => {
    expect(parseDashArray('')).toEqual([]);
  });

  it('returns empty array when all tokens are invalid', () => {
    expect(parseDashArray('abc xyz')).toEqual([]);
  });
});

// ─── normalizeCandles ──────────────────────────────────────────────────────
// Sorts candles by timestamp and removes duplicates (keeps first occurrence
// in the sorted order, which means stable deduplication by timestamp).

describe('normalizeCandles', () => {
  it('sorts candles in ascending timestamp order', () => {
    const input = [candle(300), candle(100), candle(200)];
    const result = normalizeCandles(input);
    expect(result.map(c => c.timestamp)).toEqual([100, 200, 300]);
  });

  it('removes duplicate timestamps (keeps first after sort)', () => {
    const input = [candle(100, 10), candle(100, 20), candle(200)];
    const result = normalizeCandles(input);
    expect(result.length).toBe(2);
    expect(result[0].timestamp).toBe(100);
    expect(result[1].timestamp).toBe(200);
  });

  it('does not mutate the original array', () => {
    const input = [candle(300), candle(100)];
    const copy = [...input];
    normalizeCandles(input);
    expect(input[0].timestamp).toBe(copy[0].timestamp);
    expect(input[1].timestamp).toBe(copy[1].timestamp);
  });

  it('returns an empty array for empty input', () => {
    expect(normalizeCandles([])).toEqual([]);
  });

  it('returns a single candle unchanged', () => {
    const input = [candle(100)];
    const result = normalizeCandles(input);
    expect(result.length).toBe(1);
    expect(result[0].timestamp).toBe(100);
  });

  it('handles all duplicates (single unique timestamp)', () => {
    const input = [candle(100), candle(100), candle(100)];
    const result = normalizeCandles(input);
    expect(result.length).toBe(1);
  });
});

// ─── abbrevName ────────────────────────────────────────────────────────────
// Produces a 3-char uppercase abbreviation for use in the OHLC HUD.

describe('abbrevName', () => {
  it('passes through an already-3-char uppercase name', () => {
    expect(abbrevName('SMA')).toBe('SMA');
    expect(abbrevName('EMA')).toBe('EMA');
    expect(abbrevName('RSI')).toBe('RSI');
  });

  it('takes initials of a multi-word name', () => {
    expect(abbrevName('Simple Moving Average')).toBe('SMA');
    expect(abbrevName('Bollinger Band Upper')).toBe('BBU');
    expect(abbrevName('Bollinger Band Lower')).toBe('BBL');
  });

  it('extracts embedded capitals from CamelCase', () => {
    expect(abbrevName('BollingerBandUpper')).toBe('BBU');
    expect(abbrevName('ExponentialMovingAverage')).toBe('EMA');
  });

  it('falls back to first 3 chars uppercased for a lowercase word', () => {
    expect(abbrevName('ema14')).toBe('EMA');
    expect(abbrevName('close')).toBe('CLO');
  });

  it('trims whitespace before processing', () => {
    expect(abbrevName('  SMA  ')).toBe('SMA');
  });

  it('truncates to 3 chars even with many words', () => {
    expect(abbrevName('A B C D E').length).toBe(3);
  });
});

// ─── findIndicatorValue ────────────────────────────────────────────────────
// Looks up an indicator value at a given timestamp.

describe('findIndicatorValue', () => {
  const series = [
    { timestamp: 100, value: 10.5 },
    { timestamp: 200, value: 20.0 },
    { timestamp: 300, value: 30.7 },
  ];

  it('returns the value when the timestamp matches', () => {
    expect(findIndicatorValue(series, 200)).toBe(20.0);
  });

  it('returns null when no matching timestamp', () => {
    expect(findIndicatorValue(series, 999)).toBeNull();
  });

  it('returns null for an empty series', () => {
    expect(findIndicatorValue([], 100)).toBeNull();
  });
});
