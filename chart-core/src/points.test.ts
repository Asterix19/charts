import {
  buildTimestampIndex,
  buildSeriesPoints,
  buildShadedAreaPoints,
  buildCandleGeometry,
  buildMarkerPoints,
  buildVolumeBars,
} from './points';
import type { Candle, ChartMarker, TsPoint } from './types';

// ─── helpers ──────────────────────────────────────────────────────────────

const candle = (ts: number, o = 100, h = 110, l = 90, c = 105): Candle => ({
  timestamp: ts,
  open: o,
  high: h,
  low: l,
  close: c,
});

const makeCandles = (n: number, startTs = 1000, step = 60_000): Candle[] =>
  Array.from({ length: n }, (_, i) => candle(startTs + i * step));

const pt = (ts: number, value: number): TsPoint => ({ timestamp: ts, value });

// ─── buildTimestampIndex ───────────────────────────────────────────────────
// O(1) lookup map from candle timestamp → its position in the visible array.

describe('buildTimestampIndex', () => {
  const candles = makeCandles(5, 1000, 100);

  it('maps each candle timestamp to its array index', () => {
    const idx = buildTimestampIndex(candles);
    candles.forEach((c, i) => expect(idx.get(c.timestamp)).toBe(i));
  });

  it('returns a Map of the same size as the input', () => {
    expect(buildTimestampIndex(candles).size).toBe(5);
  });

  it('returns an empty Map for empty input', () => {
    expect(buildTimestampIndex([]).size).toBe(0);
  });

  it('returns undefined for a timestamp not in the array', () => {
    const idx = buildTimestampIndex(candles);
    expect(idx.get(9999999)).toBeUndefined();
  });

  it('later duplicates overwrite earlier ones (last-wins)', () => {
    const dup = [candle(1000), candle(1000)]; // same timestamp twice
    const idx = buildTimestampIndex(dup);
    // Second candle (index 1) overwrites the first
    expect(idx.get(1000)).toBe(1);
  });
});

// ─── buildSeriesPoints ────────────────────────────────────────────────────
// Converts time-series (indicator) data to pixel {x, y} coordinates.

describe('buildSeriesPoints', () => {
  const candles = makeCandles(5, 0, 100);
  const idx = buildTimestampIndex(candles);
  const total = candles.length;
  const width = 400;
  const height = 300;

  it('produces one Point for each matching timestamp', () => {
    const data = candles.map(c => pt(c.timestamp, c.close));
    expect(buildSeriesPoints(data, idx, total, width, height, 90, 110).length).toBe(5);
  });

  it('skips points whose timestamp is not in the index', () => {
    const data = [pt(9999, 100)]; // timestamp not in candles
    expect(buildSeriesPoints(data, idx, total, width, height, 90, 110).length).toBe(0);
  });

  it('first point maps to x=0 (edge-based series positioning)', () => {
    const data = [pt(candles[0].timestamp, 100)];
    const pts = buildSeriesPoints(data, idx, total, width, height, 90, 110);
    expect(pts[0].x).toBe(0);
  });

  it('last point maps to x=chartWidth', () => {
    const data = [pt(candles[4].timestamp, 100)];
    const pts = buildSeriesPoints(data, idx, total, width, height, 90, 110);
    expect(pts[0].x).toBe(width);
  });

  it('value equal to max price maps to y=0 (top of chart)', () => {
    const data = [pt(candles[0].timestamp, 110)];
    const pts = buildSeriesPoints(data, idx, total, width, height, 90, 110);
    expect(pts[0].y).toBe(0);
  });

  it('value equal to min price maps to y=chartHeight (bottom)', () => {
    const data = [pt(candles[0].timestamp, 90)];
    const pts = buildSeriesPoints(data, idx, total, width, height, 90, 110);
    expect(pts[0].y).toBe(height);
  });

  it('returns empty array for empty data', () => {
    expect(buildSeriesPoints([], idx, total, width, height, 90, 110)).toEqual([]);
  });
});

// ─── buildShadedAreaPoints ────────────────────────────────────────────────
// Builds two polygon edge arrays (top/bottom) for a shaded band.
// bottom is already reversed so top+bottom forms a closed polygon.

describe('buildShadedAreaPoints', () => {
  const candles = makeCandles(4, 0, 100);
  const idx = buildTimestampIndex(candles);
  const fromData = candles.map(c => pt(c.timestamp, 110)); // upper band
  const toData   = candles.map(c => pt(c.timestamp, 90));  // lower band

  it('top array length equals number of matching from-points', () => {
    const { top } = buildShadedAreaPoints(fromData, toData, idx, 4, 400, 300, 80, 120);
    expect(top.length).toBe(4);
  });

  it('bottom array length equals number of matching to-points', () => {
    const { bottom } = buildShadedAreaPoints(fromData, toData, idx, 4, 400, 300, 80, 120);
    expect(bottom.length).toBe(4);
  });

  it('bottom is in reverse order of to-data (for closed polygon)', () => {
    const { bottom } = buildShadedAreaPoints(fromData, toData, idx, 4, 400, 300, 80, 120);
    // Last candle timestamp → first bottom point
    expect(bottom[0].x).toBeGreaterThan(bottom[bottom.length - 1].x);
  });

  it('top y-values are above bottom y-values (higher price = smaller y)', () => {
    const { top, bottom } = buildShadedAreaPoints(fromData, toData, idx, 4, 400, 300, 80, 120);
    top.forEach((t, i) => {
      // bottom is reversed, so we can't compare index-for-index directly;
      // but we know from's prices > to's prices → from y < to y
      const matchingBottom = buildShadedAreaPoints(fromData, toData, idx, 4, 400, 300, 80, 120)
        .bottom.slice().reverse();
      expect(t.y).toBeLessThan(matchingBottom[i].y);
    });
  });

  it('returns empty top and bottom when no timestamps match', () => {
    const unknownData = [pt(999999, 100)];
    const { top, bottom } = buildShadedAreaPoints(unknownData, unknownData, idx, 4, 400, 300, 80, 120);
    expect(top).toEqual([]);
    expect(bottom).toEqual([]);
  });
});

// ─── buildCandleGeometry ──────────────────────────────────────────────────
// Derives pixel geometry for every candle: x, wick, body, width, direction, color.

describe('buildCandleGeometry', () => {
  const candles = makeCandles(5, 0, 100);

  it('returns one CandleBar per candle', () => {
    expect(buildCandleGeometry(candles, 400, 300, 90, 110).length).toBe(5);
  });

  it('bullish candle (close >= open) is marked up=true and green', () => {
    const bull = candle(0, 100, 110, 90, 105); // close > open
    const bars = buildCandleGeometry([bull], 400, 300, 90, 110);
    expect(bars[0].up).toBe(true);
    expect(bars[0].color).toBe('#4caf50');
  });

  it('bearish candle (close < open) is marked up=false and red', () => {
    const bear = candle(0, 105, 110, 90, 100); // close < open
    const bars = buildCandleGeometry([bear], 400, 300, 90, 110);
    expect(bars[0].up).toBe(false);
    expect(bars[0].color).toBe('#ef5350');
  });

  it('doji candle (close === open) is treated as bullish (up=true)', () => {
    const doji = candle(0, 100, 110, 90, 100); // close === open
    const bars = buildCandleGeometry([doji], 400, 300, 90, 110);
    expect(bars[0].up).toBe(true);
  });

  it('body height is at least 1 pixel (minimum clamp)', () => {
    // Doji: open == close → body height would be 0, clamp to 1
    const doji = candle(0, 100, 110, 90, 100);
    const bars = buildCandleGeometry([doji], 400, 300, 90, 110);
    expect(bars[0].body.height).toBeGreaterThanOrEqual(1);
  });

  it('wick y1 is above wick y2 (y1=high=small y, y2=low=large y)', () => {
    const bars = buildCandleGeometry(candles, 400, 300, 90, 110);
    bars.forEach(b => expect(b.wick.y1).toBeLessThanOrEqual(b.wick.y2));
  });

  it('body y is the min of open/close pixel values', () => {
    // For a bullish candle, body.y should be the top (open < close → open y > close y,
    // so body.y = min(yOpen, yClose) = yClose)
    const bull = candle(0, 95, 110, 85, 105);
    const bars = buildCandleGeometry([bull], 400, 300, 80, 120);
    const yOpen  = ((120 - 95) / 40) * 300;
    const yClose = ((120 - 105) / 40) * 300;
    expect(bars[0].body.y).toBeCloseTo(Math.min(yOpen, yClose), 5);
  });

  it('candle body width is approximately 60% of slot width', () => {
    const bars = buildCandleGeometry(makeCandles(10), 400, 300, 90, 110);
    const expectedBodyW = Math.max(1, (400 / 10) * 0.6);
    bars.forEach(b => expect(b.width).toBeCloseTo(expectedBodyW, 5));
  });

  it('returns empty array for empty input', () => {
    expect(buildCandleGeometry([], 400, 300, 90, 110)).toEqual([]);
  });
});

// ─── buildMarkerPoints ─────────────────────────────────────────────────────
// Maps ChartMarkers to pixel coords via getCandleX/getY — same clipping
// convention as buildSeriesPoints (only markers matching a visible timestamp).

describe('buildMarkerPoints', () => {
  const candles = makeCandles(5, 0, 100);
  const idx = buildTimestampIndex(candles);
  const total = candles.length;
  const width = 400;
  const height = 300;

  const marker = (ts: number, price: number, kind: ChartMarker['kind'] = 'entry-long'): ChartMarker => ({
    timestamp: ts,
    price,
    kind,
  });

  it('produces one MarkerPoint per matching timestamp', () => {
    const markers = [marker(candles[0].timestamp, 100), marker(candles[2].timestamp, 105)];
    expect(buildMarkerPoints(markers, idx, total, width, height, 90, 110).length).toBe(2);
  });

  it('skips markers whose timestamp is not in the index', () => {
    const markers = [marker(9999, 100)];
    expect(buildMarkerPoints(markers, idx, total, width, height, 90, 110).length).toBe(0);
  });

  it('uses getCandleX (center-based) for x, matching the candle layer', () => {
    const markers = [marker(candles[0].timestamp, 100)];
    const pts = buildMarkerPoints(markers, idx, total, width, height, 90, 110);
    expect(pts[0].x).toBe(width / total / 2);
  });

  it('maps price via getY, independent of the candle OHLC values', () => {
    const markers = [marker(candles[0].timestamp, 110)];
    const pts = buildMarkerPoints(markers, idx, total, width, height, 90, 110);
    expect(pts[0].y).toBe(0);
  });

  it('carries kind and label through to the output point', () => {
    const markers = [{ ...marker(candles[0].timestamp, 100, 'stop-loss'), label: 'SL' }];
    const pts = buildMarkerPoints(markers, idx, total, width, height, 90, 110);
    expect(pts[0].kind).toBe('stop-loss');
    expect(pts[0].label).toBe('SL');
  });

  it('returns empty array for empty markers', () => {
    expect(buildMarkerPoints([], idx, total, width, height, 90, 110)).toEqual([]);
  });
});

// ─── buildVolumeBars ───────────────────────────────────────────────────────
// Anchored at yMin=0; bar color follows candle direction (up/down).

describe('buildVolumeBars', () => {
  const withVolume = (vols: number[]): Candle[] =>
    makeCandles(vols.length, 0, 100).map((c, i) => ({ ...c, volume: vols[i] }));

  it('returns one VolumeBar per candle', () => {
    expect(buildVolumeBars(withVolume([10, 20, 30]), 400, 300, 30).length).toBe(3);
  });

  it('bar reaching yMax has y=0 (fills the full panel height)', () => {
    const bars = buildVolumeBars(withVolume([30]), 400, 300, 30);
    expect(bars[0].y).toBe(0);
    expect(bars[0].height).toBeCloseTo(300, 5);
  });

  it('zero volume produces a near-zero-height bar at the bottom', () => {
    const bars = buildVolumeBars(withVolume([0]), 400, 300, 30);
    expect(bars[0].y).toBeCloseTo(300, 5);
    expect(bars[0].height).toBeGreaterThanOrEqual(1);
  });

  it('missing volume is treated as 0', () => {
    const bars = buildVolumeBars(makeCandles(1, 0, 100), 400, 300, 30);
    expect(bars[0].y).toBeCloseTo(300, 5);
  });

  it('bullish candle (close >= open) uses colorUp', () => {
    const bull: Candle = { timestamp: 0, open: 100, high: 110, low: 90, close: 105, volume: 10 };
    const bars = buildVolumeBars([bull], 400, 300, 30, '#UP', '#DOWN');
    expect(bars[0].color).toBe('#UP');
  });

  it('bearish candle (close < open) uses colorDown', () => {
    const bear: Candle = { timestamp: 0, open: 105, high: 110, low: 90, close: 100, volume: 10 };
    const bars = buildVolumeBars([bear], 400, 300, 30, '#UP', '#DOWN');
    expect(bars[0].color).toBe('#DOWN');
  });

  it('bar width is approximately 60% of slot width, same as candle bodies', () => {
    const bars = buildVolumeBars(withVolume(Array(10).fill(5)), 400, 300, 10);
    const expectedWidth = Math.max(1, (400 / 10) * 0.6);
    bars.forEach((b) => expect(b.width).toBeCloseTo(expectedWidth, 5));
  });

  it('returns empty array for empty input', () => {
    expect(buildVolumeBars([], 400, 300, 30)).toEqual([]);
  });
});
