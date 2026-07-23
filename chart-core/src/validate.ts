/**
 * validateChartConfig — structural and semantic validation for ChartConfig.
 *
 * Returns every error found (not just the first), so the caller (or an LLM
 * generating configs) gets a complete picture of what needs to be fixed.
 *
 * Each ValidationError carries:
 *   - `path`    — dot-notation field location, e.g. "overlays[0].params.period"
 *   - `message` — human-readable explanation
 *   - `code`    — machine-readable enum for programmatic handling
 */

import { CHART_CONFIG_VERSION, type ChartConfig, type MarkerKindConfig, type OverlayConfig } from './config';

const VALID_MARKER_KINDS: ReadonlySet<MarkerKindConfig> = new Set([
  'entry-long', 'exit-long', 'entry-short', 'exit-short', 'stop-loss', 'take-profit',
]);

// ─── Error types ──────────────────────────────────────────────────────────────

export type ValidationErrorCode =
  | 'INVALID_VERSION'
  | 'DUPLICATE_OVERLAY_ID'
  | 'SHADED_AREA_UNKNOWN_REF'
  | 'SHADED_AREA_SELF_REF'
  | 'INVALID_OPACITY'
  | 'INVALID_VISIBLE_CANDLES'
  | 'INVALID_PERIOD'
  | 'INVALID_STD_DEV'
  | 'INVALID_MARKER_TIMESTAMP'
  | 'INVALID_MARKER_PRICE'
  | 'INVALID_MARKER_KIND';

export interface ValidationError {
  /** Dot-notation path to the offending field. */
  path: string;
  /** Human-readable description of the problem. */
  message: string;
  /** Machine-readable code for programmatic handling. */
  code: ValidationErrorCode;
}

/** Discriminated result — check `valid` before using `errors`. */
export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a ChartConfig document.
 *
 * Collects ALL errors before returning — the caller receives the full list
 * rather than failing on the first violation.
 *
 * ```ts
 * const result = validateChartConfig(config);
 * if (!result.valid) {
 *   result.errors.forEach(e => console.error(`${e.path}: ${e.message}`));
 * }
 * ```
 */
export function validateChartConfig(config: ChartConfig): ValidationResult {
  const errors: ValidationError[] = [];

  validateVersion(config, errors);
  const knownIds = validateOverlays(config, errors);
  validateShadedAreas(config, knownIds, errors);
  validateViewport(config, errors);
  validateSubPanels(config, errors);
  validateMarkers(config, errors);

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ─── Section validators ───────────────────────────────────────────────────────

function validateVersion(config: ChartConfig, errors: ValidationError[]): void {
  if (config.version !== CHART_CONFIG_VERSION) {
    errors.push({
      path: 'version',
      code: 'INVALID_VERSION',
      message: `Unsupported version "${config.version}". Expected "${CHART_CONFIG_VERSION}".`,
    });
  }
}

/**
 * Validates each overlay's params and collects all declared ids.
 * Returns the set of valid ids so shadedAreas can be checked against it.
 */
function validateOverlays(config: ChartConfig, errors: ValidationError[]): Set<string> {
  const seen = new Set<string>();

  config.overlays.forEach((overlay, i) => {
    const base = `overlays[${i}]`;

    switch (overlay.type) {
      case 'sma':
      case 'ema':
        trackId(overlay.id, `${base}.id`, seen, errors);
        validatePeriod(overlay.params.period, `${base}.params.period`, errors);
        break;

      case 'bollinger_bands':
        validatePeriod(overlay.params.period, `${base}.params.period`, errors);
        validateStdDev(overlay.params.stdDev, `${base}.params.stdDev`, errors);
        trackId(overlay.bands.upper.id, `${base}.bands.upper.id`, seen, errors);
        trackId(overlay.bands.lower.id, `${base}.bands.lower.id`, seen, errors);
        trackId(overlay.bands.basis.id, `${base}.bands.basis.id`, seen, errors);
        break;

      case 'vwap':
        trackId(overlay.id, `${base}.id`, seen, errors);
        break;
    }
  });

  return seen;
}

function validateShadedAreas(
  config: ChartConfig,
  knownIds: Set<string>,
  errors: ValidationError[],
): void {
  config.shadedAreas.forEach((area, i) => {
    const base = `shadedAreas[${i}]`;

    if (!knownIds.has(area.fromOverlayId)) {
      errors.push({
        path: `${base}.fromOverlayId`,
        code: 'SHADED_AREA_UNKNOWN_REF',
        message: `fromOverlayId "${area.fromOverlayId}" does not match any overlay id.`,
      });
    }
    if (!knownIds.has(area.toOverlayId)) {
      errors.push({
        path: `${base}.toOverlayId`,
        code: 'SHADED_AREA_UNKNOWN_REF',
        message: `toOverlayId "${area.toOverlayId}" does not match any overlay id.`,
      });
    }
    if (area.fromOverlayId === area.toOverlayId) {
      errors.push({
        path: base,
        code: 'SHADED_AREA_SELF_REF',
        message: `fromOverlayId and toOverlayId must be different (got "${area.fromOverlayId}" for both).`,
      });
    }
    if (area.opacity < 0 || area.opacity > 1) {
      errors.push({
        path: `${base}.opacity`,
        code: 'INVALID_OPACITY',
        message: `opacity must be in [0, 1]. Got ${area.opacity}.`,
      });
    }
  });
}

function validateViewport(config: ChartConfig, errors: ValidationError[]): void {
  const { visibleCandles } = config.viewport;
  if (!Number.isInteger(visibleCandles) || visibleCandles < 10 || visibleCandles > 500) {
    errors.push({
      path: 'viewport.visibleCandles',
      code: 'INVALID_VISIBLE_CANDLES',
      message: `visibleCandles must be an integer in [10, 500]. Got ${visibleCandles}.`,
    });
  }
}

function validateSubPanels(config: ChartConfig, errors: ValidationError[]): void {
  config.subPanels.forEach((panel, i) => {
    if (panel.type === 'rsi') {
      validatePeriod(panel.params.period, `subPanels[${i}].params.period`, errors);
    }
  });
}

function validateMarkers(config: ChartConfig, errors: ValidationError[]): void {
  (config.markers ?? []).forEach((marker, i) => {
    const base = `markers[${i}]`;

    if (!Number.isFinite(marker.timestamp)) {
      errors.push({
        path: `${base}.timestamp`,
        code: 'INVALID_MARKER_TIMESTAMP',
        message: `timestamp must be a finite number. Got ${marker.timestamp}.`,
      });
    }

    if (!Number.isFinite(marker.price)) {
      errors.push({
        path: `${base}.price`,
        code: 'INVALID_MARKER_PRICE',
        message: `price must be a finite number. Got ${marker.price}.`,
      });
    }

    if (!VALID_MARKER_KINDS.has(marker.kind)) {
      errors.push({
        path: `${base}.kind`,
        code: 'INVALID_MARKER_KIND',
        message: `kind "${marker.kind}" is not a valid marker kind.`,
      });
    }
  });
}

// ─── Shared field validators ──────────────────────────────────────────────────

function trackId(id: string, path: string, seen: Set<string>, errors: ValidationError[]): void {
  if (seen.has(id)) {
    errors.push({
      path,
      code: 'DUPLICATE_OVERLAY_ID',
      message: `Duplicate overlay id "${id}". All overlay ids must be unique within a config.`,
    });
  }
  seen.add(id);
}

function validatePeriod(value: number, path: string, errors: ValidationError[]): void {
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    errors.push({
      path,
      code: 'INVALID_PERIOD',
      message: `period must be an integer in [1, 500]. Got ${value}.`,
    });
  }
}

function validateStdDev(value: number, path: string, errors: ValidationError[]): void {
  if (value <= 0 || value > 10) {
    errors.push({
      path,
      code: 'INVALID_STD_DEV',
      message: `stdDev must be in (0, 10]. Got ${value}.`,
    });
  }
}
