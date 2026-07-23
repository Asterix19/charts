export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface IndicatorLine {
  id: string;
  name?: string;
  color: string;
  data: { timestamp: number; value: number }[];
}

export interface ShadedArea {
  fromId: string;
  toId: string;
  color?: string;
  opacity?: number;
}

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
 */
export interface ChartMarker {
  timestamp: number;
  price: number;
  kind: MarkerKind;
  /** Shown on hover/tap (or via the OHLC HUD, if showOhlcHud is on). */
  label?: string;
}

export type RsiPoint = { timestamp: number; value: number };

export interface MacdResult {
  /** MACD line: EMA(fast) − EMA(slow) */
  macd: TsPoint[];
  /** Signal line: EMA(signalPeriod) of MACD */
  signal: TsPoint[];
  /** Histogram: MACD − Signal */
  histogram: TsPoint[];
}

/** Named built-in theme presets. */
export type ChartTheme = 'light' | 'dark';

/** How the price series is rendered in the main panel. */
export type ChartType = 'candle' | 'line';

/** Describes how the latest candle changed since the previous render. */
export type LiveUpdateMode = 'none' | 'mutate-last-candle' | 'append-new-candle';

export interface ChartProps {
  data: Candle[];
  indicators?: IndicatorLine[];
  shadedAreas?: ShadedArea[];
  /** Trade/event markers drawn on the main price panel. */
  markers?: ChartMarker[];
  width: number;
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
  showOhlcHud?: boolean;
  showRsiPanel?: boolean;
  /** RSI lookback period. Default: 14. Only used when showRsiPanel is true. */
  rsiPeriod?: number;
  showMacdPanel?: boolean;
  /** Show a volume sub-panel below the main chart. Requires `data[].volume`. Default: false. */
  showVolumePanel?: boolean;
  chartType?: ChartType;
  /** Increment this value to jump the viewport to the latest candle. */
  scrollToLatestTrigger?: number;
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
