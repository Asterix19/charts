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

import {
  CHART_CONFIG_VERSION,
  INTERVAL_MS,
  PALETTE,
  type ChartConfig,
  type MarkerKindConfig,
  type OverlayConfig,
} from './config';

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
  | 'INVALID_MARKER_KIND'
  | 'INVALID_ENUM'
  | 'UNKNOWN_KEY'
  | 'INVALID_STRUCTURE'
  | 'INVALID_TYPE';

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

export interface ValidateOptions {
  /**
   * `true` (default): reject out-of-enum values, unknown keys and wrongly-typed scalars — what you want for
   * LLM-generated configs. `false`: the lenient behaviour of `@stacklatte/chart-core` 2.x, which silently accepted
   * those; only shapes that would crash (a missing array/object) and the semantic rules (ids, ranges) still fail.
   */
  strict?: boolean;
}

const LENIENT_IGNORED: ReadonlySet<ValidationErrorCode> = new Set(['INVALID_ENUM', 'UNKNOWN_KEY', 'INVALID_TYPE']);

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
export function validateChartConfig(config: ChartConfig, options: ValidateOptions = {}): ValidationResult {
  const { strict = true } = options;
  let errors: ValidationError[] = [];

  // Structural pass first: closed enums, unknown keys, required shapes. If the
  // document isn't shaped like a ChartConfig, the semantic validators below
  // would throw on missing arrays/objects — return the itemized errors instead.
  validateStructure(config, errors);
  // Lenient (legacy) mode reproduces what @stacklatte/chart-core <= 2.3 accepted: it never checked enums, unknown keys or
  // scalar types — only the shapes whose absence would crash. Everything else is still checked by the semantic validators.
  if (!strict) errors = errors.filter((e) => !LENIENT_IGNORED.has(e.code));
  if (errors.some((e) => e.code === 'INVALID_STRUCTURE')) return { valid: false, errors };

  validateVersion(config, errors);
  const knownIds = validateOverlays(config, errors);
  validateShadedAreas(config, knownIds, errors);
  validateViewport(config, errors);
  validateSubPanels(config, errors);
  validateMarkers(config, errors);

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ─── Structural validation (closed enums + unknown keys) ─────────────────────
//
// Mirrors the generated JSON Schema (`additionalProperties: false`, closed
// enums) at runtime, so a config that bypasses structured output still fails
// loudly instead of silently falling back (e.g. an unknown theme rendering dark).

const THEMES_ALLOWED = ['dark', 'light'] as const;
const PRICE_DISPLAYS = ['candle', 'line', 'area'] as const;
const OVERLAY_TYPES = ['sma', 'ema', 'bollinger_bands', 'vwap'] as const;
const SUB_PANEL_TYPES = ['rsi', 'macd', 'volume'] as const;
const INTERVALS = Object.keys(INTERVAL_MS);
const COLORS = Object.keys(PALETTE);
const MARKER_KINDS = [...VALID_MARKER_KINDS] as string[];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function validateStructure(config: unknown, errors: ValidationError[]): void {
  const bad = (path: string, code: ValidationErrorCode, message: string) => errors.push({ path, code, message });

  const keys = (v: unknown, path: string, allowed: string[]): v is Record<string, unknown> => {
    if (!isRecord(v)) {
      bad(path || '(root)', 'INVALID_STRUCTURE', 'must be an object.');
      return false;
    }
    for (const k of Object.keys(v)) {
      if (!allowed.includes(k)) {
        bad(path ? `${path}.${k}` : k, 'UNKNOWN_KEY', `Unknown key "${k}". Allowed keys: ${allowed.join(', ')}.`);
      }
    }
    return true;
  };

  const oneOf = (v: unknown, path: string, allowed: readonly string[]) => {
    if (typeof v !== 'string' || !allowed.includes(v)) {
      bad(path, 'INVALID_ENUM', `${JSON.stringify(v)} is not allowed. Expected one of: ${allowed.join(', ')}.`);
    }
  };

  const str = (v: unknown, path: string) => {
    if (typeof v !== 'string' || v.length === 0) bad(path, 'INVALID_TYPE', 'must be a non-empty string.');
  };

  const bool = (v: unknown, path: string) => {
    if (typeof v !== 'boolean') bad(path, 'INVALID_TYPE', 'must be a boolean.');
  };

  const num = (v: unknown, path: string) => {
    if (typeof v !== 'number') bad(path, 'INVALID_TYPE', 'must be a number.');
  };

  const array = (v: unknown, path: string, required: boolean): v is unknown[] => {
    if (v === undefined && !required) return false;
    if (!Array.isArray(v)) {
      bad(path, 'INVALID_STRUCTURE', 'must be an array.');
      return false;
    }
    return true;
  };

  const params = (v: unknown, path: string, allowed: string[]) => {
    if (!keys(v, path, allowed)) return;
    for (const k of allowed) num(v[k], `${path}.${k}`);
  };

  if (!keys(config, '', ['version', 'theme', 'priceDisplay', 'interval', 'overlays', 'shadedAreas', 'subPanels', 'markers', 'viewport', 'hud'])) return;
  const c = config as Record<string, unknown>;

  oneOf(c.theme, 'theme', THEMES_ALLOWED);
  oneOf(c.priceDisplay, 'priceDisplay', PRICE_DISPLAYS);
  oneOf(c.interval, 'interval', INTERVALS);

  if (array(c.overlays, 'overlays', true)) {
    c.overlays.forEach((o, i) => {
      const base = `overlays[${i}]`;
      if (!isRecord(o)) return bad(base, 'INVALID_STRUCTURE', 'must be an object.');
      oneOf(o.type, `${base}.type`, OVERLAY_TYPES);
      switch (o.type) {
        case 'sma':
        case 'ema':
          keys(o, base, ['type', 'id', 'params', 'color', 'label']);
          str(o.id, `${base}.id`); oneOf(o.color, `${base}.color`, COLORS);
          params(o.params, `${base}.params`, ['period']);
          break;
        case 'vwap':
          keys(o, base, ['type', 'id', 'params', 'color', 'label']);
          str(o.id, `${base}.id`); oneOf(o.color, `${base}.color`, COLORS);
          params(o.params, `${base}.params`, []);
          break;
        case 'bollinger_bands':
          keys(o, base, ['type', 'params', 'bands']);
          params(o.params, `${base}.params`, ['period', 'stdDev']);
          if (keys(o.bands, `${base}.bands`, ['upper', 'lower', 'basis'])) {
            for (const band of ['upper', 'lower', 'basis'] as const) {
              const bp = `${base}.bands.${band}`;
              const b = (o.bands as Record<string, unknown>)[band];
              if (keys(b, bp, ['id', 'color', 'label'])) { str(b.id, `${bp}.id`); oneOf(b.color, `${bp}.color`, COLORS); }
            }
          }
          break;
      }
    });
  }

  if (array(c.shadedAreas, 'shadedAreas', true)) {
    c.shadedAreas.forEach((a, i) => {
      const base = `shadedAreas[${i}]`;
      if (!keys(a, base, ['fromOverlayId', 'toOverlayId', 'color', 'opacity'])) return;
      str(a.fromOverlayId, `${base}.fromOverlayId`); str(a.toOverlayId, `${base}.toOverlayId`);
      oneOf(a.color, `${base}.color`, COLORS); num(a.opacity, `${base}.opacity`);
    });
  }

  if (array(c.subPanels, 'subPanels', true)) {
    c.subPanels.forEach((p, i) => {
      const base = `subPanels[${i}]`;
      if (!isRecord(p)) return bad(base, 'INVALID_STRUCTURE', 'must be an object.');
      oneOf(p.type, `${base}.type`, SUB_PANEL_TYPES);
      if (p.type === 'rsi') { keys(p, base, ['type', 'params']); params(p.params, `${base}.params`, ['period']); }
      else if (p.type === 'macd' || p.type === 'volume') keys(p, base, ['type']);
    });
  }

  if (array(c.markers, 'markers', false)) {
    c.markers.forEach((m, i) => {
      const base = `markers[${i}]`;
      if (!keys(m, base, ['timestamp', 'price', 'kind', 'label'])) return;
      // Numeric/kind semantics are reported by validateMarkers; only guard the shape here.
      if (m.label !== undefined && typeof m.label !== 'string') bad(`${base}.label`, 'INVALID_TYPE', 'must be a string.');
    });
  }

  if (keys(c.viewport, 'viewport', ['visibleCandles', 'followLive'])) {
    num(c.viewport.visibleCandles, 'viewport.visibleCandles'); bool(c.viewport.followLive, 'viewport.followLive');
  }
  if (keys(c.hud, 'hud', ['showOhlcHud'])) bool(c.hud.showOhlcHud, 'hud.showOhlcHud');
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
