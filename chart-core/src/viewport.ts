import type { Candle, IndicatorLine, LiveUpdateMode, TsPoint } from './types';
import { getCandleX, getY } from './layout';
import { extendToEdges, sameOhlc } from './utils';

// ─── Layout ───────────────────────────────────────────────────────────────

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartLayout {
  padding: ChartPadding;
  chartWidth: number;
  panelGap: number;
  innerHeight: number;
  rsiPanelHeight: number;
  macdPanelHeight: number;
  volumePanelHeight: number;
  mainChartHeight: number;
  /** Full height of the main chart canvas including padding (use for Canvas/Svg height prop) */
  mainCanvasHeight: number;
}

export function computeLayout(
  width: number,
  height: number,
  showRsiPanel: boolean,
  showMacdPanel = false,
  showVolumePanel = false,
): ChartLayout {
  const padding: ChartPadding = {
    top: 10,
    right: Math.round(Math.max(58, Math.min(72, width * 0.12))),
    bottom: 26,
    left: 0,
  };
  const chartWidth = width - padding.left - padding.right;
  const panelGap = 8;
  const innerHeight = height - padding.top - padding.bottom;

  const panelCount = (showVolumePanel ? 1 : 0) + (showRsiPanel ? 1 : 0) + (showMacdPanel ? 1 : 0);
  // Each sub-panel gets an equal share; shrinks gracefully as more are shown
  const subPanelH = panelCount > 0
    ? Math.max(60, Math.min(110, Math.floor(innerHeight * 0.18)))
    : 0;

  const volumePanelHeight = showVolumePanel ? subPanelH : 0;
  const rsiPanelHeight  = showRsiPanel  ? subPanelH : 0;
  const macdPanelHeight = showMacdPanel ? subPanelH : 0;
  const mainChartHeight = innerHeight - panelCount * (panelGap + subPanelH);
  const mainCanvasHeight = padding.top + mainChartHeight + padding.bottom;

  return { padding, chartWidth, panelGap, innerHeight, rsiPanelHeight, macdPanelHeight, volumePanelHeight, mainChartHeight, mainCanvasHeight };
}

// ─── Time window / viewport ───────────────────────────────────────────────

export interface ViewportWindow {
  timeWindow: number;
  effectiveStart: number;
  timeMin: number;
  timeMax: number;
}

export function computeViewport(
  sortedData: Candle[],
  zoomLevel: number,
  intervalMs: number,
  scrollStartTime: number | null,
  isFollowingLive: boolean
): ViewportWindow {
  const timeWindow = zoomLevel * intervalMs;
  const firstTimestamp = sortedData[0]?.timestamp ?? 0;
  const lastTimestamp = sortedData[sortedData.length - 1]?.timestamp ?? firstTimestamp;
  const latestStartTime = Math.max(firstTimestamp, lastTimestamp - timeWindow);

  const effectiveStart =
    isFollowingLive || scrollStartTime === null
      ? latestStartTime
      : Math.max(firstTimestamp, Math.min(scrollStartTime, lastTimestamp - timeWindow));

  return {
    timeWindow,
    effectiveStart,
    timeMin: effectiveStart,
    timeMax: effectiveStart + timeWindow,
  };
}

// ─── Price range ──────────────────────────────────────────────────────────

export function computePriceRange(visibleCandles: Candle[]): {
  priceMin: number;
  priceMax: number;
} {
  if (visibleCandles.length === 0) return { priceMin: 0, priceMax: 1 };
  let priceMax = -Infinity;
  let priceMin = Infinity;
  for (const c of visibleCandles) {
    if (c.high > priceMax) priceMax = c.high;
    if (c.low  < priceMin) priceMin = c.low;
  }
  return { priceMin, priceMax };
}

/**
 * Resolve the Y axis min/max for a layer.
 * Falls back to the candle price range when explicit overrides are not provided.
 */
export function resolveYRange(
  candleData: Candle[],
  yMin?: number,
  yMax?: number
): { min: number; max: number } {
  const { priceMin, priceMax } = computePriceRange(candleData);
  return { min: yMin ?? priceMin, max: yMax ?? priceMax };
}

// ─── Crosshair ────────────────────────────────────────────────────────────

export function crosshairAtIndex(
  idx: number,
  visibleCandles: Candle[],
  totalVisible: number,
  chartWidth: number,
  priceMin: number,
  priceMax: number,
  chartHeight: number
): { x: number; y: number; candle: Candle } {
  const i = Math.max(0, Math.min(totalVisible - 1, idx));
  const candle = visibleCandles[i];
  return {
    x: getCandleX(i, totalVisible, chartWidth),
    y: getY(candle.close, priceMin, priceMax, chartHeight),
    candle,
  };
}

export function indexFromViewX(
  viewX: number,
  paddingLeft: number,
  chartWidth: number,
  totalVisible: number
): number {
  const xInChart = viewX - paddingLeft;
  const clampedX = Math.max(0, Math.min(chartWidth, xInChart));
  const rel = chartWidth <= 0 ? 0 : clampedX / chartWidth;
  return Math.round(rel * (totalVisible - 1));
}

// ─── Gesture math ─────────────────────────────────────────────────────────

export function computePinchDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

export function computePinchZoom(
  currentZoom: number,
  initialDistance: number,
  newDistance: number,
  min = 5,
  max = 300
): number {
  if (initialDistance <= 0 || newDistance <= 0) return currentZoom;
  return Math.max(min, Math.min(max, currentZoom / (newDistance / initialDistance)));
}

/** Returns the new scrollStartTime after a drag. */
export function computeTimeShift(
  dx: number,
  timeWindow: number,
  chartWidth: number,
  effectiveStart: number
): number {
  const timePerPixel = timeWindow / Math.max(1, chartWidth);
  return effectiveStart + -dx * timePerPixel;
}

// ─── Buffer management ────────────────────────────────────────────────────

export interface BufferWindow {
  bufferStartTs: number;
  bufferEndTs: number;
  /** Updated anchor — write this back to your prevAnchor ref each render. */
  anchor: number;
}

/**
 * Computes the buffered time window around the current viewport.
 *
 * The buffer keeps extra candles pre-rendered on both sides of the visible
 * window so panning feels smooth (no redraws while the finger is down).
 * The anchor only moves when the viewport approaches within safeMarginRatio
 * of the buffer edge, minimising re-renders.
 *
 * @param prevAnchor - value from your anchor ref; pass null on first render
 */
export function computeBufferWindow(
  effectiveStart: number,
  zoomLevel: number,
  intervalMs: number,
  bufferRatio: number,
  prevAnchor: number | null,
  timeMin: number,
  timeMax: number,
  safeMarginRatio = 0.4,
): BufferWindow {
  const bufferSlots    = Math.ceil(zoomLevel * bufferRatio);
  const candidateAnchor = prevAnchor ?? effectiveStart;
  const bufferStart    = candidateAnchor - bufferSlots * intervalMs;
  const bufferEnd      = candidateAnchor + (zoomLevel + bufferSlots) * intervalMs;
  const safeMargin     = bufferSlots * intervalMs * safeMarginRatio;

  const anchor =
    prevAnchor === null ||
    timeMin < bufferStart + safeMargin ||
    timeMax > bufferEnd  - safeMargin
      ? effectiveStart
      : candidateAnchor;

  return {
    bufferStartTs: anchor - bufferSlots * intervalMs,
    bufferEndTs:   anchor + (zoomLevel + bufferSlots) * intervalMs,
    anchor,
  };
}

// ─── Viewport clamping ────────────────────────────────────────────────────

/**
 * Floating-point candle index viewport used by the chart renderer.
 * `start` and `end` are indices into sortedData (may be fractional).
 */
export interface CandleViewport {
  /** Index of the left-edge candle (inclusive, may be fractional) */
  start: number;
  /** Index past the right-edge candle (exclusive, may be fractional) */
  end: number;
}

/**
 * Clamp a CandleViewport so it stays within the available data and
 * the visible range stays between minVisibleCandles and dataLength.
 *
 * - Preserves the requested range when it fits; shrinks it only when the
 *   range falls outside [minVisibleCandles, dataLength].
 * - Slides start/end to keep the viewport inside [0, dataLength].
 */
export function clampViewport(
  viewport: CandleViewport,
  dataLength: number,
  minVisibleCandles: number,
): CandleViewport {
  if (dataLength <= 0) return { start: 0, end: 0 };

  const minRange = Math.min(minVisibleCandles, dataLength);
  const range = Math.max(minRange, Math.min(dataLength, viewport.end - viewport.start));

  let start = viewport.start;
  let end = start + range;

  if (start < 0) {
    start = 0;
    end = range;
  }

  if (end > dataLength) {
    end = dataLength;
    start = dataLength - range;
  }

  return { start, end };
}

// ─── Y-range helpers ──────────────────────────────────────────────────────

/**
 * Adds symmetric padding around a raw price range so candles don't sit flush
 * against the top and bottom edges of the chart.
 *
 * Returns `{ min: 0, max: 1 }` when either value is non-finite (e.g. empty data).
 */
export function buildPaddedRange(
  priceMin: number,
  priceMax: number,
  paddingRatio = 0.08,
): { min: number; max: number } {
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    return { min: 0, max: 1 };
  }
  const rawRange = priceMax - priceMin;
  const fallbackRange = rawRange > 0 ? rawRange : Math.max(Math.abs(priceMax), 1);
  const pad = fallbackRange * paddingRatio;
  return { min: priceMin - pad, max: priceMax + pad };
}

// ─── Data filtering helpers ───────────────────────────────────────────────

/**
 * Filter a timestamp-sorted array to [leftTs, rightTs] using binary search.
 * O(log n + k) instead of O(n), where k is the number of matching points.
 */
export function filterByWindow<T extends { timestamp: number }>(
  data: T[],
  leftTs: number,
  rightTs: number
): T[] {
  const n = data.length;
  if (n === 0) return [];

  // Lower bound: first index where timestamp >= leftTs
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (data[mid].timestamp < leftTs) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;

  // Upper bound: first index where timestamp > rightTs
  lo = start; hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (data[mid].timestamp <= rightTs) lo = mid + 1;
    else hi = mid;
  }

  return data.slice(start, lo);
}

/** Filter an indicator's data to the window then extend to both edges. */
export function prepareIndicatorData(
  line: IndicatorLine,
  leftTs: number,
  rightTs: number
): TsPoint[] {
  return extendToEdges(filterByWindow(line.data, leftTs, rightTs), leftTs, rightTs);
}

/** Find an indicator by id. Returns undefined if not found. */
export function findIndicatorById(
  indicators: IndicatorLine[] | undefined,
  id: string
): IndicatorLine | undefined {
  return indicators?.find((i) => i.id === id);
}

// ─── Axis ticks (shared between SVG and Skia AxisLayer) ──────────────────

/**
 * Clamp a time-axis tick X so its label never renders too close to the chart edges.
 */
export function clampTickX(x: number, width: number, margin = 20): number {
  return Math.min(width - margin, Math.max(margin, x));
}

export function getPriceTicks(min: number, max: number, count: number): number[] {
  const range = max - min;
  if (!isFinite(range) || range <= 0) return [];

  const roughStep = range / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 1e-12))));
  const niceStep = Math.ceil(roughStep / magnitude) * magnitude;

  const ticks: number[] = [];
  const start = Math.floor(min / niceStep) * niceStep;
  for (let val = start; val <= max; val += niceStep) ticks.push(val);
  return ticks;
}

/**
 * Returns how many price ticks fit in a given pixel height without overlapping.
 * Each label needs at least minPx vertical pixels.
 */
export function priceTickCount(chartHeight: number, minPx = 40): number {
  return Math.max(3, Math.floor(chartHeight / minPx));
}

/**
 * Formats a timestamp for a time-axis label, adapting to the total visible time span.
 *   < 10 s   → HH:MM:SS  (sub-second intervals)
 *   < 24 h   → HH:MM  (or h:MM AM/PM when hour12=true)
 *   < 7 d    → ddd HH:MM
 *   ≥ 7 d    → MMM DD
 */
export function formatTimeLabel(ts: number, totalSpanMs: number, hour12 = false): string {
  const d = new Date(ts);
  if (totalSpanMs < 10_000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12 });
  }
  if (totalSpanMs < 24 * 60 * 60_000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 });
  }
  if (totalSpanMs < 7 * 24 * 60 * 60_000) {
    return (
      d.toLocaleDateString([], { weekday: 'short' }) +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12 })
    );
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Ordered list of "nice" time boundaries used for grid line intervals.
const NICE_GRID_INTERVALS_MS = [
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000,
  60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
  3_600_000, 2 * 3_600_000, 4 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
  86_400_000, 2 * 86_400_000, 7 * 86_400_000,
];

function pickGridInterval(totalSpanMs: number, maxTicks: number): number {
  const rough = totalSpanMs / maxTicks;
  for (const iv of NICE_GRID_INTERVALS_MS) {
    if (iv >= rough) return iv;
  }
  return NICE_GRID_INTERVALS_MS[NICE_GRID_INTERVALS_MS.length - 1];
}

/**
 * Time-based sliding grid — the correct approach for trading charts.
 *
 * Grid lines are placed at absolute clock boundaries (09:00, 09:30, 10:00…).
 * As the viewport pans, lines slide left/right continuously; their label text
 * never changes. There are no discrete jumps — only smooth motion.
 *
 * `intervalMs` must be the detected candle interval (use resolveIntervalMs).
 * Returned `ts` is the absolute boundary timestamp — use it as the React key.
 */
export function getTimeTicks(
  sortedData: Candle[],
  viewportStart: number,
  viewportEnd: number,
  intervalMs: number,
  chartWidth: number,
  hour12 = false,
): { x: number; label: string; ts: number }[] {
  if (sortedData.length === 0 || chartWidth <= 0) return [];
  const zoomLevel = viewportEnd - viewportStart;
  if (zoomLevel <= 0) return [];

  // Interpolate absolute timestamps at the viewport edges.
  const firstTs  = sortedData[0].timestamp;
  const startTs  = firstTs + viewportStart * intervalMs;
  const endTs    = firstTs + viewportEnd   * intervalMs;
  const spanMs   = endTs - startTs;

  const maxTicks    = Math.max(2, Math.floor(chartWidth / 80));
  const gridInterval = pickGridInterval(spanMs, maxTicks);

  const firstBoundary = Math.ceil(startTs / gridInterval) * gridInterval;
  const ticks: { x: number; label: string; ts: number }[] = [];

  for (let t = firstBoundary; t <= endTs; t += gridInterval) {
    const x = ((t - startTs) / spanMs) * chartWidth;
    ticks.push({ x, label: formatTimeLabel(t, spanMs, hour12), ts: t });
  }

  return ticks;
}

// ─── Live state helpers ───────────────────────────────────────────────────────

/**
 * Infers the candle interval from the gap between the first two candles,
 * falling back to `intervalMsProp` when provided or 60 000 ms when data
 * is insufficient.
 */
/**
 * Infers the data interval from the median gap between adjacent timestamps.
 * Using the median rather than the first two points makes it robust against
 * gaps at the start of the series (e.g. weekend breaks, missing data).
 * Returns undefined when fewer than 2 points are available.
 */
export function inferIntervalMs(sortedData: Candle[]): number | undefined {
  if (sortedData.length < 2) return undefined;
  const diffs: number[] = [];
  for (let i = 1; i < sortedData.length; i++) {
    diffs.push(sortedData[i].timestamp - sortedData[i - 1].timestamp);
  }
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

export function resolveIntervalMs(
  intervalMsProp: number | undefined,
  sortedData: Candle[],
): number {
  return intervalMsProp ?? inferIntervalMs(sortedData) ?? 60_000;
}

/**
 * Compares the previous and current last candle to determine what kind of
 * live update just arrived.
 */
export function detectLiveUpdateMode(
  prevCandle: Candle | null,
  lastCandle: Candle | null,
  prevLen: number,
  nextLen: number,
): LiveUpdateMode {
  if (!prevCandle || !lastCandle) return 'none';
  if (lastCandle.timestamp > prevCandle.timestamp) return 'append-new-candle';
  if (lastCandle.timestamp === prevCandle.timestamp && !sameOhlc(lastCandle, prevCandle)) {
    return 'mutate-last-candle';
  }
  if (nextLen > prevLen) return 'append-new-candle';
  return 'none';
}

// ─── X geometry ───────────────────────────────────────────────────────────────

/**
 * Computes the pixel geometry for the buffer/virtual canvas.
 *
 * @param effectiveZoomLevel - candles visible at once
 * @param chartWidth         - pixel width of the chart plot area
 * @param intervalMs         - ms per candle
 * @param bufferStartTs      - timestamp of the first buffered candle slot
 * @param timeMin            - timestamp of the first *visible* candle slot
 * @param bufferedCount      - total number of buffered candles
 */
export function computeXGeometry(
  effectiveZoomLevel: number,
  chartWidth: number,
  intervalMs: number,
  bufferStartTs: number,
  timeMin: number,
  bufferedCount: number,
): { slotWidth: number; virtualWidth: number; bufferOffsetX: number } {
  const slotWidth = effectiveZoomLevel > 0 ? chartWidth / effectiveZoomLevel : 0;
  const virtualWidth = bufferedCount * slotWidth;
  const slotsFromBufferStart = intervalMs > 0 ? (timeMin - bufferStartTs) / intervalMs : 0;
  const bufferOffsetX = slotsFromBufferStart * slotWidth;
  return { slotWidth, virtualWidth, bufferOffsetX };
}

/**
 * Computes the scroll translate X bounds so the user cannot drag into empty
 * space beyond the first or last candle.
 *
 * Returns `minTranslateX` (most negative — newest data at right edge),
 * `maxTranslateX` (least negative — oldest data at left edge), and
 * `latestStart` (the timestamp of the viewport start when showing the newest
 * candle) which is needed for pan-end scroll position clamping.
 */
export function computeScrollBounds(
  bufferStartTs: number,
  firstDataTs: number,
  lastDataTs: number,
  timeWindow: number,
  intervalMs: number,
  slotWidth: number,
): { minTranslateX: number; maxTranslateX: number; latestStart: number } {
  const latestStart = Math.max(firstDataTs, lastDataTs - timeWindow);
  const maxTranslateX =
    intervalMs > 0 && slotWidth > 0
      ? Math.min(0, -((firstDataTs - bufferStartTs) / intervalMs) * slotWidth)
      : 0;
  const minTranslateX =
    intervalMs > 0 && slotWidth > 0
      ? -((latestStart - bufferStartTs) / intervalMs) * slotWidth
      : 0;
  return { minTranslateX, maxTranslateX, latestStart };
}

// ─── Y range precomputation ───────────────────────────────────────────────────

/**
 * Precomputes the padded Y range (min/max with 8% padding) for every possible
 * viewport start slot in `bufferedCandles`.
 *
 * Each entry `ranges[i]` covers the `effectiveZoomLevel` candles starting at
 * index `i`.  The pan worklet reads this array by slot index at 60 fps with
 * zero JS overhead — no recalculation per frame.
 */
export function precomputeYRanges(
  bufferedCandles: Candle[],
  effectiveZoomLevel: number,
): { min: number; max: number }[] {
  const n = bufferedCandles.length;
  if (n === 0) return [];

  const zoomSlots = Math.max(1, Math.ceil(effectiveZoomLevel));
  const ranges: { min: number; max: number }[] = new Array(n);

  for (let start = 0; start < n; start++) {
    const end = Math.min(start + zoomSlots, n);
    let lo = Infinity, hi = -Infinity;
    for (let j = start; j < end; j++) {
      if (bufferedCandles[j].low  < lo) lo = bufferedCandles[j].low;
      if (bufferedCandles[j].high > hi) hi = bufferedCandles[j].high;
    }
    const rawSpan = hi - lo;
    const pad = (rawSpan > 0 ? rawSpan : Math.max(Math.abs(hi), 1)) * 0.08;
    ranges[start] = { min: lo - pad, max: hi + pad };
  }

  return ranges;
}
