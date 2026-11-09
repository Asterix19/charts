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
| Web app (React) | [`@stacklatte/chart-web`](../chart-web) |
| Another framework (Angular, Vue, Svelte, Blazor interop) or a headless service | `@stacklatte/chart-engine` + your own renderer |

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
