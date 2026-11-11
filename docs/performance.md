# Performance

Numbers below are **measured by the repository's own e2e suite** (`npm run test:e2e`, written to `e2e/perf-results/`), not estimated. They come from headless Chromium on an Apple-silicon laptop; phones and CI machines differ, which is why the enforced budgets have headroom.

## Frame time under real input

Each scenario is loaded in a real browser, then driven with three drag sweeps (±220 px) and 36 wheel-zoom steps while a probe records wall-clock time between animation frames (`window.__SL__.probe`).

| Scenario | Candles | Panels / overlays | React | Angular |
|---|---|---|---|---|
| Stress 2k | 2,000 | EMA ×2, Bollinger, RSI, HUD | 59 fps, p95 18 ms | 59 fps, p95 18 ms |
| Stress 50k | 50,000 | EMA, Bollinger, volume, RSI, MACD, HUD | 60 fps, p95 17 ms | 59 fps, p95 18 ms |
| Live Burst | 300 → 10,000 | RSI, HUD, tick every 100 ms | 59 fps, p95 17 ms | 60 fps, p95 18 ms |

First paint after navigation (mount) was 20–45 ms for every scenario above.

**Enforced budgets:** stress and live scenarios must mount in under 500 ms (1 s for 50k candles) with a p95 frame time under 34 ms (≥ 30 fps). A test injects a 40 ms stall into the renderer and confirms the budget fails, so the gate is known to work.

## Why it stays fast with 50,000 candles

- Only the **visible window** is drawn (and only the visible slice is run through RSI/MACD), so cost scales with what is on screen, not with the dataset.
- `normalizeCandles` takes a linear fast path for clean, ascending data.
- Repaints are **coalesced to one per animation frame**, however many pointer events or data ticks arrive.
- Indicator math is linear: Bollinger Bands use a sliding window; RSI and MACD are single passes.

## Engine throughput (Node)

| candles | `normalizeCandles` | `calcRSI` | `calcMACD` | `calcBollingerBands` |
|---|---|---|---|---|
| 100,000 | 0.4 ms | 3.2 ms | 8.1 ms | 12.7 ms |
| 1,000,000 | 5 ms | 78 ms | 127 ms | 136 ms |

## React Native (iOS simulator)

The 50,000-candle scenario with every panel mounts in about 130 ms. Under a barrage of full-width swipes the JS thread averaged ~31 fps on the simulator (the Skia canvas itself renders on the UI thread). Treat simulator numbers as a floor; use a device for final measurements.

## Bundle size

`calcRSI` alone costs 657 B gzipped; the whole engine 8.4 kB; a web app using `SLChart` about 10.4 kB (engine and drawing code included).

## Tips

- **Memoise** indicator arrays (`useMemo` on the candles) so they are recomputed only when data changes.
- **Cap live feeds** to a few thousand to tens of thousands of candles.
- **Do not** create a new `theme` object, `indicators` array or `markers` array on every render when nothing changed — pass stable references.
- Prefer `visibleDataPoints` of a few hundred at most; zooming out further just draws sub-pixel candles.
