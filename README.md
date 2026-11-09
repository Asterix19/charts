# Stacklatte Charts

![Demo](./assets/gifs/demo.gif)

High-performance trading charts for React Native and the web. Open-source, MIT licensed.

- **[`@stacklatte/chart-native`](./chart-native)** — React Native, GPU-accelerated rendering at 60 fps on iOS and Android via [React Native Skia](https://shopify.github.io/react-native-skia/).
- **[`@stacklatte/chart-web`](./chart-web)** — plain web, rendered with HTML5 Canvas 2D. No React Native, no WASM.
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
├── chart-native/         @stacklatte/chart-native — React Native / Skia renderer
├── chart-web/            @stacklatte/chart-web    — Canvas 2D renderer
├── chart-core/           @stacklatte/chart-core   — legacy name, re-exports native + engine
├── e2e/                  Playwright tests against the web demo (npm run test:e2e)
└── examples/
    ├── demo/             Expo demo app (chart-native)
    └── web-demo/         Vite + React demo app (chart-web)
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

# Run end-to-end tests (builds, then drives the web demo in Chromium)
npm run test:e2e

# Start the Expo demo app (React Native)
npm run demo:native

# Start the web demo app
npm run demo:web
```

---

## License

MIT — see [LICENSE](./LICENSE).
