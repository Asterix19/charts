# Choosing a package

All packages share one engine, so the same data, props, themes and `ChartConfig` work everywhere. Pick the one for your platform.

| You are building… | Install | Entry point |
|---|---|---|
| a **React** or **Next.js** web app | `npm install @stacklatte/chart-react` | `SLChart` |
| a **React Native** (Expo or bare) app | `npm install @stacklatte/chart-native @shopify/react-native-skia react-native-gesture-handler` | `SLChart` |
| an **Angular** (19+) app | `npm install @stacklatte/chart-angular` | `<sl-chart>` |
| a **Node** script, worker or server (no UI) | `npm install @stacklatte/chart-engine` | `calcRSI`, `buildChartPipeline`, … |
| an app that **already uses `@stacklatte/chart-core`** | nothing — it keeps working | see [migrating](./migrating-from-chart-core.md) |

## How the packages fit together

```
chart-engine   — indicators, viewport math, geometry, themes, ChartConfig pipeline (zero dependencies)
   ├─ chart-engine/canvas — Canvas 2D drawing + ChartController (separate entry point, DOM only when imported)
   │     ├─ chart-react       — React component   (SLChart)
   │     └─ chart-angular   — Angular component (<sl-chart>)
   ├─ chart-native   — React Native / Skia component (SLChart)
   └─ chart-core     — legacy name; re-exports chart-native (+ the engine at /core)
```

Every renderer re-exports the whole engine, so `import { calcRSI } from '@stacklatte/chart-react'` works — you never need to install the engine separately.

## Size (gzipped, measured)

| What you ship | Size |
|---|---|
| `calcRSI` only (tree-shaken) | 657 B |
| the whole engine | 8.4 kB |
| a web app using `SLChart` (engine + drawing code included) | about 10.4 kB |
| the Canvas 2D renderer (`ChartController`, used by the Angular component) | about 11 kB |

These numbers are enforced by a budget test, so they cannot grow unnoticed.

## Same props everywhere

`SLChart` (React, React Native), `<sl-chart>` (Angular) and `ChartController` (vanilla) take the same properties. A snippet for one platform translates directly to another — see the [API reference](./api-reference.md) for the full list.

```tsx
import { SLChart } from '@stacklatte/chart-react'; // or '@stacklatte/chart-native'
import type { Candle } from '@stacklatte/chart-react';

export function Example({ candles }: { candles: Candle[] }) {
  return <SLChart data={candles} width={800} height={480} theme="dark" showVolumePanel showRsiPanel showOhlcHud />;
}
```
