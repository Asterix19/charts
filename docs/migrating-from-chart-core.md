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

## What changed in behaviour

These are deliberate fixes; everything else (numbers, props, themes, config compilation) is unchanged and verified identical.

| Before | Now |
|---|---|
| `buildChartPipeline` accepted any `theme` / `interval` / colour string and fell back silently (e.g. `theme: 'neon'` rendered dark) | closed enums and unknown keys are rejected with an itemised error |
| one `NaN` / `Infinity` candle made the whole price range `NaN` and the chart blank | undrawable candles are dropped; a garbage `volume` is stripped |
| an invalid indicator period (`0`, negative, `NaN`, `1.5`) threw a `TypeError` | indicators return no data (`[]` / `null`) |
| a container too small for its panels produced a negative plot size | sizes are clamped to at least 1 px |
| React Native path building used the deprecated Skia `SkPath` mutation API | uses `Skia.PathBuilder` (with a fallback for older Skia) |
