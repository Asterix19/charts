# `@stacklatte/chart-canvas`

Framework-agnostic Canvas 2D renderer for Stacklatte trading charts.

- **`ChartController`** — give it a host `HTMLElement` and `ChartProps`; it creates the canvases, handles pan / pinch / wheel and crosshair, and repaints at most once per animation frame. Use it to wrap the chart in any framework (Vue, Svelte, Solid, plain JS). [`@stacklatte/chart-angular`](../chart-angular) is exactly this, in ~100 lines.
- **Drawing primitives** — `drawCandles`, `drawAxis`, `drawRsiPanel`, `drawMacdPanel`, `drawVolumePanel`, `drawMarkers`, … pure functions over a `CanvasRenderingContext2D`, shared by every DOM renderer.

```ts
import { ChartController } from '@stacklatte/chart-canvas';

const chart = new ChartController(document.getElementById('chart')!, {
  data: candles, width: 900, height: 480, theme: 'dark', showVolumePanel: true, showOhlcHud: true,
  onCrosshairChange: (candle) => console.log(candle),
});
chart.update({ ...props, data: nextCandles }); // cheap; coalesced to one repaint per frame
chart.destroy();
```

Built on [`@stacklatte/chart-engine`](../chart-engine). MIT licensed.
