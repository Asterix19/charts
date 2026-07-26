# `@stacklatte/chart-web`

High-performance web trading charts — rendered with plain HTML5 Canvas 2D. No WebAssembly, no `react-native-web` shim: just React + a `<canvas>`.

[![npm](https://img.shields.io/npm/v/@stacklatte/chart-web)](https://www.npmjs.com/package/@stacklatte/chart-web)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE.md)

This package renders the exact same chart engine as [`@stacklatte/chart-core`](../chart-core) (the React Native / Skia version) — same props, same indicators, same themes, same config pipeline. Every piece of pixel-geometry and indicator math is imported directly from `@stacklatte/chart-core`'s platform-agnostic core (`@stacklatte/chart-core/core`); only the rendering layer (Canvas 2D draw calls instead of Skia JSX) and the gesture layer (Pointer Events + wheel instead of `react-native-gesture-handler`) are reimplemented for the browser.

---

## Why chart-web

- **One component, not a kit.** Candlesticks, line series, SMA/EMA/Bollinger Bands overlays, RSI + MACD + volume sub-panels, trade markers, wheel/touch pan-zoom, crosshair inspection, and live-streaming updates all ship built in.
- **Real indicator math.** RSI uses Wilder smoothing, MACD is seeded and aligned correctly (12/26/9), Bollinger Bands use an O(n) sliding window — the same tested implementation `chart-core` uses, not a reimplementation that can drift.
- **No WASM, no shim.** Plain `<canvas>` + `ctx.fillText` — no CanvasKit download, no `react-native-web` dependency graph. Only peers are `react` and `react-dom`.
- **LLM-safe declarative config.** `buildChartPipeline()` takes a versioned `ChartConfig` document — every color and interval is a closed enum, never a raw string an LLM can typo — and returns validated, ready-to-render props, or throws a precise, itemized error. A generated JSON Schema ships alongside it for structured output / tool-calling. See [`llms.txt`](./llms.txt) for the quick path.
- **Also available for React Native.** [`@stacklatte/chart-core`](../chart-core) is the same engine, same props, GPU-rendered via Skia on iOS/Android.

| | chart-web / chart-core | General-purpose chart libs (Recharts, Victory) | Web-only trading chart libs |
|---|---|---|---|
| Candlesticks + OHLC | ✅ built in | 🛠 build it yourself | ✅ |
| RSI / MACD / Bollinger / Volume | ✅ built in | ❌ | varies by plugin |
| Trade markers (entry/exit/SL/TP) | ✅ built in, pan/zoom-synced | 🛠 build it yourself | varies |
| Pan, wheel-zoom, touch-pinch, crosshair | ✅ built in | 🛠 manual | ✅ |
| Native (iOS/Android) *and* web | ✅ two packages, one shared core | web only | web only |
| Declarative config + JSON Schema | ✅ | ❌ | ❌ |
| TypeScript, strict | ✅ | varies | varies |

---

## Install

```sh
npm install @stacklatte/chart-web
```

That's it — `react` and `react-dom` are the only peer dependencies.

---

## Peer dependencies

| Package | Version |
|---|---|
| `react` | `>=19.0.0` |
| `react-dom` | `>=19.0.0` |

---

## Candlestick chart

```tsx
import { SLChart } from '@stacklatte/chart-web';
import type { Candle } from '@stacklatte/chart-web';

const candles: Candle[] = [
  { timestamp: 1700000000000, open: 42000, high: 43500, low: 41800, close: 43100 },
  { timestamp: 1700003600000, open: 43100, high: 44200, low: 42900, close: 44000 },
  // ...
];

export default function TradingScreen() {
  return <SLChart data={candles} width={800} height={400} theme="dark" />;
}
```

---

## Line chart

```tsx
<SLChart data={candles} width={800} height={400} chartType="line" theme="dark" />
```

---

## Moving average overlays

```tsx
import { SLChart, calcSMA, calcEMA } from '@stacklatte/chart-web';

const sma20 = calcSMA(candles, 20, 'sma-20', '#F5A623');
const ema9  = calcEMA(candles,  9, 'ema-9',  '#4a90e2');
const ema21 = calcEMA(candles, 21, 'ema-21', '#50E3C2');

<SLChart
  data={candles}
  indicators={[sma20, ema9, ema21].filter(Boolean)}
  width={800}
  height={400}
/>
```

---

## Bollinger Bands

```tsx
import { SLChart, calcBollingerBands } from '@stacklatte/chart-web';

const bb = calcBollingerBands(candles, 20, 2, {
  upper: '#9B59B6', basis: '#7F8C8D', lower: '#9B59B6',
});

<SLChart
  data={candles}
  indicators={bb ? [bb.upper, bb.basis, bb.lower] : []}
  shadedAreas={bb ? [{ fromId: 'bb-upper', toId: 'bb-lower', color: '#9B59B6', opacity: 0.1 }] : []}
  width={800}
  height={400}
/>
```

---

## RSI / MACD / volume sub-panels

```tsx
<SLChart data={candles} showRsiPanel showMacdPanel showVolumePanel width={800} height={720} />
```

`showVolumePanel` reads `candle.volume` — add a `volume` field to your `Candle` data to enable it (see [Data format](#data-format)).

---

## Trade markers

Annotate entries, exits, stop-losses, and take-profits directly on the price panel. Markers are positioned with the exact same pixel math as the candles, so they stay perfectly in sync through pan, zoom, and live updates — no external state to keep in sync yourself.

```tsx
import type { ChartMarker } from '@stacklatte/chart-web';

const markers: ChartMarker[] = [
  { timestamp: 1700003600000, price: 43100, kind: 'entry-long', label: 'Entry' },
  { timestamp: 1700010800000, price: 44500, kind: 'take-profit', label: 'TP hit', changePct: 3.2 },
  { timestamp: 1700014400000, price: 42800, kind: 'stop-loss', label: 'Stopped out', changePct: -1.8 },
];

<SLChart data={candles} markers={markers} width={800} height={400} />
```

| `kind` | Shape | Default color |
|---|---|---|
| `entry-long` | ▲ | `candleUp` |
| `exit-long` | ▼ | neutral (`markerNeutral`) |
| `entry-short` | ▼ | `candleDown` |
| `exit-short` | ▲ | neutral (`markerNeutral`) |
| `stop-loss` | ✕ | `candleDown` |
| `take-profit` | ● | `candleUp` |

Markers render at a fixed pixel size regardless of zoom level, and are clipped to the visible time window automatically.

### Hover tooltip

Hovering a marker (mouse; no extra prop needed — this works independently of `showOhlcHud`) shows a small tooltip with its price, timestamp, and:

- `label`, if set — otherwise a heading derived from `kind` (e.g. `"Stop-loss"`, `"Exit (long)"`).
- `changePct`, if set — a signed, colored `+`/`-X.XX%` row, handy for a closed trade's P&L.

No wiring required beyond passing `markers` — the tooltip is built into `<SLChart>`.

---

## OHLC HUD

```tsx
<SLChart data={candles} showOhlcHud indicators={[ema9, ema21]} width={800} height={400} />
```

The HUD is a plain draggable `<div>` overlay (drag its grip strip). When no pointer is active it shows the latest candle; hovering or dragging the chart locks it to the pointed candle.

---

## Zoom and pan

Pan, wheel-zoom, and touch-pinch-zoom are built in — no setup required.

```tsx
<SLChart
  data={candles}
  visibleDataPoints={60}
  maxZoom={400}
  width={800}
  height={400}
/>
```

| Input | Action |
|---|---|
| Mouse drag / 1-finger touch drag | Pan the time axis |
| Mouse wheel | Zoom in/out around the cursor |
| 2-finger touch pinch | Zoom in/out around the pinch focal point |
| Hover or drag (with `showOhlcHud`) | Lock the crosshair to a candle |
| Hover a marker | Show its tooltip (price, time, label/changePct) — works regardless of `showOhlcHud` |
| Pan to the right edge | Re-engage live-follow mode |

---

## Live / streaming data

```tsx
const [candles, setCandles] = useState<Candle[]>(initialCandles);
const [trigger, setTrigger] = useState(0);

function onNewCandle(updatedCandles: Candle[]) {
  setCandles(updatedCandles);
  setTrigger(t => t + 1); // snaps back to latest
}

<SLChart data={candles} scrollToLatestTrigger={trigger} width={800} height={400} />
```

---

## Themes

```tsx
<SLChart data={candles} theme="dark"  width={800} height={400} />
<SLChart data={candles} theme="light" width={800} height={400} />
```

Custom theme — pass any `ChartThemeColors` object:

```tsx
import type { ChartThemeColors } from '@stacklatte/chart-web';

const myTheme: ChartThemeColors = {
  background:    '#0d0d0d',
  gridH:         '#1a1a1a',
  gridV:         '#141414',
  priceLabel:    '#999999',
  timeLabel:     '#555555',
  crosshair:     '#777777',
  candleUp:      '#26a69a',
  candleDown:    '#ef5350',
  lineChart:     '#00e5ff',
  rsiLine:       '#f1c40f',
  rsiThreshold:  '#2a2a2a',
  hudBackground: 'rgba(0,0,0,0.85)',
  hudText:       '#ffffff',
  markerNeutral: '#64b5f6',
};

<SLChart data={candles} theme={myTheme} width={800} height={400} />
```

---

## ChartConfig pipeline (LLM-safe declarative config)

`@stacklatte/chart-web` re-exports the same `ChartConfig` → `ChartProps` compiler as chart-core, so a config document produced for one renders identically on the other — describe the chart as data, not JSX:

```ts
import { buildChartPipeline, SLChart } from '@stacklatte/chart-web';
import type { ChartConfig } from '@stacklatte/chart-web';

const config: ChartConfig = {
  version: '1',
  theme: 'dark',
  priceDisplay: 'candle',
  interval: '1h',
  overlays: [{ type: 'ema', id: 'ema-9', params: { period: 9 }, color: 'cyan' }],
  shadedAreas: [],
  subPanels: [{ type: 'rsi', params: { period: 14 } }, { type: 'volume' }],
  markers: [{ timestamp: 1700003600000, price: 43100, kind: 'entry-long' }],
  viewport: { visibleCandles: 100, followLive: true },
  hud: { showOhlcHud: true },
};

const compiled = buildChartPipeline(config, candles);
<SLChart {...compiled} width={800} height={480} />
```

This exists specifically so an LLM (or any code-generation step) can produce chart setup safely:

- **Every string is a closed enum** — `theme`, `interval`, overlay `type`, and every `color` come from a fixed, named union. There's no raw hex, no arbitrary millisecond literal, nothing an LLM can plausibly hallucinate a wrong-but-valid-looking value for.
- **It fails loudly, not silently.** `buildChartPipeline` validates first and throws one error listing every problem (`[code] path: message`) if the document doesn't match the schema, instead of rendering something subtly wrong.
- **A matching JSON Schema ships with `@stacklatte/chart-core`** (a dependency of this package) at `node_modules/@stacklatte/chart-core/dist/ChartConfig.schema.json` — drop it straight into an LLM's structured-output or tool-call schema.

See [`llms.txt`](./llms.txt) for a condensed reference aimed at coding agents.

---

## Props

Same prop contract as `@stacklatte/chart-core`'s `SLChart` — see [chart-core's README](../chart-core/README.md#props) for the full table. `width`/`height` are plain numbers (CSS pixels); there's no `useWindowDimensions` — measure your container however you like (e.g. `ResizeObserver`).

---

## Data format

```ts
interface Candle {
  timestamp: number; // Unix milliseconds, sorted ascending
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume?:   number; // optional — enables showVolumePanel and the HUD's V row
}
```

---

## Architecture

| Module | Renders |
|---|---|
| `draw/axis.ts` | Time/price grid lines and labels (native `ctx.fillText` — no DOM overlay needed) |
| `draw/mainPanel.ts` | Candles, line series, indicator overlays, shaded areas, crosshair dot |
| `draw/markers.ts` | Trade markers (entry/exit/stop-loss/take-profit) on the main panel |
| `draw/rsiPanel.ts` | RSI sub-panel with 30/70 threshold lines |
| `draw/macdPanel.ts` | MACD sub-panel (line, signal, histogram) |
| `draw/volumePanel.ts` | Volume sub-panel (bars colored by candle direction) |
| `draw/crosshair.ts` | Dashed crosshair lines |
| `draw/path.ts` | Catmull-Rom smooth-path stroking/filling (the Canvas 2D equivalent of chart-core's Skia `pathUtils`) |
| `components/OhlcHud.tsx` | Draggable OHLC info overlay |

All chart math — layout, viewport clamping, indicator calculation, axis ticks, the `ChartConfig` compiler — comes from `@stacklatte/chart-core/core` and is re-exported from this package, so the two renderers never drift apart on behavior.

---

## Contributing

Issues and PRs welcome. See the [monorepo README](../README.md) for setup instructions.

---

## License

MIT — see [LICENSE.md](./LICENSE.md).
