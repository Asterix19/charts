# chart-web demo

A small Vite + React app exercising [`@stacklatte/chart-web`](../../chart-web): live-streaming candles, chart type / theme switching, SMA/EMA/Bollinger overlays, RSI/MACD/volume sub-panels, zoom presets, and crosshair inspection via `onCrosshairChange`.

## Run

From the repo root (this is an npm workspace, so `chart-web` resolves to the local package):

```sh
npm install
npm run demo:web
```

Or from this directory directly:

```sh
cd examples/web-demo
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`).
