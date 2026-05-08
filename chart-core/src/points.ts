/**
 * Pixel-geometry builders shared across all renderers (Skia, SVG, Canvas 2D).
 *
 * Every function here produces plain numbers/objects — no rendering primitives,
 * no Skia imports, no React.  Renderers consume the output and draw their own
 * platform-specific primitives.
 */

import type { Candle, TsPoint } from './types';
import { getCandleX, getSeriesX, getY } from './layout';

export interface Point {
  x: number;
  y: number;
}

/** Full geometry for a single candlestick bar, ready to hand to any renderer. */
export interface CandleBar {
  /** Center X of the candle slot */
  x: number;
  /** Wick: y1 = high pixel (smaller y), y2 = low pixel (larger y) */
  wick: { y1: number; y2: number };
  /** Body: top-left y and height in pixels */
  body: { y: number; height: number };
  /** Body width in pixels */
  width: number;
  /** true = bullish (close ≥ open) */
  up: boolean;
  /** Resolved fill/stroke color — comes from the caller's theme */
  color: string;
}

// ─── Index helpers ────────────────────────────────────────────────────────

/**
 * Build a timestamp → array-index lookup for fast O(1) mapping.
 * Pre-build this once per visible-candle set and pass it to the series builders.
 */
export function buildTimestampIndex(candleData: Candle[]): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < candleData.length; i++) m.set(candleData[i].timestamp, i);
  return m;
}

// ─── Series / indicator lines ─────────────────────────────────────────────

/**
 * Convert time-series points to pixel coordinates.
 *
 * Only points whose timestamp matches a visible candle are included —
 * this keeps indicator lines clipped to the visible window.
 * Use buildTimestampIndex() once per candle set and pass the result here.
 */
export function buildSeriesPoints(
  data: TsPoint[],
  indexByTimestamp: Map<number, number>,
  total: number,
  width: number,
  height: number,
  min: number,
  max: number
): Point[] {
  const pts: Point[] = [];
  for (const pt of data) {
    const idx = indexByTimestamp.get(pt.timestamp);
    if (idx === undefined) continue;
    pts.push({
      x: getSeriesX(idx, total, width),
      y: getY(pt.value, min, max, height),
    });
  }
  return pts;
}

/**
 * Convert candle close prices to pixel coordinates for a line-chart.
 *
 * Uses getCandleX (centre-aligned) so the line aligns with candlestick bodies
 * when toggling between chart types.
 */
export function buildLinePoints(
  data: Candle[],
  width: number,
  height: number,
  priceMin: number,
  priceMax: number
): Point[] {
  const total = data.length;
  return data.map((c, i) => ({
    x: getCandleX(i, total, width),
    y: getY(c.close, priceMin, priceMax, height),
  }));
}

// ─── Shaded areas ─────────────────────────────────────────────────────────

/**
 * Build the top and bottom edge points for a shaded band (e.g. Bollinger Bands fill).
 *
 * The `bottom` array is already reversed so callers can concatenate
 * top + bottom to form a closed polygon without extra sorting:
 *   [from_0, from_1, …, to_N, to_N-1, …, to_0]
 */
export function buildShadedAreaPoints(
  from: TsPoint[],
  to: TsPoint[],
  indexByTimestamp: Map<number, number>,
  total: number,
  width: number,
  height: number,
  min: number,
  max: number
): { top: Point[]; bottom: Point[] } {
  const top: Point[] = [];
  for (const p of from) {
    const idx = indexByTimestamp.get(p.timestamp);
    if (idx === undefined) continue;
    top.push({ x: getSeriesX(idx, total, width), y: getY(p.value, min, max, height) });
  }

  // Reversed so concatenating top + bottom traces a closed outline
  const bottom: Point[] = [];
  for (let i = to.length - 1; i >= 0; i--) {
    const p = to[i];
    const idx = indexByTimestamp.get(p.timestamp);
    if (idx === undefined) continue;
    bottom.push({ x: getSeriesX(idx, total, width), y: getY(p.value, min, max, height) });
  }

  return { top, bottom };
}

// ─── MACD histogram geometry ──────────────────────────────────────────────

/** Pixel geometry for a single MACD histogram bar. */
export interface MacdHistogramBar {
  /** Left edge of the bar in pixels */
  x: number;
  /** Top edge of the bar in pixels (smaller y = higher on screen) */
  y: number;
  /** Bar width in pixels */
  width: number;
  /** Bar height in pixels (always positive) */
  height: number;
  /** true when the histogram value is ≥ 0 (bullish momentum) */
  isPositive: boolean;
}

/**
 * Convert MACD histogram TsPoints into pixel-rect geometry ready for any renderer.
 *
 * Each bar spans from the zero line to the histogram value.  Bars are 60 % of
 * the candle slot width, centred on the candle X position.
 *
 * @param histogram        Histogram TsPoints from calcMACD()
 * @param indexByTimestamp Pre-built timestamp → array-index map (buildTimestampIndex)
 * @param total            Total number of candles in the visible window
 * @param width            Pixel width of the panel
 * @param height           Pixel height of the panel
 * @param yMin             Bottom of the Y range (should be negative, from computeMacdYRange)
 * @param yMax             Top of the Y range (should be positive, from computeMacdYRange)
 * @param zeroY            Pixel Y position of the zero line (getY(0, yMin, yMax, height))
 */
export function buildMacdHistogramBars(
  histogram: { timestamp: number; value: number }[],
  indexByTimestamp: Map<number, number>,
  total: number,
  width: number,
  height: number,
  yMin: number,
  yMax: number,
  zeroY: number,
): MacdHistogramBar[] {
  const slotWidth = total > 0 ? width / total : 0;
  const bars: MacdHistogramBar[] = [];

  for (const p of histogram) {
    const idx = indexByTimestamp.get(p.timestamp);
    if (idx === undefined) continue;

    const centerX = getCandleX(idx, total, width);
    const barWidth = Math.max(1, slotWidth * 0.6);
    const valueY = getY(p.value, yMin, yMax, height);
    const isPositive = p.value >= 0;

    bars.push({
      x:          centerX - barWidth / 2,
      y:          isPositive ? valueY : zeroY,
      width:      barWidth,
      height:     Math.max(1, Math.abs(valueY - zeroY)),
      isPositive,
    });
  }

  return bars;
}

// ─── Candlesticks ─────────────────────────────────────────────────────────

/**
 * Compute pixel geometry for every candle.
 *
 * Colors come from the caller (theme system) rather than being hard-coded here,
 * so this function stays pure and renderer/theme-agnostic.
 *
 * @param colorUp   Fill color for bullish candles — defaults to the standard green.
 * @param colorDown Fill color for bearish candles — defaults to the standard red.
 */
export function buildCandleGeometry(
  data: Candle[],
  width: number,
  height: number,
  priceMin: number,
  priceMax: number,
  colorUp = '#4caf50',
  colorDown = '#ef5350'
): CandleBar[] {
  const total = data.length;
  // Each candle occupies an equal slot; body is 60 % of the slot for visual spacing
  const spacing = width / Math.max(1, total);
  const bodyW = Math.max(1, spacing * 0.6);

  return data.map((c, i) => {
    const x = getCandleX(i, total, width);
    const yOpen  = getY(c.open,  priceMin, priceMax, height);
    const yClose = getY(c.close, priceMin, priceMax, height);
    const yHigh  = getY(c.high,  priceMin, priceMax, height);
    const yLow   = getY(c.low,   priceMin, priceMax, height);
    const up = c.close >= c.open;

    return {
      x,
      // y1 = high = smaller pixel value (top of chart), y2 = low = larger pixel value
      wick: { y1: yHigh, y2: yLow },
      // Body top = min(open, close) pixel; clamp height to ≥ 1 so doji are visible
      body: { y: Math.min(yOpen, yClose), height: Math.max(1, Math.abs(yClose - yOpen)) },
      width: bodyW,
      up,
      color: up ? colorUp : colorDown,
    };
  });
}
