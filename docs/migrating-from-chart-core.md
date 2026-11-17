# Migrating from `@stacklatte/chart-core` and `@stacklatte/chart-web`

Both packages are **deprecated**. They were split and renamed, and they are no longer maintained: their last versions stay on npm and keep working, but they do not get new features (the area chart, sparklines, the Lab generator) or fixes.

| Old name | Replace with | Notes |
|---|---|---|
| `@stacklatte/chart-core` (React Native + engine in one package) | **`@stacklatte/chart-native`** for the React Native `SLChart`, and **`@stacklatte/chart-engine`** for the math | identical exports, so it is a find-and-replace of the import path |
| `@stacklatte/chart-core/core` (just the math) | `@stacklatte/chart-engine` | identical exports |
| `@stacklatte/chart-web` (React, browser) | **`@stacklatte/chart-react`** | identical exports. It was renamed because "web" suggested a framework-agnostic package while it is React-only (Angular has `@stacklatte/chart-angular`) |

```diff
- import { SLChart, calcEMA } from '@stacklatte/chart-core';
+ import { SLChart, calcEMA } from '@stacklatte/chart-native';

- import { SLChart, calcEMA } from '@stacklatte/chart-web';
+ import { SLChart, calcEMA } from '@stacklatte/chart-react';

- import { calcRSI, buildChartPipeline } from '@stacklatte/chart-core/core';
+ import { calcRSI, buildChartPipeline } from '@stacklatte/chart-engine';
```

Then `npm uninstall @stacklatte/chart-core` (or `chart-web`) and install the replacement. Nothing else changes: props, themes, indicator numbers and `ChartConfig` compilation are verified identical (see below).

## How the replacement is verified

The contract tests download the last published `chart-core@2.3.3` and `chart-web@1.3.2` and check that:

- every export they had still exists in the replacement,
- the engine's output (indicators, layout, ticks, `ChartConfig` pipeline) is identical for the same inputs,
- every scenario renders the same pixels in the browser (the renderer oracle), and on an iOS simulator (`npm run test:native:compat`).

The only differences are the deliberate fixes listed at the end of this page. See [Testing](./testing.md).

## Old configs: keep the lenient validation

The old `chart-core` accepted mistakes in a `ChartConfig` and fell back silently (an unknown `theme` or `interval`, a raw hex colour, an extra key). `chart-native`, `chart-engine`, `chart-react` and `chart-angular` are **strict by default**: they reject those with an itemised error. If you have stored configs that relied on the old leniency, pass `{ strict: false }` while you fix them. The result is identical to what `chart-core` 2.3 produced.

```ts
import { buildChartPipeline } from '@stacklatte/chart-engine';
import type { Candle, ChartConfig } from '@stacklatte/chart-engine';

export function compileLegacy(config: ChartConfig, candles: Candle[]) {
  return buildChartPipeline(config, candles, { strict: false }); // the old, lenient behaviour
}
```

## What changed in behaviour

These are deliberate fixes; everything else is unchanged and verified identical.

| Before (`chart-core` 2.3 / `chart-web` 1.3) | Now |
|---|---|
| `buildChartPipeline` accepted any `theme` / `interval` / colour string and fell back silently (e.g. `theme: 'neon'` rendered dark) | closed enums and unknown keys are rejected with an itemised error. Pass `{ strict: false }` for the old behaviour |
| one `NaN` / `Infinity` candle made the whole price range `NaN` and the chart blank | undrawable candles are dropped; a garbage `volume` is stripped |
| an invalid indicator period threw a `TypeError` (`calcEMA` for any invalid period; `calcRSI` for negative, `1.5` or `NaN`; `calcSMA` / `calcBollingerBands` for `0`, negative or `1.5`), and `calcRSI(…, 0)` returned `NaN` values; in a chart this crashed the render | indicators return no data (`[]` / `null`) |
| a container too small for its panels produced a negative plot size | sizes are clamped to at least 1 px |
| the `vwap` overlay was accepted by `ChartConfig` but silently skipped ("not yet implemented") | it is implemented: cumulative volume-weighted typical price |
| React Native path building used the deprecated Skia `SkPath` mutation API | uses `Skia.PathBuilder` (with a fallback for older Skia) |
| dragging, zooming or hovering over the RSI / MACD / volume panels did nothing on the web | the whole chart responds, panels included |
