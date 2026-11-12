# Stacklatte Charts — documentation

Trading charts (candlesticks, RSI, MACD, Bollinger Bands, volume, trade markers, pan/zoom, live streaming) for React, React Native, Angular, plain JavaScript and Node. One shared engine, five renderers.

**Start here:** [Choosing a package](./choosing-a-package.md)

| Guide | What it covers |
|---|---|
| [Choosing a package](./choosing-a-package.md) | Which `@stacklatte/*` package for which platform, with measured bundle sizes |
| [React / Next.js](./react.md) | `@stacklatte/chart-react` |
| [React Native](./react-native.md) | `@stacklatte/chart-native` (Skia) |
| [Angular](./angular.md) | `@stacklatte/chart-angular` (`<sl-chart>`) |
| [Headless / Node](./node-engine.md) | `@stacklatte/chart-engine` — indicators and viewport math without any UI |
| [Generate charts with an LLM](./chartconfig-llm.md) | The validated, closed-enum `ChartConfig` + JSON Schema workflow |
| [Live data](./live-data.md) | Streaming candles from a WebSocket or poll |
| [Performance](./performance.md) | Measured frame times at 2k–50k candles, and how to stay fast |
| [Testing](./testing.md) | The scenario catalogue and how every platform is tested |
| [Migrating from `chart-core`](./migrating-from-chart-core.md) | Moving off the legacy package name |
| [Troubleshooting](./troubleshooting.md) | Common mistakes and their fixes |
| [API reference](./api-reference.md) | Every export and every prop, generated from the shipped types |

For AI coding agents: [`../llms.txt`](../llms.txt) is the short entry point and [`../llms-full.txt`](../llms-full.txt) contains all of this documentation in one file.
