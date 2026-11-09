import { normalizeChartConfig } from './normalize';
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

describe('normalizeChartConfig', () => {
  it('does not mutate the input config', () => {
    const config = baseConfig();
    const clone = JSON.parse(JSON.stringify(config));
    normalizeChartConfig(config);
    expect(config).toEqual(clone);
  });

  // ─── markers ────────────────────────────────────────────────────────────

  it('defaults markers to [] when omitted', () => {
    const config = baseConfig();
    delete (config as { markers?: unknown }).markers;
    expect(normalizeChartConfig(config).markers).toEqual([]);
  });

  it('passes markers through unchanged when provided', () => {
    const markers = [{ timestamp: 1000, price: 100, kind: 'entry-long' as const }];
    expect(normalizeChartConfig({ ...baseConfig(), markers }).markers).toEqual(markers);
  });

  // ─── subPanels ────────────────────────────────────────────────────────────

  it('clamps an out-of-range rsi period', () => {
    const config: ChartConfig = { ...baseConfig(), subPanels: [{ type: 'rsi', params: { period: 9999 } }] };
    const normalized = normalizeChartConfig(config);
    const rsi = normalized.subPanels.find((p) => p.type === 'rsi');
    expect(rsi).toMatchObject({ params: { period: 500 } });
  });

  it('passes macd subPanel through unchanged (no params)', () => {
    const config: ChartConfig = { ...baseConfig(), subPanels: [{ type: 'macd' }] };
    expect(normalizeChartConfig(config).subPanels).toEqual([{ type: 'macd' }]);
  });

  it('passes volume subPanel through unchanged (no params)', () => {
    const config: ChartConfig = { ...baseConfig(), subPanels: [{ type: 'volume' }] };
    expect(normalizeChartConfig(config).subPanels).toEqual([{ type: 'volume' }]);
  });

  // ─── viewport / overlays (pre-existing behavior, sanity-checked) ──────────

  it('clamps visibleCandles into [10, 500]', () => {
    expect(normalizeChartConfig({ ...baseConfig(), viewport: { visibleCandles: 1, followLive: true } })
      .viewport.visibleCandles).toBe(10);
    expect(normalizeChartConfig({ ...baseConfig(), viewport: { visibleCandles: 9999, followLive: true } })
      .viewport.visibleCandles).toBe(500);
  });

  it('defaults an sma overlay label from its period', () => {
    const config: ChartConfig = {
      ...baseConfig(),
      overlays: [{ type: 'sma', id: 'sma-20', params: { period: 20 }, color: 'blue' }],
    };
    expect(normalizeChartConfig(config).overlays[0]).toMatchObject({ label: 'SMA 20' });
  });
});
