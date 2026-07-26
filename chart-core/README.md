# `@stacklatte/chart-core`

High-performance React Native trading charts — GPU-accelerated via [React Native Skia](https://shopify.github.io/react-native-skia/). Works on iOS and Android.

[![npm](https://img.shields.io/npm/v/@stacklatte/chart-core)](https://www.npmjs.com/package/@stacklatte/chart-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE.md)

---

## Why chart-core

- **One component, not a kit.** Candlesticks, line series, SMA/EMA/Bollinger Bands overlays, RSI + MACD + volume sub-panels, trade markers, pinch-zoom, pan, crosshair inspection, and live-streaming updates all ship built in — you're not assembling them from a primitives library.
- **Real indicator math.** RSI uses Wilder smoothing, MACD is seeded and aligned correctly (12/26/9), Bollinger Bands use an O(n) sliding window — not approximations. 200+ unit tests cover the math directly, independent of rendering.
- **GPU-rendered, not SVG.** Built on Skia via `react-native-skia` — smooth at 60fps with hundreds of visible candles and a live feed ticking underneath.
- **LLM-safe declarative config.** `buildChartPipeline()` takes a versioned `ChartConfig` document — every color and interval is a closed enum, never a raw string an LLM can typo — and returns validated, ready-to-render props, or throws a precise, itemized error. A generated JSON Schema ships in `dist/ChartConfig.schema.json` for structured output / tool-calling. See [`llms.txt`](./llms.txt) for the quick path.
- **Also available for the web.** [`@stacklatte/chart-web`](../chart-web) is the same engine, same props, rendered with Canvas 2D — no React Native required.

| | chart-core / chart-web | General-purpose chart libs (Recharts, Victory) | Web-only trading chart libs |
|---|---|---|---|
| Candlesticks + OHLC | ✅ built in | 🛠 build it yourself | ✅ |
| RSI / MACD / Bollinger / Volume | ✅ built in | ❌ | varies by plugin |
| Trade markers (entry/exit/SL/TP) | ✅ built in, pan/zoom-synced | 🛠 build it yourself | varies |
| Pinch-zoom, pan, crosshair | ✅ built in | 🛠 manual | ✅ |
| Native (iOS/Android) *and* web | ✅ two packages, one shared core | web only | web only |
| Declarative config + JSON Schema | ✅ | ❌ | ❌ |
| TypeScript, strict | ✅ | varies | varies |

---

## Install

```sh
npm install @stacklatte/chart-core @shopify/react-native-skia react-native-gesture-handler
```

Follow the setup guides for [react-native-skia](https://shopify.github.io/react-native-skia/docs/getting-started/installation) and [react-native-gesture-handler](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/installation).

---

## Peer dependencies

| Package | Version |
|---|---|
| `react` | `>=19.0.0` |
| `react-native` | `>=0.79.0` |
| `@shopify/react-native-skia` | `>=2.0.0` |
| `react-native-gesture-handler` | `>=2.0.0` |

---

## Candlestick chart

Drop in OHLC candle data and get a GPU-rendered, pannable, zoomable chart in one component.

```tsx
import { SLChart } from '@stacklatte/chart-core';
import type { Candle } from '@stacklatte/chart-core';
import { useWindowDimensions } from 'react-native';

const candles: Candle[] = [
  { timestamp: 1700000000000, open: 42000, high: 43500, low: 41800, close: 43100 },
  { timestamp: 1700003600000, open: 43100, high: 44200, low: 42900, close: 44000 },
  // ...
];

export default function TradingScreen() {
  const { width } = useWindowDimensions();
  return (
    <SLChart
      data={candles}
      width={width}
      height={400}
      theme="dark"
    />
  );
}
```

---

## Line chart

```tsx
<SLChart data={candles} width={width} height={400} chartType="line" theme="dark" />
```

---

## Moving average overlays

Calculate SMA and EMA outside the component and pass them in as `IndicatorLine` objects.

```tsx
import { SLChart, calcSMA, calcEMA } from '@stacklatte/chart-core';

const sma20 = calcSMA(candles, 20, 'sma-20', '#F5A623');
const ema9  = calcEMA(candles,  9, 'ema-9',  '#4a90e2');
const ema21 = calcEMA(candles, 21, 'ema-21', '#50E3C2');

<SLChart
  data={candles}
  indicators={[sma20, ema9, ema21].filter(Boolean)}
  width={width}
  height={400}
/>
```

---

## Bollinger Bands

Bollinger Bands return three indicator lines (`upper`, `basis`, `lower`). Pass a `ShadedArea` to fill the region between the bands.

```tsx
import { SLChart, calcBollingerBands } from '@stacklatte/chart-core';

const bb = calcBollingerBands(candles, 20, 2, {
  upper: '#9B59B6',
  basis: '#7F8C8D',
  lower: '#9B59B6',
});

<SLChart
  data={candles}
  indicators={bb ? [bb.upper, bb.basis, bb.lower] : []}
  shadedAreas={bb ? [{ fromId: 'bb-upper', toId: 'bb-lower', color: '#9B59B6', opacity: 0.1 }] : []}
  width={width}
  height={400}
/>
```

---

## RSI sub-panel

Displays a Relative Strength Index panel below the main chart. RSI is computed internally using Wilder smoothing (period 14) on the visible candles.

```tsx
<SLChart
  data={candles}
  showRsiPanel
  width={width}
  height={480}   // extra height for the sub-panel
/>
```

The panel includes 30/70 overbought/oversold threshold lines and a synchronized crosshair.

---

## MACD sub-panel

MACD (12, 26, 9) — line, signal, and histogram bars — in a panel synchronized with the main chart.

```tsx
<SLChart
  data={candles}
  showMacdPanel
  width={width}
  height={480}
/>
```

Run both panels at once:

```tsx
<SLChart
  data={candles}
  showRsiPanel
  showMacdPanel
  width={width}
  height={560}
/>
```

---

## Volume sub-panel

Bars colored by candle direction (bullish/bearish), synchronized with the main chart. Requires a `volume` field on your candle data.

```tsx
<SLChart
  data={candles} // Candle[] with volume: number
  showVolumePanel
  width={width}
  height={480}
/>
```

---

## Trade markers

Annotate entries, exits, stop-losses, and take-profits on the price panel. Markers use the exact same pixel math as the candle layer (`getCandleX`/`getY`), so they stay perfectly in sync through pinch-zoom, pan, and live updates — no external state to reconcile.

```tsx
import type { ChartMarker } from '@stacklatte/chart-core';

const markers: ChartMarker[] = [
  { timestamp: 1700003600000, price: 43100, kind: 'entry-long', label: 'Entry' },
  { timestamp: 1700010800000, price: 44500, kind: 'take-profit', label: 'TP hit', changePct: 3.2 },
  { timestamp: 1700014400000, price: 42800, kind: 'stop-loss', label: 'Stopped out', changePct: -1.8 },
];

<SLChart data={candles} markers={markers} width={width} height={400} />
```

| `kind` | Shape | Default color |
|---|---|---|
| `entry-long` | ▲ | `candleUp` |
| `exit-long` | ▼ | neutral (`markerNeutral`) |
| `entry-short` | ▼ | `candleDown` |
| `exit-short` | ▲ | neutral (`markerNeutral`) |
| `stop-loss` | ✕ | `candleDown` |
| `take-profit` | ● | `candleUp` |

Markers render at a fixed pixel size regardless of zoom level, and are clipped to the visible time window automatically. Display only — no click-to-edit or drag-to-reposition.

### Tap tooltip

Tapping a marker (no extra prop needed — this works independently of `showOhlcHud`) shows a small tooltip with its price, timestamp, and:

- `label`, if set — otherwise a heading derived from `kind` (e.g. `"Stop-loss"`, `"Exit (long)"`).
- `changePct`, if set — a signed, colored `+`/`-X.XX%` row, handy for a closed trade's P&L.

The tooltip stays visible while the finger is held down and clears on release, same lifecycle as the crosshair.

---

## OHLC HUD

An overlay that shows Open, High, Low, Close values for the currently inspected candle — and any indicator values at that timestamp.

```tsx
<SLChart
  data={candles}
  showOhlcHud
  indicators={[ema9, ema21]}
  width={width}
  height={400}
/>
```

When no touch is active, the HUD shows the latest candle. On tap or drag it locks to the touched candle.

---

## Crosshair callback

```tsx
<SLChart
  data={candles}
  showOhlcHud
  onCrosshairChange={(candle) => {
    if (candle) {
      console.log(`Price: ${candle.close} at ${new Date(candle.timestamp).toISOString()}`);
    }
  }}
  width={width}
  height={400}
/>
```

---

## Zoom and pan

Pinch to zoom and pan are built-in — no setup required.

```tsx
<SLChart
  data={candles}
  visibleDataPoints={60}   // candles visible at initial load
  maxZoom={400}            // maximum candles visible (widest zoom out)
  width={width}
  height={400}
/>
```

| Gesture | Action |
|---|---|
| 1-finger pan | Scroll the time axis |
| 2-finger pinch | Zoom in/out around the focal point |
| Tap or pan (with `showOhlcHud`) | Lock the crosshair to a candle |
| Tap a marker | Show its tooltip (price, time, label/changePct) — works regardless of `showOhlcHud` |
| Pan to the right edge | Re-engage live-follow mode |

---

## Live / streaming data

The chart auto-follows new candles when the viewport is at the latest data. After the user scrolls away, increment `scrollToLatestTrigger` to snap back.

```tsx
const [candles, setCandles] = useState<Candle[]>(initialCandles);
const [trigger, setTrigger] = useState(0);

function onNewCandle(updatedCandles: Candle[]) {
  setCandles(updatedCandles);
  setTrigger(t => t + 1);   // snaps back to latest
}

<SLChart
  data={candles}
  scrollToLatestTrigger={trigger}
  width={width}
  height={400}
/>
```

---

## Themes

### Built-in presets

```tsx
<SLChart data={candles} theme="dark"  width={width} height={400} />
<SLChart data={candles} theme="light" width={width} height={400} />
```

### Custom theme

Pass any `ChartThemeColors` object to override every color token.

```tsx
import type { ChartThemeColors } from '@stacklatte/chart-core';

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

<SLChart data={candles} theme={myTheme} width={width} height={400} />
```

---

## All together

```tsx
import { SLChart, calcEMA, calcBollingerBands } from '@stacklatte/chart-core';
import type { Candle, IndicatorLine, ShadedArea } from '@stacklatte/chart-core';
import { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

export default function TradingScreen({ candles }: { candles: Candle[] }) {
  const { width } = useWindowDimensions();
  const [trigger, setTrigger] = useState(0);

  const { indicators, shadedAreas } = useMemo(() => {
    const lines: IndicatorLine[]  = [];
    const areas: ShadedArea[]     = [];

    const ema9  = calcEMA(candles, 9,  'ema-9',  '#4a90e2');
    const ema21 = calcEMA(candles, 21, 'ema-21', '#50E3C2');
    if (ema9)  lines.push(ema9);
    if (ema21) lines.push(ema21);

    const bb = calcBollingerBands(candles, 20, 2, {
      upper: '#9B59B6', basis: '#7F8C8D', lower: '#9B59B6',
    });
    if (bb) {
      lines.push(bb.upper, bb.basis, bb.lower);
      areas.push({ fromId: 'bb-upper', toId: 'bb-lower', color: '#9B59B6', opacity: 0.1 });
    }

    return { indicators: lines, shadedAreas: areas };
  }, [candles]);

  return (
    <SLChart
      data={candles}
      indicators={indicators}
      shadedAreas={shadedAreas}
      width={width}
      height={560}
      theme="dark"
      chartType="candle"
      showOhlcHud
      showRsiPanel
      showMacdPanel
      visibleDataPoints={60}
      scrollToLatestTrigger={trigger}
      onCrosshairChange={(c) => c && console.log('candle', c.close)}
    />
  );
}
```

---

## Declarative config (`ChartConfig`) — and generating it with an LLM

Every example above sets `SLChart` props directly. There's a second, declarative path: describe the chart as a versioned `ChartConfig` document and let `buildChartPipeline()` validate, normalize, and compile it into props for you.

```ts
import { buildChartPipeline, SLChart } from '@stacklatte/chart-core';
import type { ChartConfig } from '@stacklatte/chart-core';

const config: ChartConfig = {
  version: '1',
  theme: 'dark',
  priceDisplay: 'candle',
  interval: '1h',
  overlays: [
    { type: 'ema', id: 'ema-9', params: { period: 9 }, color: 'cyan' },
    {
      type: 'bollinger_bands',
      params: { period: 20, stdDev: 2 },
      bands: {
        upper: { id: 'bb-upper', color: 'purple' },
        lower: { id: 'bb-lower', color: 'purple' },
        basis: { id: 'bb-basis', color: 'gray' },
      },
    },
  ],
  shadedAreas: [{ fromOverlayId: 'bb-upper', toOverlayId: 'bb-lower', color: 'purple', opacity: 0.15 }],
  subPanels: [{ type: 'rsi', params: { period: 14 } }, { type: 'macd' }, { type: 'volume' }],
  markers: [{ timestamp: 1700003600000, price: 43100, kind: 'entry-long' }],
  viewport: { visibleCandles: 100, followLive: true },
  hud: { showOhlcHud: true },
};

const compiled = buildChartPipeline(config, candles);
<SLChart {...compiled} width={width} height={560} />
```

This exists specifically so an LLM (or any code-generation step) can produce chart setup safely:

- **Every string is a closed enum** — `theme`, `interval`, overlay `type`, and every `color` come from a fixed, named union (`PaletteColor`, `ChartInterval`, …). There's no raw hex, no arbitrary millisecond literal, no field an LLM can plausibly hallucinate a wrong-but-valid-looking value for.
- **It fails loudly, not silently.** `buildChartPipeline` runs `validateChartConfig` first and throws one error listing every problem (`[code] path: message`) if the document doesn't match the schema — an agent gets something it can parse and self-correct from, instead of a chart that renders with subtly wrong data.
- **A matching JSON Schema ships in the package** at `dist/ChartConfig.schema.json` (draft-07, `additionalProperties: false` throughout) — drop it straight into an LLM's structured-output or tool-call schema so the model *can only* produce a valid `ChartConfig` in the first place.

See [`llms.txt`](./llms.txt) for a condensed reference aimed at coding agents.

---

## Standalone indicator calculators

All calculators are exported for use outside the chart component — useful for displaying values in a separate UI element.

```ts
import { calcSMA, calcEMA, calcBollingerBands, calcRSI, calcMACD } from '@stacklatte/chart-core';
import type { RsiPoint, MacdResult } from '@stacklatte/chart-core';

const sma   = calcSMA(candles, 20, 'sma-20', '#F5A623');   // IndicatorLine | null
const ema   = calcEMA(candles, 20, 'ema-20', '#4a90e2');   // IndicatorLine | null
const bb    = calcBollingerBands(candles, 20, 2, colors);  // { upper, basis, lower } | null
const rsi   = calcRSI(candles, 14);                        // RsiPoint[]
const macd  = calcMACD(candles, 12, 26, 9);                // MacdResult | null
```

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `Candle[]` | required | OHLC candles sorted ascending by `timestamp` (ms) |
| `width` | `number` | required | Canvas width in logical pixels |
| `height` | `number` | required | Canvas height in logical pixels |
| `theme` | `"dark" \| "light" \| ChartThemeColors` | `"dark"` | Color preset or full custom theme |
| `chartType` | `"candle" \| "line"` | `"candle"` | Main series rendering style |
| `indicators` | `IndicatorLine[]` | `[]` | Overlay lines (SMA, EMA, Bollinger Bands) |
| `shadedAreas` | `ShadedArea[]` | `[]` | Filled band between two indicator lines |
| `markers` | `ChartMarker[]` | `[]` | Trade/event markers (entry, exit, stop-loss, take-profit) |
| `visibleDataPoints` | `number` | `60` | Number of candles visible at initial load |
| `intervalMs` | `number` | auto | Milliseconds per candle — inferred from data if omitted |
| `showGrid` | `boolean` | `true` | Horizontal and vertical grid lines |
| `showOhlcHud` | `boolean` | `false` | OHLC info overlay |
| `showRsiPanel` | `boolean` | `false` | RSI sub-panel |
| `showMacdPanel` | `boolean` | `false` | MACD sub-panel |
| `showVolumePanel` | `boolean` | `false` | Volume sub-panel — requires `data[].volume` |
| `maxZoom` | `number` | data length | Maximum candles visible at once |
| `hour12` | `boolean` | `false` | 12-hour (AM/PM) time axis |
| `scrollToLatestTrigger` | `number` | — | Increment to snap to latest candle |
| `onCrosshairChange` | `(candle: Candle \| null) => void` | — | Fires on crosshair lock/release |

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

Each drawing concern is a separate Skia component. Swap or extend individual layers without touching the rest.

| Layer | Renders |
|---|---|
| `AxisLayer` | Time/price grid lines and labels |
| `CandlestickLayer` | OHLC wicks and bodies |
| `LineLayer` | Close-price line |
| `IndicatorLayer` | Single indicator polyline |
| `ShadedAreaLayer` | Filled region between two series |
| `MarkerLayer` | Trade markers (entry/exit/stop-loss/take-profit) |
| `RsiLayer` | RSI sub-panel with 30/70 threshold lines |
| `MacdLayer` | MACD sub-panel (line, signal, histogram) |
| `VolumeLayer` | Volume sub-panel (bars colored by candle direction) |
| `CrosshairLayer` | Dashed vertical + horizontal crosshair |
| `OhlcHud` | OHLC info overlay |

All layers are exported for custom compositions:

```ts
import { SLChart, AxisLayer, CandlestickLayer, IndicatorLayer } from '@stacklatte/chart-core';
```

---

## Contributing

Issues and PRs welcome. See the [monorepo README](../README.md) for setup instructions.

---

## License

MIT — see [LICENSE.md](./LICENSE.md).
