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

// ─── structural validation: closed enums + unknown keys ─────────────────────

describe('validateChartConfig — closed enums and unknown keys', () => {
  const errorsFor = (patch: Record<string, unknown>) => {
    const result = validateChartConfig({ ...baseConfig(), ...patch } as unknown as ChartConfig);
    return result.valid ? [] : result.errors;
  };

  it.each([
    ['theme', 'neon'],
    ['priceDisplay', 'ohlc'],
    ['interval', '2h'],
  ])('rejects an out-of-enum %s instead of silently falling back', (field, value) => {
    const errors = errorsFor({ [field]: value });
    expect(errors).toContainEqual(expect.objectContaining({ path: field, code: 'INVALID_ENUM' }));
  });

  it('rejects a raw hex color — only the named palette is allowed', () => {
    const errors = errorsFor({ overlays: [{ type: 'sma', id: 'a', params: { period: 9 }, color: '#ff0000' }] });
    expect(errors).toContainEqual(expect.objectContaining({ path: 'overlays[0].color', code: 'INVALID_ENUM' }));
  });

  it('rejects an unknown overlay type and sub-panel type', () => {
    const errors = errorsFor({
      overlays: [{ type: 'ichimoku', id: 'a', params: {}, color: 'blue' }],
      subPanels: [{ type: 'stochastic' }],
    });
    expect(errors.map((e) => e.path)).toEqual(expect.arrayContaining(['overlays[0].type', 'subPanels[0].type']));
  });

  it('rejects unknown keys at the top level and nested', () => {
    const errors = errorsFor({
      sparkles: true,
      hud: { showOhlcHud: true, extra: 1 },
      overlays: [{ type: 'ema', id: 'a', params: { period: 9, smoothing: 2 }, color: 'cyan', width: 3 }],
    });
    const unknown = errors.filter((e) => e.code === 'UNKNOWN_KEY').map((e) => e.path);
    expect(unknown).toEqual(expect.arrayContaining(['sparkles', 'hud.extra', 'overlays[0].params.smoothing', 'overlays[0].width']));
  });

  it('reports missing arrays/objects as itemized errors instead of throwing', () => {
    const doc = { version: '1', theme: 'dark', priceDisplay: 'candle', interval: '1m' } as unknown as ChartConfig;
    let result: ReturnType<typeof validateChartConfig> | undefined;
    expect(() => { result = validateChartConfig(doc); }).not.toThrow();
    const errors = result && !result.valid ? result.errors : [];
    expect(errors.map((e) => e.path)).toEqual(expect.arrayContaining(['overlays', 'shadedAreas', 'subPanels', 'viewport', 'hud']));
  });

  it('rejects non-object input', () => {
    expect(validateChartConfig(null as unknown as ChartConfig).valid).toBe(false);
    expect(validateChartConfig([] as unknown as ChartConfig).valid).toBe(false);
  });

  it('reports every problem in one pass (LLM-friendly)', () => {
    const errors = errorsFor({ theme: 'neon', interval: '2h', sparkles: 1 });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('still accepts a fully-populated valid config', () => {
    const full: ChartConfig = {
      ...baseConfig(),
      overlays: [
        { type: 'ema', id: 'e', params: { period: 9 }, color: 'cyan', label: 'EMA' },
        { type: 'bollinger_bands', params: { period: 20, stdDev: 2 }, bands: {
          upper: { id: 'u', color: 'blue' }, lower: { id: 'l', color: 'blue' }, basis: { id: 'b', color: 'gray', label: 'mid' } } },
        { type: 'vwap', id: 'v', params: {}, color: 'orange' },
      ],
      shadedAreas: [{ fromOverlayId: 'u', toOverlayId: 'l', color: 'blue', opacity: 0.2 }],
      subPanels: [{ type: 'rsi', params: { period: 14 } }, { type: 'macd' }, { type: 'volume' }],
      markers: [{ timestamp: 1, price: 2, kind: 'entry-long', label: 'in' }],
    };
    expect(validateChartConfig(full)).toEqual({ valid: true });
  });
});

// ─── strict (default) vs lenient (legacy chart-core 2.x) ─────────────────────

describe('validateChartConfig — strict option', () => {
  const lenient = (patch: Record<string, unknown>) => validateChartConfig({ ...baseConfig(), ...patch } as unknown as ChartConfig, { strict: false });
  const strict = (patch: Record<string, unknown>) => validateChartConfig({ ...baseConfig(), ...patch } as unknown as ChartConfig);

  it.each([
    ['out-of-enum theme', { theme: 'neon' }],
    ['out-of-enum interval', { interval: '2h' }],
    ['unknown top-level key', { sparkles: true }],
    ['wrongly typed scalar', { viewport: { visibleCandles: 60, followLive: 'yes' } }],
    ['raw hex colour', { overlays: [{ type: 'sma', id: 'a', params: { period: 9 }, color: '#ff0000' }] }],
  ])('lenient mode still accepts %s (what chart-core 2.x accepted); strict mode rejects it', (_name, patch) => {
    expect(lenient(patch)).toEqual({ valid: true });
    expect(strict(patch).valid).toBe(false);
  });

  it('lenient mode still enforces the semantic rules', () => {
    expect(lenient({ overlays: [{ type: 'sma', id: 'a', params: { period: 0 }, color: 'blue' }] }).valid).toBe(false);
    expect(lenient({ viewport: { visibleCandles: 5, followLive: true } }).valid).toBe(false);
    expect(lenient({ version: '2' }).valid).toBe(false);
  });

  it('lenient mode still refuses shapes that would crash the compiler', () => {
    for (const patch of [{ overlays: undefined }, { viewport: null }, { subPanels: {} }]) expect(lenient(patch as never).valid, JSON.stringify(patch)).toBe(false);
  });

  it('strict is the default', () => {
    expect(validateChartConfig({ ...baseConfig(), theme: 'neon' } as unknown as ChartConfig).valid).toBe(false);
  });
});
