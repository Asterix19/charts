# chart-react demo

A small Vite + React app exercising [`@stacklatte/chart-react`](../../chart-react): live-streaming candles, chart type / theme switching, SMA/EMA/Bollinger overlays, RSI/MACD/volume sub-panels, zoom presets, and crosshair inspection via `onCrosshairChange`.

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

Then open the printed local URL (usually `http://localhost:5173`).
