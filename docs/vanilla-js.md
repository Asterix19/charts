# Vanilla JS, Vue, Svelte (`@stacklatte/chart-canvas`)

`ChartController` is the framework-agnostic chart that powers the React and Angular components. Give it a host element and props; it creates the canvases, handles pan / pinch / wheel and the crosshair, and repaints at most once per animation frame.

```sh
npm install @stacklatte/chart-canvas
```

```ts
import { ChartController } from '@stacklatte/chart-canvas';
import type { Candle } from '@stacklatte/chart-canvas';

export function mountChart(host: HTMLElement, candles: Candle[]) {
  const chart = new ChartController(host, {
    data: candles,
    width: host.clientWidth,
    height: 480,
    theme: 'dark',
    showVolumePanel: true,
    showOhlcHud: true,
    onCrosshairChange: (candle) => console.log(candle),
  });
  return chart;
}
```

## Updating and cleaning up

Call `update()` with the full props whenever anything changes — it is cheap and coalesced to one repaint per frame, so it is safe to call on every tick of a live feed. Call `destroy()` when the host is removed.

```ts
import { ChartController } from '@stacklatte/chart-canvas';
import type { Candle, ChartProps } from '@stacklatte/chart-canvas';

export function liveChart(host: HTMLElement, initial: Candle[]) {
  let data = initial;
  const props = (): ChartProps => ({ data, width: host.clientWidth, height: 420, showOhlcHud: true });
  const chart = new ChartController(host, props());
  const resize = new ResizeObserver(() => chart.update(props()));
  resize.observe(host);

  return {
    push(candle: Candle) {
      data = [...data, candle];
      chart.update(props());
    },
    destroy() {
      resize.disconnect();
      chart.destroy();
    },
  };
}
```

## Vue / Svelte

Create the controller in the mounted hook, call `update` in a watcher / reactive statement, and `destroy` on unmount:

```ts nocheck
import { ChartController } from '@stacklatte/chart-canvas';
import type { Candle } from '@stacklatte/chart-canvas';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

export function useChart(candles: () => Candle[]) {
  const host = ref<HTMLElement | null>(null);
  let chart: ChartController | undefined;

  onMounted(() => {
    chart = new ChartController(host.value!, { data: candles(), width: host.value!.clientWidth, height: 420 });
  });
  watch(candles, (data) => chart?.update({ data, width: host.value!.clientWidth, height: 420 }));
  onBeforeUnmount(() => chart?.destroy());

  return host;
}
```

## Drawing primitives

`@stacklatte/chart-canvas` also exports the pure drawing functions (`drawCandles`, `drawAxis`, `drawRsiPanel`, `drawMacdPanel`, `drawVolumePanel`, `drawMarkers`, …) if you want to compose your own layout on a `CanvasRenderingContext2D`. See the [API reference](./api-reference.md).
