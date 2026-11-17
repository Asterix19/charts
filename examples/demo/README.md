# Stacklatte Charts — Expo demo (React Native)

Renders `@stacklatte/chart-native` (Skia) on iOS and Android. A green banner on every screen names the package, its version and the renderer. Three tabs:

- **Chart** — the original quick playground: candle/line, dark/light, SMA / EMA / Bollinger, RSI / MACD panels, OHLC HUD, live ticks (down to 100 ms) and a **+5K** button.
- **Lab** — **every capability as a visible control** (not behind a toggle): data (candle count up to 50k, live feed to 100 ms, dirty feed, no data, volume), view (type, theme, zoom, max zoom, interval, 12 h, grid, HUD/crosshair, chart size), overlays and their periods, all panels, trade markers, a custom theme with six colours, and the stress actions. The controls come from the same schema the React and Angular demos use. Test deep link: `demo://lab?reset=1&preset=rich&set=rsi=false;zoom=120&act=bulk`.
- **Scenarios** — the shared 37-scenario catalogue (feature, edge, stress, live; up to **50,000 candles**) that every other demo and test uses. Deep link: `demo://scenarios?id=stress-extreme`.

```sh
npx expo run:ios --no-bundler  # (once) build the development client for a simulator
npm run demo:native            # from the repo root: starts Metro in dev-client mode
```

This demo is **iOS / Android only** — it needs a development build, not Expo Go and not a browser (Skia's web build would throw `Can't find variable: CanvasKit`). For the browser use the React demo: `npm run demo:react`.

The Scenarios tab is driven end-to-end by Maestro — see [`e2e-native/README.md`](../../e2e-native/README.md) and [docs/testing.md](../../docs/testing.md).
