# Stacklatte Charts

High-performance React Native trading charts. Open-source, MIT licensed.

Built on [React Native Skia](https://shopify.github.io/react-native-skia/) for GPU-accelerated rendering at 60 fps on iOS, Android, and web.

[![npm](https://img.shields.io/npm/v/@stacklatte/chart-core)](https://www.npmjs.com/package/@stacklatte/chart-core)
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

---

## Monorepo structure

```
├── chart-core/    @stacklatte/chart-core — the chart package (components + core logic)
└── examples/
    ├── demo/      Expo demo app
    └── ai-chart/  LLM → ChartConfig generation example
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

# Start the Expo demo app
cd examples/demo
npx expo start
```

---

## Pro — coming soon

Advanced trading tools built on the open-source core:

- Trade replay
- Strategy visualization
- Entry / exit overlays
- P&L visualization
- Stop-loss / take-profit zones
- Synchronized multi-chart layouts
- Advanced drawing tools
- Commercial support

---

## License

MIT — see [LICENSE](./LICENSE).
