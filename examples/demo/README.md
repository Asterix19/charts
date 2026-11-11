# Stacklatte Charts — Expo demo (React Native)

Renders `@stacklatte/chart-native` (Skia) on iOS and Android. Two tabs:

- **Chart** — an interactive playground: candle/line, dark/light, SMA / EMA / Bollinger, RSI / MACD panels, OHLC HUD, live ticks (down to 100 ms) and a **+5K** button that appends 5,000 candles.
- **Scenarios** — the shared 28-scenario catalogue (feature, edge, stress, live; up to **50,000 candles**) that every other demo and test uses. Deep link: `demo://scenarios?id=stress-extreme`.

```sh
npm run demo:native            # from the repo root: starts Expo
npx expo run:ios --no-bundler  # (once) build the dev client for a simulator
```

The Scenarios tab is driven end-to-end by Maestro — see [`e2e-native/README.md`](../../e2e-native/README.md) and [docs/testing.md](../../docs/testing.md).
