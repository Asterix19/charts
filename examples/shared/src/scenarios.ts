import {
  buildChartPipeline,
  type ChartConfig,
  calcBollingerBands,
  calcMACD,
  normalizeCandles,
  calcEMA,
  calcSMA,
  type Candle,
  type ChartMarker,
  type ChartProps,
  type ChartThemeColors,
  type CustomPanel,
  type IndicatorLine,
  type ShadedArea,
} from '@stacklatte/chart-engine';
import { BASE_TS, MINUTE, createRng, generateCandles, nextCandle, tickLast } from './data';

export type ScenarioKind = 'feature' | 'edge' | 'stress' | 'live';

/** Props every renderer shares; each demo adds its own width/height. */
export type ScenarioProps = Omit<ChartProps, 'data' | 'width' | 'height'>;

export interface Scenario {
  /** Stable id — used as a URL hash, a test id and an accessibility label on every platform. */
  id: string;
  title: string;
  description: string;
  kind: ScenarioKind;
  /** Chart height in px (renderers pick their own width). */
  height: number;
  /** Candle count at start — drives stress budgets in the tests. */
  candles: number;
  data(): Candle[];
  props(data: Candle[]): ScenarioProps;
  /** Present on live scenarios: how often the feed ticks and how it mutates the series. */
  live?: { tickMs: number; next(data: Candle[], tick: number): Candle[] };
  /**
   * Upper bounds enforced by the e2e suites. Measured headless-Chromium results are ~30-45 ms mount and a
   * 16.7 ms p95 frame (vsync-capped 60 fps) even at 50,000 candles, so these leave ~10x on mount and 2x on
   * frames for slower CI machines — tight enough that a real regression fails the build.
   */
  budget?: { mountMs: number; frameMs: number };
}

const COLORS = { yellow: '#facc15', sky: '#38bdf8', pink: '#f472b6', purple: '#c084fc' };

const PURPLE_THEME: ChartThemeColors = {
  background: '#1a0533', candleUp: '#c084fc', candleDown: '#f43f5e', gridH: '#3b1a6640', gridV: '#3b1a6640',
  priceLabel: '#e9d5ff', timeLabel: '#e9d5ff', crosshair: '#e9d5ff', lineChart: '#c084fc', rsiLine: '#f9a8d4',
  rsiThreshold: '#6d28d9', hudBackground: '#2a0a4a', hudText: '#e9d5ff', markerNeutral: '#e9d5ff',
} as ChartThemeColors;

const cache = new Map<string, Candle[]>();
const cached = (key: string, make: () => Candle[]) => {
  let v = cache.get(key);
  if (!v) cache.set(key, (v = make()));
  return v;
};

const compact = (lines: Array<IndicatorLine | null | undefined>): IndicatorLine[] => lines.filter((l): l is IndicatorLine => !!l);

function movingAverages(data: Candle[]): IndicatorLine[] {
  return compact([calcEMA(data, 9, 'ema9', COLORS.yellow), calcEMA(data, 21, 'ema21', COLORS.sky), calcSMA(data, 50, 'sma50', COLORS.pink)]);
}

function bollinger(data: Candle[]): { indicators: IndicatorLine[]; shadedAreas: ShadedArea[] } {
  const bb = calcBollingerBands(data, 20, 2, { upper: '#9ca3af', lower: '#9ca3af', basis: COLORS.purple });
  if (!bb) return { indicators: [], shadedAreas: [] };
  return { indicators: [bb.upper, bb.lower, bb.basis], shadedAreas: [{ fromId: bb.upper.id, toId: bb.lower.id, color: COLORS.purple, opacity: 0.12 }] };
}

function markersFor(data: Candle[], at_ = [0.55, 0.65, 0.7, 0.78, 0.84, 0.9]): ChartMarker[] {
  if (data.length < 40) return [];
  const at = (f: number) => data[Math.floor(data.length * f)];
  const m = (f: number, kind: ChartMarker['kind'], label: string, price: 'low' | 'high' | 'close' = 'close'): ChartMarker => ({
    timestamp: at(f).timestamp, price: at(f)[price], kind, label,
  });
  return [
    m(at_[0], 'entry-long', 'Buy', 'low'), m(at_[1], 'take-profit', 'TP', 'high'), m(at_[2], 'exit-long', 'Close'),
    m(at_[3], 'entry-short', 'Sell', 'high'), m(at_[4], 'stop-loss', 'SL', 'high'), m(at_[5], 'exit-short', 'Cover'),
  ];
}

/** Six in-window markers plus one far outside the window, in a deliberately scrambled order. */
function scrambled(d: Candle[]): ChartMarker[] {
  const inside = markersFor(d, [0.82, 0.86, 0.9, 0.93, 0.96, 0.985]);
  const outside = markersFor(d, [0.1, 0.1, 0.1, 0.1, 0.1, 0.1])[0];
  return [inside[4], outside, inside[1], inside[5], inside[0], inside[3], inside[2]];
}

function correlationPanel(data: Candle[]): CustomPanel {
  return {
    id: 'corr', label: 'Correlation', yRange: { min: -1, max: 1 }, referenceLines: [0],
    series: [{ id: 'corr', name: 'Corr', color: COLORS.sky, data: data.map((c, i) => ({ timestamp: c.timestamp, value: Math.sin(i / 17) * 0.8 })) }],
  };
}


/** A rich ChartConfig (as an LLM would produce it) — exercised through buildChartPipeline on every renderer. */
const RICH_CONFIG: ChartConfig = {
  version: '1', theme: 'dark', priceDisplay: 'candle', interval: '1m',
  overlays: [
    { type: 'ema', id: 'ema-9', params: { period: 9 }, color: 'cyan' },
    { type: 'sma', id: 'sma-30', params: { period: 30 }, color: 'orange', label: 'SMA 30' },
    { type: 'vwap', id: 'vwap', params: {}, color: 'pink' },
    { type: 'bollinger_bands', params: { period: 20, stdDev: 2 }, bands: {
      upper: { id: 'bb-u', color: 'blue' }, lower: { id: 'bb-l', color: 'blue' }, basis: { id: 'bb-b', color: 'gray' } } },
  ],
  shadedAreas: [{ fromOverlayId: 'bb-u', toOverlayId: 'bb-l', color: 'purple', opacity: 0.12 }],
  subPanels: [{ type: 'rsi', params: { period: 14 } }, { type: 'macd' }, { type: 'volume' }],
  viewport: { visibleCandles: 100, followLive: true },
  hud: { showOhlcHud: true },
};

function fromConfig(d: Candle[]): ScenarioProps {
  const { data: _data, ...props } = buildChartPipeline({ ...RICH_CONFIG, markers: markersFor(d, [0.82, 0.85, 0.88, 0.91, 0.94, 0.97]).slice(0, 3).map(({ timestamp, price, kind, label }) => ({ timestamp, price, kind, label: label ?? '' })) }, d);
  return props;
}

function autoRangePanel(data: Candle[]): CustomPanel {
  return {
    id: 'spread', label: 'Spread', yRange: 'auto', referenceLines: [0],
    series: [
      { id: 'fast', name: 'Fast', color: COLORS.yellow, data: data.map((c, i) => ({ timestamp: c.timestamp, value: Math.sin(i / 9) * 40 })) },
      { id: 'slow', name: 'Slow', color: COLORS.pink, data: data.map((c, i) => ({ timestamp: c.timestamp, value: Math.cos(i / 23) * 25 })) },
    ],
  };
}

const base = (n = 500) => cached(`base-${n}`, () => generateCandles(n));

const feature = (s: Omit<Scenario, 'kind' | 'data' | 'candles'> & { n?: number }): Scenario => ({
  kind: 'feature', candles: s.n ?? 500, data: () => base(s.n ?? 500), ...s,
});

export const SCENARIOS: Scenario[] = [
  feature({ id: 'basic', title: 'Basic', description: 'Candlestick chart — pan to scroll, pinch/wheel to zoom. 500 candles at 1-minute interval.', height: 320,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 60, theme: 'dark' }) }),
  feature({ id: 'line', title: 'Line', description: 'chartType="line" — same data, different render mode.', height: 320,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 60, chartType: 'line' }) }),
  feature({ id: 'indicators', title: 'Indicators', description: 'EMA(9), EMA(21) and SMA(50) overlaid with calcEMA / calcSMA.', height: 320,
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 80, indicators: movingAverages(d) }) }),
  feature({ id: 'bollinger', title: 'Bollinger', description: 'Bollinger Bands (20, 2σ) with a shaded area between the upper and lower band.', height: 320,
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 80, ...bollinger(d) }) }),
  feature({ id: 'rsi', title: 'RSI Panel', description: 'showRsiPanel renders a Wilder-smoothed RSI(14) with 30/70 thresholds.', height: 440,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 80, showRsiPanel: true }) }),
  feature({ id: 'macd', title: 'MACD Panel', description: 'showMacdPanel renders MACD(12,26,9): lines plus histogram.', height: 440,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 80, showMacdPanel: true }) }),
  feature({ id: 'volume', title: 'Volume Panel', description: 'showVolumePanel renders volume bars coloured by candle direction.', height: 440,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 80, showVolumePanel: true }) }),
  feature({ id: 'hud', title: 'OHLC HUD', description: 'showOhlcHud adds the OHLC readout and a crosshair that follows the pointer.', height: 360,
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 80, showOhlcHud: true, indicators: movingAverages(d).slice(0, 2) }) }),
  feature({ id: 'markers', title: 'Trade Markers', description: 'Entry / exit / stop-loss / take-profit markers pinned to price and time.', height: 340,
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 120, markers: markersFor(d), scrollToLatestTrigger: 0 }) }),
  feature({ id: 'custom-panel', title: 'Custom Panel', description: 'customPanels adds your own named sub-panel (here a correlation series).', height: 440,
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 80, showOhlcHud: true, customPanels: [correlationPanel(d)] }) }),
  feature({ id: 'all-panels', title: 'All Panels', description: 'Volume + RSI + MACD + custom panel + overlays + HUD at once.', height: 640,
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 80, showOhlcHud: true, showVolumePanel: true, showRsiPanel: true, showMacdPanel: true,
      indicators: movingAverages(d).slice(0, 2), customPanels: [correlationPanel(d)] }) }),
  feature({ id: 'theme-custom', title: 'Custom Theme', description: 'Pass a full ChartThemeColors object to theme — any palette works.', height: 320,
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 80, theme: PURPLE_THEME, indicators: movingAverages(d) }) }),
  feature({ id: 'theme-light', title: 'Light Theme', description: 'theme="light".', height: 320,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 80, theme: 'light', showGrid: true }) }),

  feature({ id: 'config-pipeline', title: 'ChartConfig', description: 'Props produced by buildChartPipeline() from a closed-enum ChartConfig: EMA, SMA, VWAP, Bollinger + shaded band, RSI, MACD, volume, markers, HUD.', height: 700,
    props: (d) => fromConfig(d) }),
  feature({ id: 'hour12', title: '12-hour time', description: 'hour12 switches the time axis to AM/PM labels.', height: 320,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 80, hour12: true }) }),
  feature({ id: 'no-grid', title: 'No grid', description: 'showGrid={false} removes the background grid; axis labels stay.', height: 320,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 80, showGrid: false }) }),
  feature({ id: 'max-zoom', title: 'Max zoom', description: 'maxZoom={50} limits how many candles can be visible at once, however far you zoom out.', height: 320,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 200, maxZoom: 50 }) }),
  feature({ id: 'rsi-period', title: 'RSI(7)', description: 'A valid non-default rsiPeriod (7) — the default is 14.', height: 440,
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 80, showRsiPanel: true, rsiPeriod: 7 }) }),
  feature({ id: 'line-markers', title: 'Line + markers', description: 'chartType="line" combined with overlays, trade markers and the HUD.', height: 360,
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 120, chartType: 'line', showOhlcHud: true, markers: markersFor(d, [0.8, 0.84, 0.88, 0.92, 0.95, 0.98]), indicators: movingAverages(d).slice(0, 2) }) }),
  feature({ id: 'custom-panel-auto', title: 'Custom panel (auto)', description: 'A custom panel with yRange "auto", two series sharing one scale, and a reference line.', height: 440,
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 100, customPanels: [autoRangePanel(d)] }) }),

  // ── Stress ────────────────────────────────────────────────────────────────
  {
    id: 'stress-2k', title: 'Stress 2k', kind: 'stress', candles: 2_000, height: 480,
    description: '2,000 candles + EMA + Bollinger Bands + RSI panel + OHLC HUD, zoomed out to 240 candles.',
    data: () => cached('stress-2k', () => generateCandles(2_000, { startPrice: 30_000, seed: 7 })),
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 240, showOhlcHud: true, showRsiPanel: true,
      ...(() => { const b = bollinger(d); return { indicators: [...compact([calcEMA(d, 9, 'ema9', COLORS.yellow), calcEMA(d, 21, 'ema21', COLORS.sky)]), ...b.indicators], shadedAreas: b.shadedAreas }; })() }),
    budget: { mountMs: 500, frameMs: 34 },
  },
  {
    id: 'stress-extreme', title: 'Stress 50k', kind: 'stress', candles: 50_000, height: 640,
    description: '50,000 candles with every panel and indicator on, zoomed out to 500 candles — the worst case we support.',
    data: () => cached('stress-extreme', () => generateCandles(50_000, { startPrice: 20_000, seed: 11 })),
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 500, showOhlcHud: true, showRsiPanel: true, showMacdPanel: true, showVolumePanel: true,
      ...(() => { const b = bollinger(d); return { indicators: [...compact([calcEMA(d, 9, 'ema9', COLORS.yellow)]), ...b.indicators], shadedAreas: b.shadedAreas }; })() }),
    budget: { mountMs: 1_000, frameMs: 34 },
  },

  // ── Live feeds ────────────────────────────────────────────────────────────
  {
    id: 'live-2s', title: 'Live Feed', kind: 'live', candles: 80, height: 320,
    description: 'A new candle is appended every 2 seconds; the chart follows the latest price.',
    data: () => cached('live-2s', () => generateCandles(80, { seed: 3 })),
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 40, showOhlcHud: true }),
    live: { tickMs: 2_000, next: (d, tick) => [...d, nextCandle(d[d.length - 1], createRng(1_000 + tick))] },
    budget: { mountMs: 500, frameMs: 34 },
  },
  {
    id: 'live-burst', title: 'Live Burst', kind: 'live', candles: 300, height: 400,
    description: 'Ticks every 100 ms (mutate the forming candle, append a new one every 5th tick), capped at 10,000 candles.',
    data: () => cached('live-burst', () => generateCandles(300, { seed: 5 })),
    props: () => ({ intervalMs: MINUTE, visibleDataPoints: 60, showOhlcHud: true, showRsiPanel: true }),
    live: {
      tickMs: 100,
      next: (d, tick) => {
        const rand = createRng(5_000 + tick);
        const out = tick % 5 === 0 ? [...d, nextCandle(d[d.length - 1], rand)] : [...d.slice(0, -1), tickLast(d[d.length - 1], rand)];
        return out.length > 10_000 ? out.slice(out.length - 10_000) : out;
      },
    },
    budget: { mountMs: 500, frameMs: 34 },
  },

  // ── Edge cases: the chart must never throw or render garbage ─────────────
  { id: 'edge-empty', title: 'No data', kind: 'edge', candles: 0, height: 240, description: 'data=[] — renders a "No data" placeholder.',
    data: () => [], props: () => ({ intervalMs: MINUTE, showRsiPanel: true, showVolumePanel: true }) },
  { id: 'edge-single', title: '1 candle', kind: 'edge', candles: 1, height: 240, description: 'A single candle.',
    data: () => generateCandles(1), props: () => ({ intervalMs: MINUTE, showOhlcHud: true, showRsiPanel: true }) },
  { id: 'edge-few', title: '5 candles', kind: 'edge', candles: 5, height: 280, description: 'Fewer candles than any indicator period.',
    data: () => generateCandles(5), props: (d) => ({ intervalMs: MINUTE, showRsiPanel: true, showMacdPanel: true, indicators: movingAverages(d) }) },
  { id: 'edge-flat', title: 'Flat market', kind: 'edge', candles: 200, height: 320, description: 'Every candle at the same price (zero price range).',
    data: () => generateCandles(200, { volatility: 0, startPrice: 100 }), props: () => ({ intervalMs: MINUTE, showRsiPanel: true, showVolumePanel: true }) },
  { id: 'edge-huge', title: 'Huge prices', kind: 'edge', candles: 300, height: 320, description: 'Prices around 1e9.',
    data: () => generateCandles(300, { startPrice: 1e9, seed: 21 }), props: () => ({ intervalMs: MINUTE, showRsiPanel: true }) },
  { id: 'edge-tiny', title: 'Tiny prices', kind: 'edge', candles: 300, height: 320, description: 'Prices around 1e-6 (micro-cap tokens).',
    data: () => generateCandles(300, { startPrice: 0.000001, seed: 22 }), props: () => ({ intervalMs: MINUTE, showRsiPanel: true }) },
  { id: 'edge-unsorted', title: 'Unsorted + dupes', kind: 'edge', candles: 200, height: 320,
    description: 'Candles arrive out of order with duplicate timestamps — the chart sorts and dedupes.',
    data: () => { const d = generateCandles(200, { seed: 31 }); return [...d.slice(100), ...d.slice(0, 100), ...d.slice(50, 60)]; },
    props: () => ({ intervalMs: MINUTE }) },
  { id: 'edge-dirty', title: 'Dirty feed', kind: 'edge', candles: 300, height: 360,
    description: 'A feed with NaN / Infinity prices, null entries and garbage volume — bad candles are dropped, the chart still renders.',
    data: () => generateCandles(300, { seed: 51 }).map((c, i): Candle => {
      if (i % 37 === 5) return { ...c, close: NaN };
      if (i % 53 === 7) return { ...c, high: Infinity };
      if (i % 29 === 3) return { ...c, volume: NaN };
      if (i % 61 === 11) return null as unknown as Candle;
      return c;
    }),
    props: () => ({ intervalMs: MINUTE, showVolumePanel: true, showRsiPanel: true, showOhlcHud: true }) },
  { id: 'edge-bad-period', title: 'Bad period', kind: 'edge', candles: 200, height: 360,
    description: 'rsiPeriod={-1} — invalid indicator settings degrade to "no data" instead of crashing the render (the published chart threw a TypeError here).',
    data: () => generateCandles(200, { seed: 61 }), props: () => ({ intervalMs: MINUTE, showRsiPanel: true, rsiPeriod: -1 }) },
  { id: 'edge-unsorted-markers', title: 'Unordered markers', kind: 'edge', candles: 500, height: 340,
    description: 'Trade markers (one of them far off-screen) and indicator series supplied in scrambled order are still drawn — they are sorted, not dropped.',
    data: () => base(500),
    props: (d) => ({ intervalMs: MINUTE, visibleDataPoints: 100, markers: scrambled(d),
      indicators: movingAverages(d).map((l) => ({ ...l, data: [...l.data].reverse() })) }) },
  { id: 'edge-gaps', title: 'Gaps', kind: 'edge', candles: 200, height: 320, description: 'Irregular spacing: missing candles and an overnight gap.',
    data: () => generateCandles(260, { seed: 41 }).filter((_, i) => i % 7 !== 3 && !(i > 100 && i < 140)), props: () => ({ intervalMs: MINUTE, showVolumePanel: true }) },
];

export const SCENARIO_IDS = SCENARIOS.map((s) => s.id);

export function getScenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario "${id}". Known: ${SCENARIO_IDS.join(', ')}`);
  return s;
}

export const scenariosByKind = (kind: ScenarioKind): Scenario[] => SCENARIOS.filter((s) => s.kind === kind);
export const BASE_TIMESTAMP = BASE_TS;

/**
 * How many <canvas> elements a renderer should create for a scenario: the main chart plus one per
 * visible sub-panel. The MACD panel is omitted while there is too little data for MACD(12,26,9) to exist.
 * With no data, the React renderer shows a placeholder <div> (`emptyHasCanvas: false`); the DOM-controller
 * renderers (canvas, Angular) draw "No data" on the main canvas (`true`).
 */
export function expectedCanvasCount(s: Scenario, opts: { emptyHasCanvas: boolean }): number {
  const data = s.data();
  if (data.length === 0) return opts.emptyHasCanvas ? 1 : 0;
  const p = s.props(data);
  const macdShown = !!p.showMacdPanel && calcMACD(normalizeCandles(data)) !== null;
  return 1 + [p.showVolumePanel, p.showRsiPanel, macdShown].filter(Boolean).length + (p.customPanels?.length ?? 0);
}
