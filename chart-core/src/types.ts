export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
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
  showMacdPanel?: boolean;
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
