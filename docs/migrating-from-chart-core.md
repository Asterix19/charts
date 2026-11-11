# Migrating from `@stacklatte/chart-core`

`@stacklatte/chart-core` was one package containing the engine *and* the React Native renderer. It has been split so that each platform installs only what it needs. **Nothing breaks if you do not migrate** — `chart-core` 2.4 is now a thin re-export:

| You import | You get |
|---|---|
| `@stacklatte/chart-core` | everything from `@stacklatte/chart-native` (the React Native `SLChart` and the engine) |
| `@stacklatte/chart-core/core` | everything from `@stacklatte/chart-engine` |

The contract tests download `chart-core@2.3.3` and verify that every export it had still exists and that the engine's output is identical (see [Testing](./testing.md)).

## When to migrate

- **React Native app:** replace `@stacklatte/chart-core` with `@stacklatte/chart-native`. The exports are identical — it is a find-and-replace of the import path.
- **Web app:** you were probably using `@stacklatte/chart-web`, which no longer pulls in the React Native package (it now depends only on `@stacklatte/chart-engine` and `@stacklatte/chart-canvas`).
- **Code that imported `@stacklatte/chart-core/core`** (just the math): switch to `@stacklatte/chart-engine`.

```tsx
// before
import { SLChart, calcEMA } from '@stacklatte/chart-core';

// after
import { SLChart, calcEMA } from '@stacklatte/chart-native';
```

## Upgrading `chart-core` is safe: it keeps its legacy behaviour

`@stacklatte/chart-core` 2.4 is deliberately **not** stricter than 2.3. The `ChartConfig` pipeline (`buildChartPipeline`, `validateChartConfig`) exported from `@stacklatte/chart-core` still accepts what 2.x accepted — an unknown `theme` or `interval`, a raw hex colour, an extra key — so a config that rendered before still renders. Only the genuinely broken cases changed (below). Pass `{ strict: true }` to opt in to strict validation, or import from `@stacklatte/chart-native` / `@stacklatte/chart-engine`, where strict is the default.

```ts
import { buildChartPipeline } from '@stacklatte/chart-core';
import type { Candle, ChartConfig } from '@stacklatte/chart-core';

export function compile(config: ChartConfig, candles: Candle[]) {
  return buildChartPipeline(config, candles, { strict: true }); // opt in to strict validation
}
```

## What changed in behaviour

These are deliberate fixes; everything else (numbers, props, themes, config compilation) is unchanged and verified identical.

| Before | Now |
|---|---|
| `buildChartPipeline` accepted any `theme` / `interval` / colour string and fell back silently (e.g. `theme: 'neon'` rendered dark) | **`chart-native` / `chart-engine` / `chart-web` / `chart-angular`:** closed enums and unknown keys are rejected with an itemised error. **`chart-core` keeps the lenient behaviour** unless you pass `{ strict: true }` |
| one `NaN` / `Infinity` candle made the whole price range `NaN` and the chart blank | undrawable candles are dropped; a garbage `volume` is stripped |
| an invalid indicator period threw a `TypeError` (`calcEMA` for any invalid period; `calcRSI` for negative, `1.5` or `NaN`; `calcSMA` / `calcBollingerBands` for `0`, negative or `1.5`), and `calcRSI(…, 0)` returned `NaN` values — in a chart this crashed the render | indicators return no data (`[]` / `null`) |
| a container too small for its panels produced a negative plot size | sizes are clamped to at least 1 px |
| the `vwap` overlay was accepted by `ChartConfig` but silently skipped ("not yet implemented") | it is implemented: cumulative volume-weighted typical price |
| React Native path building used the deprecated Skia `SkPath` mutation API | uses `Skia.PathBuilder` (with a fallback for older Skia) |
