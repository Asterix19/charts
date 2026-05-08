import { calcRSI, calcSMA, calcEMA, calcBollingerBands } from './indicators';
import type { Candle } from './types';

// ─── helpers ──────────────────────────────────────────────────────────────

/** Build a candle array with constant close prices. */
const flatCandles = (closes: number[], base = 1000): Candle[] =>
  closes.map((close, i) => ({
    timestamp: base + i * 60_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
  }));

/**
 * Build alternating up/down candles to create predictable RSI.
 * gain/loss repeat evenly → RSI should converge toward 50.
 */
const alternatingCandles = (n: number, step = 1, base = 1000): Candle[] => {
  const closes: number[] = [100];
  for (let i = 1; i < n; i++)
    closes.push(closes[i - 1] + (i % 2 === 0 ? -step : step));
  return flatCandles(closes, base);
};

// ─── calcRSI ──────────────────────────────────────────────────────────────
// Wilder smoothing RSI. Needs candles.length >= period + 1 to produce output.
// RSI ranges [0, 100]. Constant prices → RSI is undefined (handled gracefully).

describe('calcRSI', () => {
  it('returns empty array when not enough candles (< period + 1)', () => {
    const candles = flatCandles(Array(14).fill(100));
    expect(calcRSI(candles, 14)).toEqual([]);
  });

  it('returns at least one result when candles.length === period + 1', () => {
    const candles = flatCandles(Array(15).fill(100).map((_, i) => 100 + i));
    expect(calcRSI(candles, 14).length).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(calcRSI([], 14)).toEqual([]);
  });

  it('output length equals candles.length - period', () => {
    const candles = flatCandles(Array(30).fill(0).map((_, i) => i));
    expect(calcRSI(candles, 14).length).toBe(30 - 14);
  });

  it('RSI is 100 when all candles are strictly rising (no losses)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = calcRSI(flatCandles(closes), 14);
    result.forEach(p => expect(p.value).toBeCloseTo(100, 5));
  });

  it('RSI is 0 when all candles are strictly falling (no gains)', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 200 - i);
    const result = calcRSI(flatCandles(closes), 14);
    result.forEach(p => expect(p.value).toBeCloseTo(0, 5));
  });

  it('RSI values stay within [0, 100]', () => {
    const candles = alternatingCandles(50);
    const result = calcRSI(candles, 14);
    result.forEach(p => {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    });
  });

  it('timestamps align with candle[period..n-1]', () => {
    const candles = flatCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    const result = calcRSI(candles, 14);
    expect(result[0].timestamp).toBe(candles[14].timestamp);
  });

  it('uses default period of 14 when period argument is omitted', () => {
    const candles = flatCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(calcRSI(candles).length).toBe(6);
  });
});

// ─── calcSMA ──────────────────────────────────────────────────────────────
// Simple moving average of close prices.
// Returns null when candles.length < period.

describe('calcSMA', () => {
  it('returns null when fewer candles than period', () => {
    const candles = flatCandles(Array(4).fill(100));
    expect(calcSMA(candles, 5, 'sma', '#fff')).toBeNull();
  });

  it('output data length equals candles.length - period + 1', () => {
    const candles = flatCandles(Array(10).fill(100));
    const result = calcSMA(candles, 3, 'sma', '#fff')!;
    expect(result.data.length).toBe(8);
  });

  it('correctly averages a flat price series', () => {
    const candles = flatCandles(Array(5).fill(10));
    const result = calcSMA(candles, 3, 'sma', '#fff')!;
    result.data.forEach(p => expect(p.value).toBe(10));
  });

  it('correctly averages a linearly increasing series', () => {
    // closes: [1,2,3,4,5], period 3 → windows [1,2,3]=2, [2,3,4]=3, [3,4,5]=4
    const candles = flatCandles([1, 2, 3, 4, 5]);
    const result = calcSMA(candles, 3, 'sma', '#fff')!;
    expect(result.data.map(p => p.value)).toEqual([2, 3, 4]);
  });

  it('returns correct id, name, and color', () => {
    const candles = flatCandles(Array(5).fill(10));
    const result = calcSMA(candles, 3, 'my-sma', '#aabbcc')!;
    expect(result.id).toBe('my-sma');
    expect(result.name).toBe('SMA(3)');
    expect(result.color).toBe('#aabbcc');
  });

  it('works when period equals candles length (single output point)', () => {
    const candles = flatCandles([2, 4, 6]);
    const result = calcSMA(candles, 3, 'sma', '#fff')!;
    expect(result.data.length).toBe(1);
    expect(result.data[0].value).toBe(4);
  });
});

// ─── calcEMA ──────────────────────────────────────────────────────────────
// Exponential moving average. Seeded with SMA of first `period` closes.
// k = 2 / (period + 1).

describe('calcEMA', () => {
  it('returns null when fewer candles than period', () => {
    expect(calcEMA(flatCandles(Array(4).fill(100)), 5, 'ema', '#fff')).toBeNull();
  });

  it('output data length equals candles.length - period + 1', () => {
    const candles = flatCandles(Array(10).fill(100));
    const result = calcEMA(candles, 3, 'ema', '#fff')!;
    expect(result.data.length).toBe(8);
  });

  it('first EMA value equals SMA of first period candles (seed)', () => {
    // closes [1,2,3,4,5], period 3: seed SMA = (1+2+3)/3 = 2
    const candles = flatCandles([1, 2, 3, 4, 5]);
    const result = calcEMA(candles, 3, 'ema', '#fff')!;
    expect(result.data[0].value).toBeCloseTo(2, 10);
  });

  it('EMA converges toward constant price', () => {
    // After enough candles at price 50, EMA should approach 50
    const candles = flatCandles(Array(100).fill(50));
    const result = calcEMA(candles, 5, 'ema', '#fff')!;
    const last = result.data[result.data.length - 1];
    expect(last.value).toBeCloseTo(50, 5);
  });

  it('EMA reacts faster than SMA to a price spike', () => {
    // Flat at 100 then sudden spike to 200 — EMA should move more than SMA
    const closes = [...Array(20).fill(100), 200];
    const candles = flatCandles(closes);
    const ema = calcEMA(candles, 5, 'ema', '#fff')!;
    const sma = calcSMA(candles, 5, 'sma', '#fff')!;
    const emaLast = ema.data[ema.data.length - 1].value;
    const smaLast = sma.data[sma.data.length - 1].value;
    expect(emaLast).toBeGreaterThan(smaLast);
  });

  it('returns correct id, name, color', () => {
    const result = calcEMA(flatCandles(Array(5).fill(10)), 3, 'my-ema', '#ff0000')!;
    expect(result.id).toBe('my-ema');
    expect(result.name).toBe('EMA(3)');
    expect(result.color).toBe('#ff0000');
  });
});

// ─── calcBollingerBands ───────────────────────────────────────────────────
// Bollinger Bands: basis = SMA, upper = basis + k*stddev, lower = basis - k*stddev.

describe('calcBollingerBands', () => {
  const colors = { upper: '#red', lower: '#blue', basis: '#white' };

  it('returns null when fewer candles than period', () => {
    expect(calcBollingerBands(flatCandles(Array(4).fill(100)), 5, 2, colors)).toBeNull();
  });

  it('returns three bands: basis, upper, lower', () => {
    const result = calcBollingerBands(flatCandles(Array(20).fill(100)), 5, 2, colors)!;
    expect(result).toHaveProperty('basis');
    expect(result).toHaveProperty('upper');
    expect(result).toHaveProperty('lower');
  });

  it('all three bands have equal data length', () => {
    const candles = flatCandles(Array(20).fill(100));
    const { basis, upper, lower } = calcBollingerBands(candles, 5, 2, colors)!;
    expect(basis.data.length).toBe(upper.data.length);
    expect(upper.data.length).toBe(lower.data.length);
  });

  it('on flat price, upper and lower are symmetric around basis', () => {
    const candles = flatCandles(Array(20).fill(100));
    const { basis, upper, lower } = calcBollingerBands(candles, 5, 2, colors)!;
    basis.data.forEach((b, i) => {
      const bandWidth = upper.data[i].value - b.value;
      const lowerDiff = b.value - lower.data[i].value;
      expect(bandWidth).toBeCloseTo(lowerDiff, 10);
    });
  });

  it('on flat price, stddev is 0 so all bands collapse to same value', () => {
    const candles = flatCandles(Array(20).fill(50));
    const { basis, upper, lower } = calcBollingerBands(candles, 5, 2, colors)!;
    basis.data.forEach((b, i) => {
      expect(upper.data[i].value).toBeCloseTo(b.value, 10);
      expect(lower.data[i].value).toBeCloseTo(b.value, 10);
    });
  });

  it('upper is always >= basis and lower is always <= basis', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
    const { basis, upper, lower } = calcBollingerBands(flatCandles(closes), 5, 2, colors)!;
    basis.data.forEach((b, i) => {
      expect(upper.data[i].value).toBeGreaterThanOrEqual(b.value);
      expect(lower.data[i].value).toBeLessThanOrEqual(b.value);
    });
  });

  it('multiplier scales band width proportionally', () => {
    const candles = flatCandles(Array.from({ length: 20 }, (_, i) => i));
    const bb1 = calcBollingerBands(candles, 5, 1, colors)!;
    const bb2 = calcBollingerBands(candles, 5, 2, colors)!;
    const width1 = bb1.upper.data[0].value - bb1.lower.data[0].value;
    const width2 = bb2.upper.data[0].value - bb2.lower.data[0].value;
    expect(width2).toBeCloseTo(width1 * 2, 10);
  });

  it('assigns correct ids to each band', () => {
    const result = calcBollingerBands(flatCandles(Array(20).fill(100)), 5, 2, colors)!;
    expect(result.basis.id).toBe('bb-basis');
    expect(result.upper.id).toBe('bb-upper');
    expect(result.lower.id).toBe('bb-lower');
  });

  it('assigns the provided colors to each band', () => {
    const c = { upper: '#U', lower: '#L', basis: '#B' };
    const result = calcBollingerBands(flatCandles(Array(20).fill(100)), 5, 2, c)!;
    expect(result.upper.color).toBe('#U');
    expect(result.lower.color).toBe('#L');
    expect(result.basis.color).toBe('#B');
  });
});
