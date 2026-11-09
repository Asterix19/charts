/**
 * Centralized theme system for the chart.
 *
 * Usage
 * ─────
 * • Use a built-in preset:   theme="dark"  |  theme="light"
 * • Pass a custom object:    theme={{ background: '#0a0a0a', candleUp: '#26a69a', … }}
 * • Add a new named preset:  THEMES.myTheme = { …colors }
 *
 * All chart components receive colors via getThemeColors() — they never
 * contain hard-coded color literals.
 */

import type { ChartTheme, MarkerKind } from './types';

// ─── Color contract ────────────────────────────────────────────────────────

/** Full color palette consumed by every chart layer. */
export interface ChartThemeColors {
  /** Canvas / outer background */
  background: string;
  /** Horizontal dashed price-grid lines */
  gridH: string;
  /** Vertical dashed time-grid lines */
  gridV: string;
  /** Y-axis price labels */
  priceLabel: string;
  /** X-axis time labels */
  timeLabel: string;
  /** Crosshair hair lines */
  crosshair: string;
  /** Bullish (close ≥ open) candle body + wick */
  candleUp: string;
  /** Bearish (close < open) candle body + wick */
  candleDown: string;
  /** Line-chart stroke */
  lineChart: string;
  /** RSI indicator line */
  rsiLine: string;
  /** RSI overbought/oversold threshold lines (70 / 30) */
  rsiThreshold: string;
  /** OHLC HUD overlay background */
  hudBackground: string;
  /** OHLC HUD text */
  hudText: string;
  /** Neutral trade-marker color (exit-long / exit-short) — not tied to bullish/bearish */
  markerNeutral: string;
}

// ─── Built-in presets ─────────────────────────────────────────────────────

/**
 * Named theme registry.
 * Add new themes here and they become available via the `theme` prop.
 *
 * @example
 * import { THEMES } from '@/extraction/core';
 * THEMES.midnight = { background: '#0a0a0a', candleUp: '#26a69a', … };
 */
export const THEMES: Record<string, ChartThemeColors> = {
  dark: {
    background: '#121212',
    gridH: '#252525',
    gridV: '#1A1A1A',
    priceLabel: '#B0B0B0',
    timeLabel: '#686868',
    crosshair: '#909090',
    candleUp: '#2ECC71',
    candleDown: '#E74C3C',
    lineChart: '#00E5FF',
    rsiLine: '#F1C40F',
    rsiThreshold: '#3C3C3C',
    hudBackground: 'rgba(0,0,0,0.72)',
    hudText: '#FFFFFF',
    markerNeutral: '#64B5F6',
  },

  light: {
    background: '#FFFFFF',
    gridH: '#C4C4C4',
    gridV: '#D8D8D8',
    priceLabel: '#1A1A1A',
    timeLabel: '#3D3D3D',
    crosshair: '#111111',
    candleUp: '#1A7A36',
    candleDown: '#C0392B',
    lineChart: '#0047AB',
    rsiLine: '#B8860B',
    rsiThreshold: '#808080',
    hudBackground: 'rgba(238,238,238,0.95)',
    hudText: '#111111',
    markerNeutral: '#1565C0',
  },
};

// ─── MACD panel colors ────────────────────────────────────────────────────

/**
 * Fixed colors for the MACD sub-panel.
 *
 * These intentionally don't vary with the chart theme — MACD is always rendered
 * against a neutral dark background regardless of the theme setting, so the same
 * set of high-contrast colors reads clearly in every configuration.
 */
export const MACD_COLORS = {
  /** MACD line — blue */
  line:    '#2196F3',
  /** Signal line — amber */
  signal:  '#FF9500',
  /** Histogram bar when value ≥ 0 (bullish momentum) — green */
  histPos: '#2ECC71',
  /** Histogram bar when value < 0 (bearish momentum) — red */
  histNeg: '#E74C3C',
} as const;

// ─── Trade markers ────────────────────────────────────────────────────────

/** Shapes MarkerLayer / draw/markers.ts know how to draw. */
export type MarkerShape = 'triangle-up' | 'triangle-down' | 'x' | 'dot';

export interface MarkerStyle {
  shape: MarkerShape;
  color: string;
}

/**
 * Resolves a MarkerKind to its default shape + color.
 *
 *   entry-long   ▲ candleUp        entry-short  ▼ candleDown
 *   exit-long    ▼ markerNeutral   exit-short   ▲ markerNeutral
 *   stop-loss    ✕ candleDown      take-profit  ● candleUp
 */
export function getMarkerStyle(kind: MarkerKind, colors: ChartThemeColors): MarkerStyle {
  switch (kind) {
    case 'entry-long':
      return { shape: 'triangle-up', color: colors.candleUp };
    case 'exit-long':
      return { shape: 'triangle-down', color: colors.markerNeutral };
    case 'entry-short':
      return { shape: 'triangle-down', color: colors.candleDown };
    case 'exit-short':
      return { shape: 'triangle-up', color: colors.markerNeutral };
    case 'stop-loss':
      return { shape: 'x', color: colors.candleDown };
    case 'take-profit':
      return { shape: 'dot', color: colors.candleUp };
  }
}

/**
 * Human-readable fallback heading for a marker's hover/tap tooltip, used
 * when the caller didn't set ChartMarker.label.
 */
export function getMarkerKindLabel(kind: MarkerKind): string {
  switch (kind) {
    case 'entry-long':
      return 'Entry (long)';
    case 'exit-long':
      return 'Exit (long)';
    case 'entry-short':
      return 'Entry (short)';
    case 'exit-short':
      return 'Exit (short)';
    case 'stop-loss':
      return 'Stop-loss';
    case 'take-profit':
      return 'Take-profit';
  }
}

// ─── Resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve a theme name or a custom color object into a full ChartThemeColors.
 * Falls back to "dark" for unknown preset names.
 */
export function getThemeColors(theme: ChartTheme | ChartThemeColors): ChartThemeColors {
  if (typeof theme === 'object') return theme;
  return THEMES[theme] ?? THEMES.dark;
}
