import { compileChartConfig } from './compiler';
import { validateChartConfig } from './validate';
import type { ChartConfig } from './config';
import type { Candle } from './types';

// ─── helpers ──────────────────────────────────────────────────────────────

const candles: Candle[] = Array.from({ length: 30 }, (_, i) => ({
  timestamp: 1000 + i * 60_000,
  open: 100,
  high: 101,
  low: 99,
  close: 100,
}));

const baseConfig: ChartConfig = {
  version: '1',
  theme: 'dark',
  priceDisplay: 'candle',
  interval: '1m',
  overlays: [],
  shadedAreas: [],
  subPanels: [],
  viewport: { visibleCandles: 20, followLive: true },
  hud: { showOhlcHud: false },
} as unknown as ChartConfig; // `markers` intentionally omitted — see backward-compat test below

// ─── markers backward compatibility ────────────────────────────────────────
// ChartConfig.markers was added after subPanels/overlays/shadedAreas already
// shipped as required arrays. It must stay optional so configs built before
// this field existed don't crash validateChartConfig/compileChartConfig.

describe('ChartConfig.markers backward compatibility', () => {
  it('validateChartConfig does not throw when markers is omitted', () => {
    expect(() => validateChartConfig(baseConfig)).not.toThrow();
    expect(validateChartConfig(baseConfig).valid).toBe(true);
  });

  it('compileChartConfig does not throw when markers is omitted', () => {
    expect(() => compileChartConfig(baseConfig, candles)).not.toThrow();
  });

  it('compileChartConfig defaults markers to [] when omitted', () => {
    const compiled = compileChartConfig(baseConfig, candles);
    expect(compiled.markers).toEqual([]);
  });

  it('compileChartConfig passes markers through unchanged when provided', () => {
    const config: ChartConfig = {
      ...baseConfig,
      markers: [{ timestamp: 1000, price: 100, kind: 'entry-long' }],
    };
    const compiled = compileChartConfig(config, candles);
    expect(compiled.markers).toEqual([{ timestamp: 1000, price: 100, kind: 'entry-long' }]);
  });
});

// ─── subPanel compilation ───────────────────────────────────────────────────

describe('compileChartConfig subPanels', () => {
  it('sets showMacdPanel when a macd subPanel is present', () => {
    const config: ChartConfig = { ...baseConfig, subPanels: [{ type: 'macd' }] };
    expect(compileChartConfig(config, candles).showMacdPanel).toBe(true);
  });

  it('sets showVolumePanel when a volume subPanel is present', () => {
    const config: ChartConfig = { ...baseConfig, subPanels: [{ type: 'volume' }] };
    expect(compileChartConfig(config, candles).showVolumePanel).toBe(true);
  });

  it('leaves showMacdPanel/showVolumePanel false when absent', () => {
    const compiled = compileChartConfig(baseConfig, candles);
    expect(compiled.showMacdPanel).toBe(false);
    expect(compiled.showVolumePanel).toBe(false);
  });
});
