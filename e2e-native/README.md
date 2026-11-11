# Native end-to-end tests (Maestro)

Drives the real `examples/demo` Expo app (which renders `@stacklatte/chart-native` with Skia) on an iOS simulator.

```sh
# one-time: build and install the dev client on a booted simulator
cd examples/demo && npx expo run:ios --no-bundler

# in one terminal: serve the JS bundle
cd examples/demo && npx expo start --dev-client --port 8081

# in another: run the flows (from the repo root)
npm run test:native
```

## Comparing against the published `chart-core`

```sh
npm run test:native:compat   # ~20 min: chart-native vs the new chart-core shim vs the published chart-core 2.3.3
```

It drives the same demo three ways (a Metro switch, `CHART_IMPL`, swaps what `@stacklatte/chart-native` resolves to) and pixel-compares the chart area of every static scenario.

Requires [Maestro](https://maestro.mobile.dev) (`brew install maestro`). Screenshots land in `e2e-native/screenshots/`.
