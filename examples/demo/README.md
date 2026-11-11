# Stacklatte Charts — Expo demo (React Native)

Renders `@stacklatte/chart-native` (Skia) on iOS and Android. Two tabs:

- **Chart** — an interactive playground: candle/line, dark/light, SMA / EMA / Bollinger, RSI / MACD panels, OHLC HUD, live ticks (down to 100 ms) and a **+5K** button that appends 5,000 candles.
- **Scenarios** — the shared 35-scenario catalogue (feature, edge, stress, live; up to **50,000 candles**) that every other demo and test uses. Deep link: `demo://scenarios?id=stress-extreme`.

```sh
npx expo run:ios --no-bundler  # (once) build the development client for a simulator
npm run demo:native            # from the repo root: starts Metro in dev-client mode
```

This demo is **iOS / Android only** — it needs a development build, not Expo Go and not a browser (Skia's web build would throw `Can't find variable: CanvasKit`). For the browser use the React demo: `npm run demo:web`.

The Scenarios tab is driven end-to-end by Maestro — see [`e2e-native/README.md`](../../e2e-native/README.md) and [docs/testing.md](../../docs/testing.md).
