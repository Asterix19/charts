import { validateChartConfig } from './validate';
import type { ChartConfig } from './config';

// ─── helpers ──────────────────────────────────────────────────────────────

const baseConfig = (): ChartConfig => ({
  version: '1',
  theme: 'dark',
  priceDisplay: 'candle',
  interval: '1m',
  overlays: [],
  shadedAreas: [],
  subPanels: [],
  viewport: { visibleCandles: 60, followLive: true },
  hud: { showOhlcHud: false },
});

// ─── baseline ───────────────────────────────────────────────────────────────

describe('validateChartConfig', () => {
  it('accepts a minimal valid config', () => {
    expect(validateChartConfig(baseConfig())).toEqual({ valid: true });
  });

  it('rejects an unsupported version', () => {
    const config = { ...baseConfig(), version: '2' } as unknown as ChartConfig;
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === 'INVALID_VERSION')).toBe(true);
    }
  });

  // ─── overlays / shadedAreas (pre-existing behavior, sanity-checked) ───────

  it('flags a duplicate overlay id', () => {
    const config: ChartConfig = {
      ...baseConfig(),
      overlays: [
        { type: 'sma', id: 'dup', params: { period: 10 }, color: 'blue' },
        { type: 'ema', id: 'dup', params: { period: 20 }, color: 'red' },
      ],
    };
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === 'DUPLICATE_OVERLAY_ID')).toBe(true);
    }
  });

  it('flags a shadedArea referencing an unknown overlay id', () => {
    const config: ChartConfig = {
      ...baseConfig(),
      overlays: [{ type: 'sma', id: 'sma-10', params: { period: 10 }, color: 'blue' }],
      shadedAreas: [{ fromOverlayId: 'sma-10', toOverlayId: 'missing', color: 'blue', opacity: 0.2 }],
    };
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === 'SHADED_AREA_UNKNOWN_REF')).toBe(true);
    }
  });

  it('flags visibleCandles outside [10, 500]', () => {
    const config: ChartConfig = { ...baseConfig(), viewport: { visibleCandles: 5, followLive: true } };
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === 'INVALID_VISIBLE_CANDLES')).toBe(true);
    }
  });

  it('flags an invalid rsi subPanel period', () => {
    const config: ChartConfig = { ...baseConfig(), subPanels: [{ type: 'rsi', params: { period: 0 } }] };
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === 'INVALID_PERIOD')).toBe(true);
    }
  });

  it('accepts macd and volume subPanels with no params to validate', () => {
    const config: ChartConfig = { ...baseConfig(), subPanels: [{ type: 'macd' }, { type: 'volume' }] };
    expect(validateChartConfig(config).valid).toBe(true);
  });

  // ─── markers ────────────────────────────────────────────────────────────

  it('accepts a config with no markers field at all', () => {
    const config = baseConfig();
    delete (config as { markers?: unknown }).markers;
    expect(validateChartConfig(config).valid).toBe(true);
  });

  it('accepts an empty markers array', () => {
    expect(validateChartConfig({ ...baseConfig(), markers: [] }).valid).toBe(true);
  });

  it('accepts a well-formed marker of every kind', () => {
    const kinds = ['entry-long', 'exit-long', 'entry-short', 'exit-short', 'stop-loss', 'take-profit'] as const;
    const config: ChartConfig = {
      ...baseConfig(),
      markers: kinds.map((kind, i) => ({ timestamp: 1000 + i, price: 100 + i, kind })),
    };
    expect(validateChartConfig(config)).toEqual({ valid: true });
  });

  it('flags a non-finite marker timestamp', () => {
    const config: ChartConfig = {
      ...baseConfig(),
      markers: [{ timestamp: NaN, price: 100, kind: 'entry-long' }],
    };
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual([
        { path: 'markers[0].timestamp', code: 'INVALID_MARKER_TIMESTAMP', message: expect.any(String) },
      ]);
    }
  });

  it('flags an infinite marker price', () => {
    const config: ChartConfig = {
      ...baseConfig(),
      markers: [{ timestamp: 1000, price: Infinity, kind: 'stop-loss' }],
    };
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === 'INVALID_MARKER_PRICE')).toBe(true);
    }
  });

  it('flags an unrecognized marker kind', () => {
    const config = {
      ...baseConfig(),
      markers: [{ timestamp: 1000, price: 100, kind: 'take-profitt' }],
    } as unknown as ChartConfig;
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.code === 'INVALID_MARKER_KIND')).toBe(true);
    }
  });

  it('reports every invalid field, not just the first', () => {
    const config: ChartConfig = {
      ...baseConfig(),
      markers: [{ timestamp: NaN, price: NaN, kind: 'entry-long' }],
    };
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain('INVALID_MARKER_TIMESTAMP');
      expect(codes).toContain('INVALID_MARKER_PRICE');
    }
  });

  it('collects errors across multiple markers with correct indices', () => {
    const config: ChartConfig = {
      ...baseConfig(),
      markers: [
        { timestamp: 1000, price: 100, kind: 'entry-long' },
        { timestamp: NaN, price: 100, kind: 'entry-long' },
      ],
    };
    const result = validateChartConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual([
        { path: 'markers[1].timestamp', code: 'INVALID_MARKER_TIMESTAMP', message: expect.any(String) },
      ]);
    }
  });
});
