/**
 * ChartConfig — versioned, LLM-safe schema for chart configuration.
 *
 * Schema design:
 *  - Every string field is a literal union type (enum), never a raw string.
 *  - Colors come from a named palette — no hex codes.
 *  - Numbers carry explicit range constraints in JSDoc (@minimum / @maximum).
 *  - Overlay params use discriminated unions per indicator type.
 *  - `width` and `height` are absent — they are runtime layout values.
 *
 * Overlay schema conventions:
 *  - Single-line overlays  → { type, id, params, color, label? }
 *  - Multi-line overlays   → { type, params, bands: { upper, lower, basis } }
 *                            where each band is { id, color, label? }
 *  - Sub-panels            → { type, params }
 *                            (no id/color — the panel manages its own styling)
 *
 * The pipeline: validateChartConfig → normalizeChartConfig → compileChartConfig
 */

// ─── Version ─────────────────────────────────────────────────────────────────

export const CHART_CONFIG_VERSION = '1' as const;
export type ChartConfigVersion = typeof CHART_CONFIG_VERSION;

// ─── Primitive enums ──────────────────────────────────────────────────────────

/** Visual theme preset for the chart. */
export type ThemePreset = 'dark' | 'light';

/** How the price series is rendered in the main panel. */
export type PriceDisplay = 'candle' | 'line';

/**
 * Named time intervals. Use these instead of raw millisecond numbers.
 * The compiler maps them to millisecond values via INTERVAL_MS.
 */
export type ChartInterval =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '4h'
  | '1d'
  | '1w';

export const INTERVAL_MS: Record<ChartInterval, number> = {
  '1m':  60_000,
  '5m':  300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h':  3_600_000,
  '4h':  14_400_000,
  '1d':  86_400_000,
  '1w':  604_800_000,
};

/**
 * Named color tokens. Use these instead of raw hex strings.
 * The compiler resolves each token to an exact hex value via PALETTE.
 */
export type PaletteColor =
  | 'blue'
  | 'orange'
  | 'green'
  | 'red'
  | 'purple'
  | 'yellow'
  | 'cyan'
  | 'pink'
  | 'white'
  | 'gray';

export const PALETTE: Record<PaletteColor, string> = {
  blue:   '#4A90E2',
  orange: '#F5A623',
  green:  '#7ED321',
  red:    '#D0021B',
  purple: '#9013FE',
  yellow: '#F8E71C',
  cyan:   '#50E3C2',
  pink:   '#FF6B9D',
  white:  '#FFFFFF',
  gray:   '#9B9B9B',
};

// ─── Shared param shapes (used by both overlays and sub-panels) ───────────────

/** Parameters for any period-based indicator. */
export interface PeriodParams {
  /**
   * Lookback period in bars.
   * @minimum 1
   * @maximum 500
   * @integer
   */
  period: number;
}

/** Parameters for Bollinger Bands. */
export interface BollingerParams {
  /**
   * Lookback period in bars.
   * @minimum 1
   * @maximum 500
   * @integer
   */
  period: number;
  /**
   * Standard deviation multiplier for the upper/lower bands.
   * Typical values: 1.5 – 3.0.
   * @minimum 0.1
   * @maximum 10
   */
  stdDev: number;
}

// ─── Overlay configs (discriminated union by `type`) ──────────────────────────
//
// Convention: all overlay ids must be unique within a single ChartConfig so
// that ShadedAreaConfig can reference them.

/** All valid overlay type discriminators. */
export type OverlayType = 'sma' | 'ema' | 'bollinger_bands' | 'vwap';

export interface SmaOverlay {
  type: 'sma';
  /** Must be unique within this config. Referenced by ShadedAreaConfig. */
  id: string;
  params: PeriodParams;
  color: PaletteColor;
  /** Defaults to "SMA {period}" when omitted. Applied by normalizeChartConfig. */
  label?: string;
}

export interface EmaOverlay {
  type: 'ema';
  id: string;
  params: PeriodParams;
  color: PaletteColor;
  /** Defaults to "EMA {period}" when omitted. */
  label?: string;
}

/**
 * Bollinger Bands is a multi-line indicator: one computation pass produces
 * three lines (upper / lower / basis). Each band has its own id and color so
 * that ShadedAreaConfig can fill the upper → lower region, and each band can
 * be styled independently.
 *
 * Band ids are also unique within the config — treat them like overlay ids.
 */
export interface BollingerOverlay {
  type: 'bollinger_bands';
  params: BollingerParams;
  bands: {
    upper: { id: string; color: PaletteColor; label?: string };
    lower: { id: string; color: PaletteColor; label?: string };
    basis: { id: string; color: PaletteColor; label?: string };
  };
}

/** VWAP has no configurable parameters. */
export interface VwapOverlay {
  type: 'vwap';
  id: string;
  params: Record<never, never>;
  color: PaletteColor;
  label?: string;
}

export type OverlayConfig =
  | SmaOverlay
  | EmaOverlay
  | BollingerOverlay
  | VwapOverlay;

// ─── Shaded area ──────────────────────────────────────────────────────────────

/**
 * Fills the region between two overlay lines with a semi-transparent color.
 * Both ids must match an existing overlay id (or a Bollinger band id).
 */
export interface ShadedAreaConfig {
  fromOverlayId: string;
  toOverlayId: string;
  color: PaletteColor;
  /**
   * Fill opacity.
   * @minimum 0
   * @maximum 1
   */
  opacity: number;
}

// ─── Sub-panels (rendered below the main chart) ───────────────────────────────
//
// Sub-panels follow { type, params } — no id or color needed since each panel
// type manages its own internal rendering style.

/** All valid sub-panel type discriminators. */
export type SubPanelType = 'rsi';

export interface RsiPanelConfig {
  type: 'rsi';
  /** Defaults to 14 when omitted. Applied by normalizeChartConfig. */
  params: PeriodParams;
}

/** Union of all sub-panel types. */
export type SubPanelConfig = RsiPanelConfig;

// ─── Viewport ─────────────────────────────────────────────────────────────────

export interface ViewportConfig {
  /**
   * Number of candles visible in the window at one time.
   * Clamped to [10, 500] by normalizeChartConfig.
   * @minimum 10
   * @maximum 500
   * @integer
   */
  visibleCandles: number;
  /**
   * When true the chart auto-scrolls to keep the latest candle in view.
   * Set to false to anchor the viewport at a fixed historical position.
   */
  followLive: boolean;
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

export interface HudConfig {
  /** Show the draggable OHLC data overlay. */
  showOhlcHud: boolean;
}

// ─── Top-level config document ────────────────────────────────────────────────

/**
 * ChartConfig is the single document consumed by the chart pipeline:
 *   validateChartConfig → normalizeChartConfig → compileChartConfig → ChartCanvas
 *
 * Example — Bollinger Band chart with RSI sub-panel:
 * ```ts
 * const config: ChartConfig = {
 *   version: '1',
 *   theme: 'dark',
 *   priceDisplay: 'candle',
 *   interval: '1h',
 *   overlays: [
 *     {
 *       type: 'bollinger_bands',
 *       params: { period: 20, stdDev: 2 },
 *       bands: {
 *         upper: { id: 'bb-upper', color: 'cyan' },
 *         lower: { id: 'bb-lower', color: 'cyan' },
 *         basis: { id: 'bb-basis', color: 'gray' },
 *       },
 *     },
 *   ],
 *   shadedAreas: [
 *     { fromOverlayId: 'bb-upper', toOverlayId: 'bb-lower', color: 'cyan', opacity: 0.15 },
 *   ],
 *   subPanels: [{ type: 'rsi', params: { period: 14 } }],
 *   viewport: { visibleCandles: 100, followLive: true },
 *   hud: { showOhlcHud: true },
 * };
 * ```
 */
export interface ChartConfig {
  /** Schema version. Must be '1'. The pipeline rejects unknown versions. */
  version: ChartConfigVersion;
  theme: ThemePreset;
  priceDisplay: PriceDisplay;
  interval: ChartInterval;
  /** Indicator lines rendered on top of the price series. */
  overlays: OverlayConfig[];
  /** Filled regions between pairs of overlay lines. */
  shadedAreas: ShadedAreaConfig[];
  /** Oscillator panels rendered below the main chart. */
  subPanels: SubPanelConfig[];
  viewport: ViewportConfig;
  hud: HudConfig;
}
