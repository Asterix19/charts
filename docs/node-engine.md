# Headless / Node (`@stacklatte/chart-engine`)

The engine has **zero dependencies and no UI**: indicators, viewport math, candle geometry, themes and the `ChartConfig` pipeline. Use it on a server, in a worker, in a backtest, or to power your own renderer.

```sh
npm install @stacklatte/chart-engine
```

ESM and CommonJS are both supported:

```js
import { calcRSI } from '@stacklatte/chart-engine';
const { calcRSI: rsi } = require('@stacklatte/chart-engine');
```

## Indicators

```ts
import { calcBollingerBands, calcEMA, calcMACD, calcRSI, normalizeCandles } from '@stacklatte/chart-engine';
import type { Candle } from '@stacklatte/chart-engine';

export function summarize(raw: Candle[]) {
  const candles = normalizeCandles(raw); // sort, dedupe, drop undrawable candles
  const rsi = calcRSI(candles, 14); // [{ timestamp, value }], values in [0, 100]
  const macd = calcMACD(candles); // { macd, signal, histogram } | null
  const ema = calcEMA(candles, 21, 'ema21', '#38bdf8'); // IndicatorLine | null
  const bands = calcBollingerBands(candles, 20, 2, { upper: '#888', lower: '#888', basis: '#fff' });

  return {
    rsi: rsi.at(-1)?.value,
    histogram: macd?.histogram.at(-1)?.value,
    ema: ema?.data.at(-1)?.value,
    upperBand: bands?.upper.data.at(-1)?.value,
  };
}
```

Every indicator returns an empty array / `null` rather than throwing when there is not enough data or the period is invalid (`0`, negative, non-integer).

### Throughput (Node, Apple Silicon, measured with `npm run bench -w engine-demo`)

| candles | `normalizeCandles` | `calcRSI` | `calcMACD` | `calcBollingerBands` |
|---|---|---|---|---|
| 10,000 | 0.1 ms | 0.2 ms | 0.3 ms | 0.5 ms |
| 100,000 | 0.4 ms | 3.2 ms | 8.1 ms | 12.7 ms |
| 1,000,000 | 5 ms | 78 ms | 127 ms | 136 ms |

## Geometry and viewport

```ts
import { buildCandleGeometry, computeLayout, computePriceRange } from '@stacklatte/chart-engine';
import type { Candle } from '@stacklatte/chart-engine';

export function geometry(candles: Candle[]) {
  const layout = computeLayout(800, 480, true, false, true); // width, height, rsi, macd, volume
  const { priceMin, priceMax } = computePriceRange(candles);
  const bars = buildCandleGeometry(candles, layout.chartWidth, layout.mainChartHeight, priceMin, priceMax, '#26a69a', '#ef5350');
  return { layout, bars };
}
```

`buildCandleGeometry` returns pixel rectangles and wicks you can draw anywhere (Canvas, SVG, a PDF).

## ChartConfig (declarative)

`buildChartPipeline(config, candles)` validates a JSON `ChartConfig` and compiles it to renderer props. See [Generate charts with an LLM](./chartconfig-llm.md).

## Full runnable demo

`examples/engine-demo` in the repository contains runnable scripts (`npm run demo`, `npm run config`, `npm run bench`) and ESM + CommonJS consumer tests.
