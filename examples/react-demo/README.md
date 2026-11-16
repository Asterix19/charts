# chart-react demo

A Vite + React app exercising [`@stacklatte/chart-react`](../../chart-react).

The home page is **the Lab**: a coloured banner names the package and version under test, and **every capability is a visible control**, grouped (Data, View, Overlays, Panels, Markers, Custom theme colours, Actions): candle count up to 50k, live feed down to 100 ms, dirty feed, no data, chart type, theme + six custom colours, zoom, max zoom, interval, 12 h clock, grid, OHLC HUD / crosshair, chart size, SMA / EMA / Bollinger / VWAP with periods, RSI / MACD / volume / custom panels, trade markers, the +5K stress button. The controls are drawn from one schema shared with the Angular and React Native demos (`examples/shared/src/lab.ts`), and a test fails if a `ChartProps` field has no control. The second page, **35 scenarios**, is the shared catalogue (`/#/scenarios/<id>`).

## Run

From the repo root (this is an npm workspace, so `chart-react` resolves to the local package):

```sh
npm install
npm run demo:react
```

Or from this directory directly:

```sh
cd examples/react-demo
npm run dev
```

Then open the printed local URL. To run every demo at once (React, Angular and the native Metro server) use `npm run demo:all` from the repo root.
