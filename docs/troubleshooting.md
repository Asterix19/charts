# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Nothing renders / blank box | `width` or `height` is `0`, `undefined` or a string like `"100%"` | Pass numbers in pixels. For responsive layouts measure the container with `ResizeObserver` — see the [React guide](./react.md). |
| "No data" is shown | `data` is empty, or every candle was dropped for having a non-finite price or timestamp | Check that `timestamp` is **Unix milliseconds** (not seconds) and that `open/high/low/close` are finite numbers. |
| Candles are squeezed into the far left / time axis looks wrong | `timestamp` is in **seconds** | Multiply by 1000. |
| The volume panel is empty | candles have no `volume` | Add `volume` to each candle. |
| The MACD panel is missing | fewer than ~35 candles, so MACD(12,26,9) cannot be computed | Provide more candles; the panel is omitted until it can be drawn. |
| The VWAP overlay is missing | the candles have no `volume` (VWAP weights by volume) | Add `volume` to each candle. |
| An indicator line does not appear | `calcEMA` / `calcSMA` / `calcBollingerBands` returned `null` (fewer candles than the period) | Filter out `null`s before passing `indicators`. |
| `shadedAreas` draws nothing | `fromId` / `toId` do not match any `IndicatorLine.id` in `indicators` | Use the ids of the lines you pass (e.g. `bb.upper.id`, `bb.lower.id`). |
| `Invalid ChartConfig: [INVALID_ENUM] …` | a value outside the allowed enum (theme, interval, colour, …) or a raw hex colour | Use the values listed in the error; `ChartConfig` colours are palette names (`cyan`, `blue`, …). |
| `Invalid ChartConfig: [UNKNOWN_KEY] …` | a key that is not part of the config | Remove it — see the allowed keys in the message. |
| Next.js: `window`/`document` is not defined, or hydration warnings | the chart was rendered in a server component | Put it in a client component (`'use client'`). |
| React Native: gestures do nothing | the app is not wrapped in `GestureHandlerRootView` | See the [React Native guide](./react-native.md). |
| React Native: Skia / reanimated errors at startup | peer versions mismatch | Use `@shopify/react-native-skia` ≥ 2 and `react-native-gesture-handler` ≥ 2; rebuild the dev client after installing native modules. |
| Angular: nothing draws during SSR | by design — the canvas is created in the browser after first render | Nothing to fix. |
| `buildChartPipeline` throws `Invalid ChartConfig` after moving from `chart-core` to `chart-native` / `chart-engine` | strict validation is the default there; `chart-core` stays lenient | Fix the config (the error lists the allowed values), or pass `{ strict: false }` to keep the old behaviour. |
| Old code uses `zoomLevel` or `ChartCanvas` | names from earlier versions | The component is `SLChart`; the visible-candle count is `visibleDataPoints`. See the [API reference](./api-reference.md). |
| The chart feels slow with live data | a new `indicators` / `theme` object on every render, or an unbounded candle array | See [performance](./performance.md). |
