# Stacklatte Charts

![Demo](./assets/gifs/demo.gif)

High-performance trading charts for React Native and the web. Open-source, MIT licensed.

- **[`@stacklatte/chart-core`](./chart-core)** — React Native, GPU-accelerated rendering at 60 fps on iOS and Android via [React Native Skia](https://shopify.github.io/react-native-skia/).
- **[`@stacklatte/chart-web`](./chart-web)** — plain web, rendered with HTML5 Canvas 2D. No React Native, no WASM.

Both packages share the same platform-agnostic chart engine (layout, viewport, indicators, the `ChartConfig` compiler) via `@stacklatte/chart-core/core` — same props, same indicators, same themes on both platforms.

**Building this with an LLM or coding agent?** Read [`llms.txt`](./llms.txt) first — it points at the declarative `ChartConfig` pipeline (validated, closed-enum config + a generated JSON Schema you can hand directly to structured output / tool-calling) instead of hand-written props, so generated setup can't reference a color or prop that doesn't exist.

[![npm](https://img.shields.io/npm/v/@stacklatte/chart-core)](https://www.npmjs.com/package/@stacklatte/chart-core)
[![npm](https://img.shields.io/npm/v/@stacklatte/chart-web)](https://www.npmjs.com/package/@stacklatte/chart-web)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

---

## Install

```sh
npm install @stacklatte/chart-core @shopify/react-native-skia react-native-gesture-handler
```

```tsx
import { SLChart } from '@stacklatte/chart-core';
import type { Candle } from '@stacklatte/chart-core';

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

See the [full README](./chart-core/README.md) for all examples.

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
├── chart-core/           @stacklatte/chart-core — React Native / Skia renderer + shared core logic
├── chart-web/            @stacklatte/chart-web  — Canvas 2D renderer, reuses chart-core's core logic
└── examples/
    ├── demo/             Expo demo app (chart-core)
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

# Run tests
npm run test

# Start the Expo demo app (React Native)
npm run demo:native

# Start the web demo app
npm run demo:web
```

---

## License

MIT — see [LICENSE](./LICENSE).
