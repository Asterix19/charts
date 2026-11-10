/**
 * One OHLC(V) bar. All prices must be finite numbers; candles with a non-finite timestamp or price are
 * dropped by `normalizeCandles` (which every renderer applies), so one bad tick cannot blank a chart.
 */
export interface Candle {
  /** Bar open time in Unix milliseconds. Candles may arrive unsorted or duplicated; renderers sort and dedupe. */
  timestamp: number;
  /** Price at bar open. */
  open: number;
  /** Highest price of the bar (must be ≥ open and close). */
  high: number;
  /** Lowest price of the bar (must be ≤ open and close). */
  low: number;
  /** Price at bar close — the value line charts, indicators and the crosshair use. */
  close: number;
  /** Traded volume. Optional; required only for the volume panel. Non-finite values are stripped. */
  volume?: number;
}

/**
 * A line drawn over the price panel (moving average, Bollinger band, VWAP, …). Produce one with
 * `calcSMA` / `calcEMA` / `calcBollingerBands`, or build your own from any `{ timestamp, value }` series.
 */
export interface IndicatorLine {
  /** Unique id. `ShadedArea.fromId` / `toId` refer to it. */
  id: string;
  /** Label shown in the OHLC HUD (e.g. "EMA(9)"). Defaults to `id`. */
  name?: string;
  /** Any CSS color string (hex, rgb(), name). */
  color: string;
  /** Points keyed by candle timestamp; timestamps with no matching candle are ignored. */
  data: { timestamp: number; value: number }[];
}

/** A filled region between two indicator lines (e.g. between the upper and lower Bollinger band). */
export interface ShadedArea {
  /** `IndicatorLine.id` of the first boundary. */
  fromId: string;
  /** `IndicatorLine.id` of the second boundary. */
  toId: string;
  /** Fill color (CSS string). Default: a neutral grey. */
  color?: string;
  /** Fill opacity in [0, 1]. Default: 0.3. */
  opacity?: number;
}

/** A value aligned to a candle timestamp — the building block of every indicator series. */
export type TsPoint = { timestamp: number; value: number };

/** Closed union of supported trade-marker kinds — same convention as OverlayType/ChartType. */
export type MarkerKind =
  | 'entry-long'
  | 'exit-long'
  | 'entry-short'
  | 'exit-short'
  | 'stop-loss'
  | 'take-profit';

/**
 * A single point-in-time annotation drawn on the price panel (e.g. a
 * backtest's entry/exit points). Rendered by MarkerLayer/draw/markers.ts
 * using the same pixel math as the candle layer, so it stays in sync
 * through pan/zoom/live updates with no external state.
 *
 * Hovering (web) or tapping (native) a marker shows a small tooltip built
 * from these fields — kind, price, timestamp, and, if provided, label and
 * changePct. No extra wiring is needed to get a tooltip; label/changePct
 * just make it more specific to a trade.
 */
export interface ChartMarker {
  /** Candle time (Unix ms) the marker is pinned to. Markers outside the visible window are not drawn. */
  timestamp: number;
  /** Price level (same units as the candles) the marker sits at. */
  price: number;
  /** Determines the glyph and color: entry/exit long/short, stop-loss, take-profit. */
  kind: MarkerKind;
  /** Tooltip heading. Falls back to a name derived from `kind` (e.g. "Stop-loss") if omitted. */
  label?: string;
  /** Optional % change shown in the tooltip (e.g. a closed trade's P&L%), colored up/down like the OHLC HUD's change row. */
  changePct?: number;
}

/** One RSI value (0–100) aligned to a candle timestamp. */
export type RsiPoint = { timestamp: number; value: number };

export interface MacdResult {
  /** MACD line: EMA(fast) − EMA(slow) */
  macd: TsPoint[];
  /** Signal line: EMA(signalPeriod) of MACD */
  signal: TsPoint[];
  /** Histogram: MACD − Signal */
  histogram: TsPoint[];
}

/**
 * One named sub-panel of caller-supplied data that doesn't fit an existing overlay or fixed
 * panel type (RSI/MACD/Volume) — e.g. a correlation coefficient, an external data series, or any
 * strategy-specific signal the caller has already computed. Unlike `indicators` (which overlay
 * the main price panel and assume a price-like scale), a `CustomPanel` gets its own scaled
 * sub-panel, the same visual treatment RSI/MACD/Volume already get.
 */
export interface CustomPanel {
  /** Unique panel id (used as the DOM/React key). */
  id: string;
  /** Human-readable panel name shown in the OHLC HUD. */
  label: string;
  /** Usually one line, but multiple series can share a panel (e.g. two correlated indicators on
   * the same scale) — each is drawn with its own `IndicatorLine.color`. */
  series: IndicatorLine[];
  /** `'auto'` (default) computes the range from the panel's own visible data, padded — same
   * convention as the main price panel. Provide fixed bounds for a panel with a natural fixed
   * scale (e.g. a -1..1 correlation coefficient never needs to auto-range). */
  yRange?: 'auto' | { min: number; max: number };
  /** Horizontal reference lines (e.g. 0 for a correlation panel) — the same visual idea as RSI's
   * 30/70 threshold lines, generalized to any value(s) instead of a fixed pair. */
  referenceLines?: number[];
}

/** Named built-in theme presets. */
export type ChartTheme = 'light' | 'dark';

/** How the price series is rendered in the main panel. */
export type ChartType = 'candle' | 'line';

/** Describes how the latest candle changed since the previous render. */
export type LiveUpdateMode = 'none' | 'mutate-last-candle' | 'append-new-candle';

export interface ChartProps {
  /** The candles to draw. May be unsorted, duplicated or contain bad values — renderers normalise it (`normalizeCandles`). `[]` renders a "No data" placeholder. */
  data: Candle[];
  /** Overlay lines on the price panel (see `calcSMA`, `calcEMA`, `calcBollingerBands`). */
  indicators?: IndicatorLine[];
  /** Filled regions between two `indicators` (matched by id). */
  shadedAreas?: ShadedArea[];
  /** Trade/event markers drawn on the main price panel. */
  markers?: ChartMarker[];
  /** Arbitrary named sub-panels for data that doesn't fit `indicators` (wrong scale) or the
   * fixed RSI/MACD/Volume panels (wrong shape) — see `CustomPanel`. */
  customPanels?: CustomPanel[];
  /** Total chart width in CSS pixels (the plot is narrower by the price-axis gutter). */
  width: number;
  /** Total chart height in CSS pixels, including every sub-panel and the time axis. */
  height: number;
  /**
   * Milliseconds per candle. If omitted the chart auto-detects the interval
   * from the gap between the first two candles in `data`.
   */
  intervalMs?: number;
  /** Number of data points visible on screen at once. Default: 60. */
  visibleDataPoints?: number;
  /** Named preset ("dark" | "light") or a custom ChartThemeColors object. */
  theme?: ChartTheme | import('./theme').ChartThemeColors;
  /** Show the OHLC readout and enable the crosshair that follows the pointer / touch. Default: false. */
  showOhlcHud?: boolean;
  /** Show an RSI sub-panel (period: `rsiPeriod`) with 30/70 thresholds. Default: false. */
  showRsiPanel?: boolean;
  /** RSI lookback period. Default: 14. Only used when showRsiPanel is true. */
  rsiPeriod?: number;
  /** Show a MACD(12,26,9) sub-panel (lines + histogram). Needs at least ~35 candles of data, otherwise it is omitted. Default: false. */
  showMacdPanel?: boolean;
  /** Show a volume sub-panel below the main chart. Requires `data[].volume`. Default: false. */
  showVolumePanel?: boolean;
  /** `'candle'` (default) or `'line'` (close-price line). */
  chartType?: ChartType;
  /** Increment this value to jump the viewport to the latest candle. */
  scrollToLatestTrigger?: number;
  /** Called with the inspected candle while the crosshair is active, and with `null` when it is released. Requires `showOhlcHud`. */
  onCrosshairChange?: (candle: Candle | null) => void;
  /**
   * How many extra screen-widths of candles to keep rendered on each side of
   * the visible window. Larger values mean smoother panning (fewer redraws)
   * at the cost of more memory. Default: 1.5
   */
  bufferRatio?: number;
  /**
   * Use 12-hour (AM/PM) time format on the X axis. Default: false (24-hour).
   */
  hour12?: boolean;
  /**
   * Maximum number of candles the user can zoom out to see at once.
   * Defaults to the full dataset length so the user can never zoom past
   * all available data. Set a lower value to restrict the zoom range.
   */
  maxZoom?: number;
  /**
   * Show background grid lines on the chart. Default: true.
   * Axis labels are always shown regardless of this setting.
   */
  showGrid?: boolean;
}
