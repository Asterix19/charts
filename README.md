# Stacklatte Charts

![Demo](./assets/gifs/demo.gif)

High-performance trading charts for React Native and the web. Open-source, MIT licensed.

- **[`@stacklatte/chart-native`](./chart-native)** — React Native, GPU-accelerated rendering at 60 fps on iOS and Android via [React Native Skia](https://shopify.github.io/react-native-skia/).
- **[`@stacklatte/chart-web`](./chart-web)** — plain web, rendered with HTML5 Canvas 2D. No React Native, no WASM.
- **[`@stacklatte/chart-angular`](./chart-angular)** — Angular standalone `<sl-chart>` component (Canvas 2D, SSR-safe, zoneless-friendly).
- **[`@stacklatte/chart-canvas`](./chart-canvas)** — framework-agnostic `ChartController` + drawing primitives; wrap the chart in Vue, Svelte or plain JS.
- **[`@stacklatte/chart-engine`](./chart-engine)** — the zero-dependency, framework-agnostic engine both renderers share (viewport, indicators, geometry, the `ChartConfig` compiler + JSON Schema). Build your own renderer (Angular, Vue, …) on top of it.
- **[`@stacklatte/chart-core`](./chart-core)** — the original name, kept as a thin re-export of `chart-native` / `chart-engine` so existing installs keep working.

**Building this with an LLM or coding agent?** Read [`llms.txt`](./llms.txt) first — it points at the declarative `ChartConfig` pipeline (validated, closed-enum config + a generated JSON Schema you can hand directly to structured output / tool-calling) instead of hand-written props, so generated setup can't reference a color or prop that doesn't exist.

[![npm](https://img.shields.io/npm/v/@stacklatte/chart-native)](https://www.npmjs.com/package/@stacklatte/chart-native)
[![npm](https://img.shields.io/npm/v/@stacklatte/chart-engine)](https://www.npmjs.com/package/@stacklatte/chart-engine)
[![npm](https://img.shields.io/npm/v/@stacklatte/chart-web)](https://www.npmjs.com/package/@stacklatte/chart-web)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

---

## Install

```sh
npm install @stacklatte/chart-native @shopify/react-native-skia react-native-gesture-handler
```

```tsx
import { SLChart } from '@stacklatte/chart-native';
import type { Candle } from '@stacklatte/chart-native';

export default function App() {
  return (
    <SLChart
      data={candles}
      width={screenWidth}
      height={400}
      theme="dark"
    />
  );
}
```

See the [full README](./chart-native/README.md) for all examples.

For plain web apps, use `@stacklatte/chart-web` instead — same props, no React Native:

```sh
npm install @stacklatte/chart-web
```

```tsx
import { SLChart } from '@stacklatte/chart-web';

export default function App() {
  return <SLChart data={candles} width={800} height={400} theme="dark" />;
}
```

See the [chart-web README](./chart-web/README.md) for all examples.

---

## Monorepo structure

```
├── chart-engine/         @stacklatte/chart-engine — platform-agnostic logic (no UI deps)
├── chart-canvas/         @stacklatte/chart-canvas — framework-agnostic Canvas 2D renderer (ChartController)
├── chart-native/         @stacklatte/chart-native — React Native / Skia renderer
├── chart-web/            @stacklatte/chart-web    — React renderer (Canvas 2D)
├── chart-angular/        @stacklatte/chart-angular — Angular <sl-chart> component
├── chart-core/           @stacklatte/chart-core   — legacy name, re-exports native + engine
├── e2e/                  Playwright tests against the React + Angular demos (npm run test:e2e)
├── e2e-native/           Maestro tests driving the Expo demo on an iOS simulator (npm run test:native)
└── examples/
    ├── demo/             Expo demo app (chart-native)
    ├── web-demo/         Vite + React demo app (chart-web)
    └── angular-demo/     Vite + Angular demo app (chart-angular)
```

---

## Running locally

```sh
git clone https://github.com/asterix19/charts.git
cd charts
npm install

# Build the package
npm run build

# Run unit tests
npm run test

# Browser end-to-end tests (builds, then drives the React and Angular demos in Chromium)
npm run test:e2e

# Native end-to-end tests (needs a booted iOS simulator + Maestro, see e2e-native/README.md)
npm run test:native

# Pack every package and smoke-test the tarballs in a clean project
npm run test:pack

# Start the Expo demo app (React Native)
npm run demo:native

# Start the web demo app
npm run demo:web
```

---

## License

MIT — see [LICENSE](./LICENSE).
