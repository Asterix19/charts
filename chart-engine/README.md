# `@stacklatte/chart-engine`

The framework-agnostic core behind Stacklatte's trading charts. **Zero runtime dependencies**, no React, no DOM — just the parts that are hard to get right:

- **Tested indicator math** — SMA, EMA, Wilder-smoothed RSI, MACD (12/26/9, correctly seeded and aligned), Bollinger Bands (O(n) sliding window).
- **Viewport engine** — pan, pinch/wheel zoom with soft zoom-out resistance, live-follow, scroll bounds, nice time/price ticks.
- **Geometry** — candle bodies/wicks, volume bars, MACD histogram, smooth line points, pixel-synced trade markers (entry / exit / stop-loss / take-profit).
- **`ChartConfig`** — a versioned, closed-enum declarative document + generated JSON Schema (`dist/ChartConfig.schema.json`) so LLM agents can produce chart setups that either compile or fail with a precise error. See [`llms.txt`](./llms.txt).

## Which package do I want?

| I'm building… | Install |
|---|---|
| React Native app | [`@stacklatte/chart-native`](../chart-native) |
| Web app (React) | [`@stacklatte/chart-react`](../chart-react) |
| Angular app | [`@stacklatte/chart-angular`](../chart-angular) |
| A headless service, worker or backtest (no UI) | `@stacklatte/chart-engine` |

```sh
npm install @stacklatte/chart-engine
```

```ts
import { calcRSI, calcEMA, buildChartPipeline, normalizeCandles } from '@stacklatte/chart-engine';

const candles = normalizeCandles(raw);        // sort + dedupe by timestamp
const rsi = calcRSI(candles, 14);             // [{ timestamp, value }]
const props = buildChartPipeline(config, candles); // validated renderer props
```

MIT licensed.

## Guides, demos and tests

- **Guide:** [Node / headless guide](../docs/node-engine.md) · [all docs](../docs/README.md) · [API reference](../docs/api-reference.md) · [for LLMs: `llms.txt`](./llms.txt)
- **Runnable demo:** `npm run demo -w engine-demo` and `npm run bench -w engine-demo` — serves 35 scenarios (feature, edge, stress, live) at `/#/scenarios/<id>`
- **Measured:** RSI over 1,000,000 candles in ~78 ms; `calcRSI` alone is 657 B gzipped; the whole engine 8.4 kB.
- **Tested like people depend on it:** the same scenario catalogue runs on every platform, with performance budgets and a compatibility oracle against the published packages — see [Testing](../docs/testing.md).
