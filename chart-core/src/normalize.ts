/**
 * normalizeChartConfig — apply explicit defaults to a ChartConfig.
 *
 * Normalization runs AFTER validation. It never rejects a config — it only
 * fills in omitted optional fields and clamps values to their valid ranges.
 *
 * Rules applied:
 *  - overlay.label       → "{TYPE} {period}" or type name if not provided
 *  - bollinger band label → "BB Upper / Lower / Basis" if not provided
 *  - shadedArea.opacity  → clamped to [0, 1]
 *  - viewport.visibleCandles → clamped to [10, 500]
 *
 * Returns a new config object — the input is never mutated.
 */

import type { ChartConfig, OverlayConfig, SubPanelConfig } from './config';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply defaults and clamp out-of-range values.
 * Always returns a structurally valid, fully-labeled config.
 *
 * Run after validateChartConfig to ensure the input is semantically sound
 * before normalization fills in the blanks.
 */
export function normalizeChartConfig(config: ChartConfig): ChartConfig {
  return {
    ...config,
    overlays: config.overlays.map(normalizeOverlay),
    shadedAreas: config.shadedAreas.map((area) => ({
      ...area,
      opacity: clamp(area.opacity, 0, 1),
    })),
    subPanels: config.subPanels.map(normalizeSubPanel),
    viewport: {
      ...config.viewport,
      visibleCandles: clamp(
        Math.round(config.viewport.visibleCandles),
        10,
        500,
      ),
    },
  };
}

// ─── Overlay normalization ────────────────────────────────────────────────────

function normalizeOverlay(overlay: OverlayConfig): OverlayConfig {
  switch (overlay.type) {
    case 'sma':
      return { ...overlay, label: overlay.label ?? `SMA ${overlay.params.period}` };

    case 'ema':
      return { ...overlay, label: overlay.label ?? `EMA ${overlay.params.period}` };

    case 'bollinger_bands':
      return {
        ...overlay,
        bands: {
          upper: {
            ...overlay.bands.upper,
            label: overlay.bands.upper.label ?? `BB Upper (${overlay.params.period}, ${overlay.params.stdDev})`,
          },
          lower: {
            ...overlay.bands.lower,
            label: overlay.bands.lower.label ?? `BB Lower (${overlay.params.period}, ${overlay.params.stdDev})`,
          },
          basis: {
            ...overlay.bands.basis,
            label: overlay.bands.basis.label ?? `BB Basis (${overlay.params.period})`,
          },
        },
      };

    case 'vwap':
      return { ...overlay, label: overlay.label ?? 'VWAP' };
  }
}

// ─── Sub-panel normalization ──────────────────────────────────────────────────

function normalizeSubPanel(panel: SubPanelConfig): SubPanelConfig {
  switch (panel.type) {
    case 'rsi':
      // Clamp period in case it slipped through (normalization is defensive)
      return { ...panel, params: { period: clamp(Math.round(panel.params.period), 1, 500) } };
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
