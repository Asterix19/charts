// Headless usage: compute indicators and viewport geometry with nothing but @stacklatte/chart-engine.
import { calcBollingerBands, calcEMA, calcMACD, calcRSI, normalizeCandles, buildCandleGeometry } from '@stacklatte/chart-engine';
import { getScenario } from '@stacklatte/chart-examples';

for (const id of ['basic', 'edge-dirty', 'edge-few']) {
  const raw = getScenario(id).data();
  const candles = normalizeCandles(raw); // sorts, dedupes and drops undrawable candles
  const rsi = calcRSI(candles, 14);
  const macd = calcMACD(candles);
  const bb = calcBollingerBands(candles, 20, 2, { upper: '#888', lower: '#888', basis: '#fff' });
  const ema = calcEMA(candles, 9, 'ema9', '#fa0');
  const last = <T extends { value: number }>(xs: T[] | undefined) => (xs && xs.length ? xs[xs.length - 1].value.toFixed(2) : 'n/a');

  console.log(`\n${id}: ${raw.length} raw → ${candles.length} usable candles`);
  console.log(`  RSI(14) last      ${last(rsi)}`);
  console.log(`  MACD histogram    ${last(macd?.histogram)}`);
  console.log(`  EMA(9) last       ${last(ema?.data)}`);
  console.log(`  Bollinger upper   ${last(bb?.upper.data)}`);
  if (candles.length >= 2) {
    const [lo, hi] = [Math.min(...candles.map((c) => c.low)), Math.max(...candles.map((c) => c.high))];
    const bars = buildCandleGeometry(candles.slice(-60), 800, 300, lo, hi, '#26a69a', '#ef5350');
    console.log(`  geometry          ${bars.length} bars for an 800x300 plot`);
  }
}
