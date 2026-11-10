// The LLM path: a model emits a ChartConfig (JSON); buildChartPipeline either compiles it or throws an
// itemised, machine-readable error the model can use to correct itself.
import { buildChartPipeline, validateChartConfig, type ChartConfig } from '@stacklatte/chart-engine';
import { generateCandles } from '@stacklatte/chart-examples';

const candles = generateCandles(200);

const good: ChartConfig = {
  version: '1', theme: 'dark', priceDisplay: 'candle', interval: '1m',
  overlays: [{ type: 'ema', id: 'ema-9', params: { period: 9 }, color: 'cyan' }],
  shadedAreas: [], subPanels: [{ type: 'rsi', params: { period: 14 } }],
  viewport: { visibleCandles: 100, followLive: true }, hud: { showOhlcHud: true },
};

// What a model typically gets wrong: invented enum values, raw hex colours, made-up keys.
const hallucinated = { ...good, theme: 'neon', interval: '2h', sparkles: true,
  overlays: [{ type: 'ema', id: 'e', params: { period: 9 }, color: '#00ffff' }] } as unknown as ChartConfig;

console.log('valid config   →', Object.keys(buildChartPipeline(good, candles)).join(', '));

const result = validateChartConfig(hallucinated);
if (!result.valid) {
  console.log('\nhallucinated config is rejected with every problem at once:');
  for (const e of result.errors) console.log(`  [${e.code}] ${e.path}: ${e.message}`);
}
