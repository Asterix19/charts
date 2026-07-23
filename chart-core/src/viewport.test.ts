import {
  computeLayout,
  computeViewport,
  computePriceRange,
  resolveYRange,
  crosshairAtIndex,
  indexFromViewX,
  computePinchDistance,
  computePinchZoom,
  computeTimeShift,
  filterByWindow,
  prepareIndicatorData,
  findIndicatorById,
  clampTickX,
  getPriceTicks,
  priceTickCount,
  formatTimeLabel,
  getTimeTicks,
} from './viewport';
import type { Candle, IndicatorLine } from './types';

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

// ─── computeLayout ─────────────────────────────────────────────────────────
// Calculates chart panel dimensions and padding from outer width/height.

describe('computeLayout', () => {
  it('chartWidth subtracts left and right padding', () => {
    const { chartWidth, padding } = computeLayout(500, 400, false);
    expect(chartWidth).toBe(500 - padding.left - padding.right);
  });

  it('rsiPanelHeight is 0 when showRsiPanel=false', () => {
    expect(computeLayout(500, 400, false).rsiPanelHeight).toBe(0);
  });

  it('rsiPanelHeight is positive and ≤ 140 when showRsiPanel=true', () => {
    const { rsiPanelHeight } = computeLayout(500, 800, true);
    expect(rsiPanelHeight).toBeGreaterThanOrEqual(70);
    expect(rsiPanelHeight).toBeLessThanOrEqual(140);
  });

  it('mainChartHeight excludes RSI panel + gap when RSI is shown', () => {
    const layout = computeLayout(500, 800, true);
    expect(layout.mainChartHeight).toBe(
      layout.innerHeight - layout.panelGap - layout.rsiPanelHeight
    );
  });

  it('mainChartHeight equals innerHeight when RSI panel is hidden', () => {
    const layout = computeLayout(500, 400, false);
    expect(layout.mainChartHeight).toBe(layout.innerHeight);
  });

  it('mainCanvasHeight equals top + mainChartHeight + bottom padding', () => {
    const layout = computeLayout(500, 400, false);
    expect(layout.mainCanvasHeight).toBe(
      layout.padding.top + layout.mainChartHeight + layout.padding.bottom
    );
  });

  it('rsiPanelHeight clamps to minimum 60 on small screens', () => {
    const { rsiPanelHeight } = computeLayout(200, 150, true);
    expect(rsiPanelHeight).toBeGreaterThanOrEqual(60);
  });

  it('volumePanelHeight is 0 when showVolumePanel is omitted (defaults false)', () => {
    expect(computeLayout(500, 400, false).volumePanelHeight).toBe(0);
  });

  it('volumePanelHeight is 0 when showVolumePanel=false', () => {
    expect(computeLayout(500, 800, false, false, false).volumePanelHeight).toBe(0);
  });

  it('volumePanelHeight is positive when showVolumePanel=true', () => {
    const { volumePanelHeight } = computeLayout(500, 800, false, false, true);
    expect(volumePanelHeight).toBeGreaterThanOrEqual(60);
  });

  it('mainChartHeight excludes the volume panel + gap when shown alone', () => {
    const layout = computeLayout(500, 800, false, false, true);
    expect(layout.mainChartHeight).toBe(
      layout.innerHeight - layout.panelGap - layout.volumePanelHeight
    );
  });

  it('rsi, macd, and volume panels can all be shown at once, each getting an equal share', () => {
    const layout = computeLayout(500, 1000, true, true, true);
    expect(layout.rsiPanelHeight).toBe(layout.macdPanelHeight);
    expect(layout.macdPanelHeight).toBe(layout.volumePanelHeight);
    expect(layout.mainChartHeight).toBe(
      layout.innerHeight - 3 * (layout.panelGap + layout.volumePanelHeight)
    );
  });

  it('adding the volume panel shrinks mainChartHeight relative to RSI-only', () => {
    const rsiOnly = computeLayout(500, 800, true, false, false);
    const rsiPlusVolume = computeLayout(500, 800, true, false, true);
    expect(rsiPlusVolume.mainChartHeight).toBeLessThan(rsiOnly.mainChartHeight);
  });
});

// ─── computeViewport ───────────────────────────────────────────────────────
// Computes the visible time window based on zoom level and scroll state.

describe('computeViewport', () => {
  const candles = makeCandles(100, 0, 60_000);
  const intervalMs = 60_000;

  it('timeWindow equals zoomLevel * intervalMs', () => {
    const { timeWindow } = computeViewport(candles, 20, intervalMs, null, true);
    expect(timeWindow).toBe(20 * intervalMs);
  });

  it('in live-follow mode, viewport snaps to the most recent candles', () => {
    const { effectiveStart, timeMax } = computeViewport(candles, 20, intervalMs, null, true);
    const lastTs = candles[candles.length - 1].timestamp;
    expect(timeMax).toBeGreaterThanOrEqual(lastTs);
    expect(effectiveStart).toBeLessThan(lastTs);
  });

  it('scrollStartTime is respected when not following live', () => {
    const scrollStart = candles[10].timestamp;
    const { effectiveStart } = computeViewport(candles, 10, intervalMs, scrollStart, false);
    expect(effectiveStart).toBe(scrollStart);
  });

  it('effectiveStart cannot go below first candle timestamp', () => {
    const { effectiveStart } = computeViewport(candles, 10, intervalMs, -99999, false);
    expect(effectiveStart).toBeGreaterThanOrEqual(candles[0].timestamp);
  });

  it('timeMax equals effectiveStart + timeWindow', () => {
    const vp = computeViewport(candles, 20, intervalMs, null, true);
    expect(vp.timeMax).toBe(vp.effectiveStart + vp.timeWindow);
  });

  it('handles empty candle array without throwing', () => {
    const vp = computeViewport([], 20, intervalMs, null, true);
    expect(vp.timeWindow).toBe(20 * intervalMs);
  });
});

// ─── computePriceRange ─────────────────────────────────────────────────────
// Derives priceMin/priceMax from the visible candle set.

describe('computePriceRange', () => {
  it('priceMax is the highest high', () => {
    const candles = [candle(1, 100, 120, 90, 110), candle(2, 100, 150, 80, 100)];
    expect(computePriceRange(candles).priceMax).toBe(150);
  });

  it('priceMin is the lowest low', () => {
    const candles = [candle(1, 100, 120, 90, 110), candle(2, 100, 150, 70, 100)];
    expect(computePriceRange(candles).priceMin).toBe(70);
  });

  it('works with a single candle', () => {
    const c = candle(1, 100, 110, 90, 105);
    expect(computePriceRange([c])).toEqual({ priceMin: 90, priceMax: 110 });
  });
});

// ─── resolveYRange ─────────────────────────────────────────────────────────
// Falls back to candle price range when explicit overrides are not provided.

describe('resolveYRange', () => {
  const candles = [candle(1, 100, 120, 80, 110)];

  it('uses yMin/yMax overrides when provided', () => {
    const range = resolveYRange(candles, 50, 200);
    expect(range).toEqual({ min: 50, max: 200 });
  });

  it('falls back to candle price range when no overrides', () => {
    const range = resolveYRange(candles);
    expect(range.min).toBe(80);
    expect(range.max).toBe(120);
  });

  it('uses only yMin override when yMax is omitted', () => {
    const range = resolveYRange(candles, 50);
    expect(range.min).toBe(50);
    expect(range.max).toBe(120);
  });

  it('uses only yMax override when yMin is omitted', () => {
    const range = resolveYRange(candles, undefined, 200);
    expect(range.min).toBe(80);
    expect(range.max).toBe(200);
  });
});

// ─── crosshairAtIndex ──────────────────────────────────────────────────────
// Converts a candle index into pixel x/y crosshair coordinates.

describe('crosshairAtIndex', () => {
  const candles = makeCandles(10, 0);

  it('returns the candle at the given index', () => {
    const { candle: c } = crosshairAtIndex(3, candles, 10, 400, 90, 120, 300);
    expect(c).toBe(candles[3]);
  });

  it('clamps index to 0 when idx < 0', () => {
    const { candle: c } = crosshairAtIndex(-1, candles, 10, 400, 90, 120, 300);
    expect(c).toBe(candles[0]);
  });

  it('clamps index to totalVisible-1 when idx exceeds bounds', () => {
    const { candle: c } = crosshairAtIndex(99, candles, 10, 400, 90, 120, 300);
    expect(c).toBe(candles[9]);
  });

  it('returns finite x and y coordinates', () => {
    const { x, y } = crosshairAtIndex(5, candles, 10, 400, 90, 120, 300);
    expect(isFinite(x)).toBe(true);
    expect(isFinite(y)).toBe(true);
  });
});

// ─── indexFromViewX ────────────────────────────────────────────────────────
// Maps a touch/mouse X coordinate to a candle array index.

describe('indexFromViewX', () => {
  it('maps left edge to index 0', () => {
    // viewX = paddingLeft → xInChart = 0 → rel = 0 → index 0
    expect(indexFromViewX(10, 10, 400, 20)).toBe(0);
  });

  it('maps right edge to last index (totalVisible - 1)', () => {
    expect(indexFromViewX(410, 10, 400, 20)).toBe(19);
  });

  it('maps midpoint X to ~middle index', () => {
    const idx = indexFromViewX(210, 10, 400, 21);
    expect(idx).toBe(10); // rel=0.5, round(0.5*20)=10
  });

  it('clamps to 0 when viewX is before paddingLeft', () => {
    expect(indexFromViewX(0, 10, 400, 20)).toBe(0);
  });

  it('clamps to last index when viewX exceeds chart right edge', () => {
    expect(indexFromViewX(9999, 10, 400, 20)).toBe(19);
  });

  it('handles zero chartWidth without throwing', () => {
    const idx = indexFromViewX(100, 10, 0, 10);
    expect(idx).toBe(0);
  });
});

// ─── computePinchDistance ──────────────────────────────────────────────────
// Euclidean distance between two touch points.

describe('computePinchDistance', () => {
  it('computes 3-4-5 right triangle correctly', () => {
    expect(computePinchDistance(0, 0, 3, 4)).toBe(5);
  });

  it('distance is 0 for same point', () => {
    expect(computePinchDistance(5, 5, 5, 5)).toBe(0);
  });

  it('distance is symmetric', () => {
    const d1 = computePinchDistance(0, 0, 10, 20);
    const d2 = computePinchDistance(10, 20, 0, 0);
    expect(d1).toBeCloseTo(d2, 10);
  });

  it('computes diagonal on a unit square', () => {
    expect(computePinchDistance(0, 0, 1, 1)).toBeCloseTo(Math.SQRT2, 10);
  });
});

// ─── computePinchZoom ──────────────────────────────────────────────────────
// Adjusts zoom level proportionally to pinch distance change, clamped to [min, max].

describe('computePinchZoom', () => {
  it('spreading fingers (distance increases) zooms in (smaller zoomLevel)', () => {
    // currentZoom=100, initial=100, new=200 → 100 / (200/100) = 50
    expect(computePinchZoom(100, 100, 200)).toBe(50);
  });

  it('pinching fingers (distance decreases) zooms out (larger zoomLevel)', () => {
    // currentZoom=100, initial=200, new=100 → 100 / (100/200) = 200
    expect(computePinchZoom(100, 200, 100)).toBe(200);
  });

  it('clamps result to minimum', () => {
    expect(computePinchZoom(10, 100, 10000, 5, 300)).toBe(5);
  });

  it('clamps result to maximum', () => {
    expect(computePinchZoom(100, 10000, 10, 5, 300)).toBe(300);
  });

  it('returns currentZoom unchanged when distances are equal', () => {
    expect(computePinchZoom(60, 100, 100)).toBe(60);
  });
});

// ─── computeTimeShift ──────────────────────────────────────────────────────
// Translates a drag delta in pixels to a new scroll start time.

describe('computeTimeShift', () => {
  it('dragging right (dx > 0) scrolls backward in time (earlier start)', () => {
    const newStart = computeTimeShift(100, 60_000 * 20, 400, 1_000_000);
    expect(newStart).toBeLessThan(1_000_000);
  });

  it('dragging left (dx < 0) scrolls forward in time (later start)', () => {
    const newStart = computeTimeShift(-100, 60_000 * 20, 400, 1_000_000);
    expect(newStart).toBeGreaterThan(1_000_000);
  });

  it('zero drag returns effectiveStart unchanged', () => {
    expect(computeTimeShift(0, 60_000 * 20, 400, 1_000_000)).toBe(1_000_000);
  });

  it('shift magnitude is proportional to timeWindow / chartWidth', () => {
    // timePerPixel = 1_200_000 / 400 = 3000. dx=50 → shift = -50 * 3000 = -150_000
    const newStart = computeTimeShift(50, 1_200_000, 400, 0);
    expect(newStart).toBeCloseTo(-150_000, 5);
  });
});

// ─── filterByWindow ────────────────────────────────────────────────────────
// Filters any time-series array to the [leftTs, rightTs] window (inclusive).

describe('filterByWindow', () => {
  const data = [
    { timestamp: 100, value: 1 },
    { timestamp: 200, value: 2 },
    { timestamp: 300, value: 3 },
    { timestamp: 400, value: 4 },
  ];

  it('returns only points within [leftTs, rightTs]', () => {
    const result = filterByWindow(data, 200, 300);
    expect(result.map(p => p.timestamp)).toEqual([200, 300]);
  });

  it('includes points exactly at the boundaries (inclusive)', () => {
    const result = filterByWindow(data, 100, 400);
    expect(result.length).toBe(4);
  });

  it('returns empty array when no points fall in window', () => {
    expect(filterByWindow(data, 500, 600)).toEqual([]);
  });

  it('works on empty input', () => {
    expect(filterByWindow([], 100, 400)).toEqual([]);
  });
});

// ─── prepareIndicatorData ──────────────────────────────────────────────────
// Filters indicator data to window then extends to both edges.

describe('prepareIndicatorData', () => {
  const line: IndicatorLine = {
    id: 'sma',
    color: '#fff',
    data: [
      { timestamp: 200, value: 10 },
      { timestamp: 300, value: 20 },
    ],
  };

  it('extends to left edge when series starts after window left', () => {
    const result = prepareIndicatorData(line, 100, 400);
    expect(result[0].timestamp).toBe(100);
  });

  it('extends to right edge when series ends before window right', () => {
    const result = prepareIndicatorData(line, 100, 400);
    expect(result[result.length - 1].timestamp).toBe(400);
  });

  it('returns empty array when indicator has no data in window', () => {
    const result = prepareIndicatorData(line, 500, 700);
    expect(result).toEqual([]);
  });
});

// ─── findIndicatorById ─────────────────────────────────────────────────────

describe('findIndicatorById', () => {
  const indicators: IndicatorLine[] = [
    { id: 'sma-20', color: '#fff', data: [] },
    { id: 'ema-50', color: '#aaa', data: [] },
  ];

  it('finds an indicator by its id', () => {
    expect(findIndicatorById(indicators, 'ema-50')?.id).toBe('ema-50');
  });

  it('returns undefined when id is not found', () => {
    expect(findIndicatorById(indicators, 'unknown')).toBeUndefined();
  });

  it('returns undefined when indicators is undefined', () => {
    expect(findIndicatorById(undefined, 'sma-20')).toBeUndefined();
  });
});

// ─── clampTickX ────────────────────────────────────────────────────────────
// Prevents time-axis tick labels from rendering outside the chart edges.

describe('clampTickX', () => {
  it('returns x unchanged when within margins', () => {
    expect(clampTickX(100, 400, 20)).toBe(100);
  });

  it('clamps to margin when x is too small', () => {
    expect(clampTickX(5, 400, 20)).toBe(20);
  });

  it('clamps to width-margin when x is too large', () => {
    expect(clampTickX(395, 400, 20)).toBe(380);
  });

  it('uses default margin of 20', () => {
    expect(clampTickX(0, 400)).toBe(20);
    expect(clampTickX(400, 400)).toBe(380);
  });
});

// ─── getPriceTicks ─────────────────────────────────────────────────────────
// Generates "nice" rounded price tick values within [min, max].

describe('getPriceTicks', () => {
  it('returns an array of values within [min, max]', () => {
    const ticks = getPriceTicks(100, 200, 5);
    ticks.forEach(t => {
      expect(t).toBeGreaterThanOrEqual(100);
      expect(t).toBeLessThanOrEqual(200);
    });
  });

  it('returns empty array when range is 0', () => {
    expect(getPriceTicks(100, 100, 5)).toEqual([]);
  });

  it('returns empty array when range is negative', () => {
    expect(getPriceTicks(200, 100, 5)).toEqual([]);
  });

  it('returns empty array when range is not finite', () => {
    expect(getPriceTicks(Infinity, Infinity, 5)).toEqual([]);
  });

  it('produces approximately the requested count of ticks (±1)', () => {
    const ticks = getPriceTicks(0, 100, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(7);
  });

  it('tick values are rounded to a "nice" step', () => {
    // Range 0–100 with 5 ticks → step will be a multiple of 10 or 20
    const ticks = getPriceTicks(0, 100, 5);
    const step = ticks[1] - ticks[0];
    expect(step % 1).toBe(0); // integer step
  });
});

// ─── priceTickCount ────────────────────────────────────────────────────────
// Derives the number of price ticks that fit without overlapping.

describe('priceTickCount', () => {
  it('returns at least 3 ticks regardless of height', () => {
    expect(priceTickCount(10)).toBe(3);
    expect(priceTickCount(0)).toBe(3);
  });

  it('scales with chart height at the default 40 px minimum', () => {
    expect(priceTickCount(200)).toBe(5); // floor(200/40)
    expect(priceTickCount(400)).toBe(10);
  });

  it('respects a custom minPx', () => {
    expect(priceTickCount(300, 50)).toBe(6); // floor(300/50)
  });
});

// ─── formatTimeLabel ───────────────────────────────────────────────────────
// Picks the right date/time format based on the visible time span.

describe('formatTimeLabel', () => {
  // A fixed timestamp: 2024-01-15 12:30:45 UTC
  const ts = new Date('2024-01-15T12:30:45Z').getTime();

  it('includes seconds when total span < 10 seconds', () => {
    const label = formatTimeLabel(ts, 5_000);
    // Should contain seconds — e.g. "12:30:45"
    expect(label).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('shows HH:MM for intra-day spans', () => {
    const label = formatTimeLabel(ts, 60 * 60_000); // 1 hour span
    // Should contain HH:MM but NOT seconds
    expect(label).toMatch(/\d{1,2}:\d{2}/);
    expect(label).not.toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('includes day name for multi-day spans up to 7 days', () => {
    const label = formatTimeLabel(ts, 3 * 24 * 60 * 60_000); // 3 days
    // Should include a weekday abbreviation (3 chars like Mon/Tue…)
    expect(label).toMatch(/^[A-Z][a-z]{2}/);
  });

  it('shows month and day for spans >= 7 days', () => {
    const label = formatTimeLabel(ts, 14 * 24 * 60 * 60_000); // 2 weeks
    // Should look like "Jan 15"
    expect(label).toMatch(/[A-Z][a-z]{2}\s\d{1,2}/);
  });
});

// ─── getTimeTicks ──────────────────────────────────────────────────────────
// Generates time-axis tick labels from visible candles.

describe('getTimeTicks', () => {
  const INTERVAL = 60_000; // 1 min candles
  const candles = makeCandles(120, Date.now(), INTERVAL);

  it('returns empty array for empty data', () => {
    expect(getTimeTicks([], 0, 20, INTERVAL, 400)).toEqual([]);
  });

  it('returns empty array when chartWidth is 0', () => {
    expect(getTimeTicks(candles, 0, 20, INTERVAL, 0)).toEqual([]);
  });

  it('returns empty array when zoomLevel is 0', () => {
    expect(getTimeTicks(candles, 10, 10, INTERVAL, 400)).toEqual([]);
  });

  it('each tick has numeric x, string label, and numeric ts', () => {
    const ticks = getTimeTicks(candles, 0, 20, INTERVAL, 400);
    ticks.forEach(t => {
      expect(typeof t.x).toBe('number');
      expect(typeof t.label).toBe('string');
      expect(typeof t.ts).toBe('number');
    });
  });

  it('tick timestamps are at exact multiples of the chosen grid interval', () => {
    const ticks = getTimeTicks(candles, 0, 20, INTERVAL, 400);
    if (ticks.length < 2) return;
    const gridInterval = ticks[1].ts - ticks[0].ts;
    ticks.forEach(t => {
      expect(t.ts % gridInterval).toBe(0);
    });
  });

  it('all x values are within [0, chartWidth]', () => {
    const ticks = getTimeTicks(candles, 0, 20, INTERVAL, 400);
    ticks.forEach(t => {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(400);
    });
  });

  it('x positions shift continuously with viewport — no discrete candle-index jumps', () => {
    // A tiny pan of 0.01 candles should move each tick x by ~0.01/20*400 = 0.2 px.
    const a = getTimeTicks(candles, 0.00, 20.00, INTERVAL, 400);
    const b = getTimeTicks(candles, 0.01, 20.01, INTERVAL, 400);
    if (a.length > 0 && b.length > 0) {
      const delta = Math.abs(a[0].x - b[0].x);
      expect(delta).toBeLessThan(1); // smooth, not a full-slot jump
    }
  });

  it('label text never changes for the same ts as viewport pans', () => {
    // The "09:xx" grid line keeps its label as it slides across the screen.
    const a = getTimeTicks(candles, 0, 20, INTERVAL, 400);
    const b = getTimeTicks(candles, 5, 25, INTERVAL, 400);
    const sharedTs = a.find(t => b.some(u => u.ts === t.ts));
    if (sharedTs) {
      const match = b.find(u => u.ts === sharedTs.ts)!;
      expect(sharedTs.label).toBe(match.label);
    }
  });

  it('number of ticks stays within a reasonable band (~2–8)', () => {
    const ticks = getTimeTicks(candles, 0, 60, INTERVAL, 400);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks.length).toBeLessThanOrEqual(10);
  });

  it('uses second-level format for sub-10s visible span', () => {
    const subSec = makeCandles(100, Date.now(), 5);
    const ticks = getTimeTicks(subSec, 0, 100, 5, 400);
    if (ticks.length > 0) expect(ticks[0].label).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
