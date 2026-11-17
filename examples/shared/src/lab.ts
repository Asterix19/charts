/**
 * The Lab: every capability of every chart package as a visible control — not behind a single toggle.
 *
 * One framework-free model drives all three demos (React, Angular, React Native). Each demo only draws the controls from
 * `LAB_CAPABILITIES` and feeds `labChartProps()` to its chart, so the demos cannot drift apart, and a coverage test
 * (lab.test.ts) fails when a `ChartProps` field has no control.
 */
import {
  calcBollingerBands,
  calcEMA,
  calcSMA,
  calcVWAP,
} from '@stacklatte/chart-engine';
import type { Candle, ChartMarker, ChartProps, CustomPanel, IndicatorLine, MarkerKind, ShadedArea } from '@stacklatte/chart-engine';
import { MINUTE, createRng, generateCandles, nextCandle, tickLast } from './data';

// ---------------------------------------------------------------------------- state

export type LabChoice<T extends string = string> = { value: T; label: string };

export interface LabState {
  // data
  count: number;
  seed: number;
  withVolume: boolean;
  dirty: boolean;
  empty: boolean;
  live: 'off' | '3000' | '1000' | '500' | '100';
  // view
  chartType: 'candle' | 'line' | 'area';
  theme: 'dark' | 'light' | 'custom';
  zoom: number;
  maxZoom: 'auto' | '50' | '200';
  interval: 'auto' | '60000' | '300000';
  hour12: boolean;
  sparkline: boolean;
  grid: boolean;
  hud: boolean;
  size: 'fill' | 'compact' | 'tiny';
  // overlays
  sma: boolean; smaPeriod: number;
  ema: boolean; emaPeriod: number;
  bb: boolean; bbPeriod: number; bbMult: number;
  vwap: boolean;
  // panels
  rsi: boolean; rsiPeriod: number;
  macd: boolean;
  volume: boolean;
  customPanel: boolean;
  // markers
  markers: boolean;
  // custom theme colours (used when theme = custom)
  cBackground: string; cUp: string; cDown: string; cGrid: string; cText: string; cCrosshair: string;
  // bumped by the "Now" action
  latest: number;
}

export type LabKey = keyof LabState;
export type LabActionId = 'now' | 'bulk' | 'regen' | 'reset';

export const DEFAULT_LAB_STATE: LabState = {
  count: 500, seed: 42, withVolume: true, dirty: false, empty: false, live: 'off',
  chartType: 'candle', theme: 'dark', zoom: 60, maxZoom: 'auto', interval: 'auto', hour12: false, sparkline: false, grid: true, hud: true, size: 'fill',
  sma: false, smaPeriod: 20, ema: false, emaPeriod: 50, bb: false, bbPeriod: 20, bbMult: 2, vwap: false,
  rsi: false, rsiPeriod: 14, macd: false, volume: false, customPanel: false,
  markers: false,
  cBackground: '#1a0533', cUp: '#c084fc', cDown: '#f43f5e', cGrid: '#3b1a66', cText: '#e9d5ff', cCrosshair: '#e9d5ff',
  latest: 0,
};

// ---------------------------------------------------------------------------- capability catalogue

export type LabGroup = 'Data' | 'View' | 'Overlays' | 'Panels' | 'Markers' | 'Custom theme colours' | 'Actions';

export type LabControl =
  | { kind: 'bool' }
  | { kind: 'enum'; options: LabChoice[] }
  | { kind: 'number'; min: number; max: number; step: number }
  | { kind: 'color'; presets: string[] }
  | { kind: 'action'; action: LabActionId };

export interface LabCapability {
  /** Stable id: the state key, or the action id. Also the test id suffix (`lab-<id>`) in every demo. */
  id: string;
  group: LabGroup;
  label: string;
  hint?: string;
  control: LabControl;
  /** The ChartProps fields this capability exercises (used by the coverage guard). */
  props: (keyof ChartProps)[];
  /** Hidden-until-relevant: the control is only shown while this predicate holds (e.g. a period needs its overlay on). */
  needs?: (s: LabState) => boolean;
}

const opts = (...pairs: [string, string][]): LabChoice[] => pairs.map(([value, label]) => ({ value, label }));
const num = (n: number): LabChoice => ({ value: String(n), label: n >= 1000 ? `${n / 1000}k` : String(n) });
const PALETTE = ['#1a0533', '#0b132b', '#0d3b2e', '#ffffff', '#c084fc', '#22d3ee', '#4ade80', '#f43f5e', '#facc15', '#e9d5ff'];

export const LAB_CAPABILITIES: LabCapability[] = [
  // Data
  { id: 'count', group: 'Data', label: 'Candles', hint: 'Dataset size. 50k is the stress case.', control: { kind: 'enum', options: [30, 100, 500, 2000, 10000, 50000].map(num) }, props: ['data'] },
  { id: 'live', group: 'Data', label: 'Live feed', hint: 'Ticks the forming candle and rolls a new one every 5th tick. ⚡ = 100 ms.', control: { kind: 'enum', options: opts(['off', 'Off'], ['3000', '3 s'], ['1000', '1 s'], ['500', '½ s'], ['100', '⚡ 100 ms']) }, props: ['data'] },
  { id: 'withVolume', group: 'Data', label: 'Volume data', hint: 'Off removes volume from every candle (the volume panel then has nothing to draw).', control: { kind: 'bool' }, props: ['data'] },
  { id: 'dirty', group: 'Data', label: 'Dirty feed', hint: 'Injects NaN, duplicates and out-of-order candles. The chart must not blank or crash.', control: { kind: 'bool' }, props: ['data'] },
  { id: 'empty', group: 'Data', label: 'No data', hint: 'data = [] shows the “No data” placeholder.', control: { kind: 'bool' }, props: ['data'] },
  // View
  { id: 'chartType', group: 'View', label: 'Chart type', control: { kind: 'enum', options: opts(['candle', 'Candles'], ['line', 'Line'], ['area', 'Area']) }, props: ['chartType'] },
  { id: 'theme', group: 'View', label: 'Theme', hint: 'Custom uses the colours below.', control: { kind: 'enum', options: opts(['dark', 'Dark'], ['light', 'Light'], ['custom', 'Custom']) }, props: ['theme'] },
  { id: 'zoom', group: 'View', label: 'Visible candles', hint: 'visibleDataPoints', control: { kind: 'enum', options: [10, 20, 40, 60, 120, 240, 500].map(num) }, props: ['visibleDataPoints'] },
  { id: 'maxZoom', group: 'View', label: 'Max zoom-out', hint: 'maxZoom caps how many candles the user can zoom out to.', control: { kind: 'enum', options: opts(['auto', 'Auto'], ['50', '50'], ['200', '200']) }, props: ['maxZoom'] },
  { id: 'interval', group: 'View', label: 'Interval', hint: 'intervalMs: auto-detect, or forced (wrong on purpose for 5 min).', control: { kind: 'enum', options: opts(['auto', 'Auto'], ['60000', '1 min'], ['300000', '5 min']) }, props: ['intervalMs'] },
  { id: 'hour12', group: 'View', label: '12-hour clock', control: { kind: 'bool' }, props: ['hour12'] },
  { id: 'grid', group: 'View', label: 'Grid lines', control: { kind: 'bool' }, props: ['showGrid'] },
  { id: 'hud', group: 'View', label: 'OHLC HUD + crosshair', hint: 'showOhlcHud. Hover or touch the chart.', control: { kind: 'bool' }, props: ['showOhlcHud', 'onCrosshairChange'] },
  { id: 'sparkline', group: 'View', label: 'Sparkline mode', hint: 'sparkline: compact area for lists of small charts. No axes, panels or crosshair; does not capture scrolling.', control: { kind: 'bool' }, props: ['sparkline'] },
  { id: 'size', group: 'View', label: 'Chart size', hint: 'width / height: fill the area, a fixed box, or a tiny one.', control: { kind: 'enum', options: opts(['fill', 'Fill'], ['compact', 'Compact'], ['tiny', 'Tiny']) }, props: ['width', 'height'] },
  // Overlays
  { id: 'sma', group: 'Overlays', label: 'SMA', control: { kind: 'bool' }, props: ['indicators'] },
  { id: 'smaPeriod', group: 'Overlays', label: 'SMA period', control: { kind: 'number', min: 2, max: 100, step: 1 }, props: ['indicators'], needs: (s) => s.sma },
  { id: 'ema', group: 'Overlays', label: 'EMA', control: { kind: 'bool' }, props: ['indicators'] },
  { id: 'emaPeriod', group: 'Overlays', label: 'EMA period', control: { kind: 'number', min: 2, max: 200, step: 1 }, props: ['indicators'], needs: (s) => s.ema },
  { id: 'bb', group: 'Overlays', label: 'Bollinger Bands + shaded area', hint: 'indicators + shadedAreas', control: { kind: 'bool' }, props: ['indicators', 'shadedAreas'] },
  { id: 'bbPeriod', group: 'Overlays', label: 'Bollinger period', control: { kind: 'number', min: 2, max: 100, step: 1 }, props: ['indicators'], needs: (s) => s.bb },
  { id: 'bbMult', group: 'Overlays', label: 'Bollinger σ', control: { kind: 'number', min: 0.5, max: 4, step: 0.5 }, props: ['indicators'], needs: (s) => s.bb },
  { id: 'vwap', group: 'Overlays', label: 'VWAP', control: { kind: 'bool' }, props: ['indicators'] },
  // Panels
  { id: 'rsi', group: 'Panels', label: 'RSI panel', hint: 'showRsiPanel', control: { kind: 'bool' }, props: ['showRsiPanel'] },
  { id: 'rsiPeriod', group: 'Panels', label: 'RSI period', hint: 'rsiPeriod', control: { kind: 'number', min: 2, max: 50, step: 1 }, props: ['rsiPeriod'], needs: (s) => s.rsi },
  { id: 'macd', group: 'Panels', label: 'MACD panel', hint: 'showMacdPanel (needs ≥ 35 candles)', control: { kind: 'bool' }, props: ['showMacdPanel'] },
  { id: 'volume', group: 'Panels', label: 'Volume panel', hint: 'showVolumePanel', control: { kind: 'bool' }, props: ['showVolumePanel'] },
  { id: 'customPanel', group: 'Panels', label: 'Custom panel', hint: 'customPanels: a −1…1 series with a zero line', control: { kind: 'bool' }, props: ['customPanels'] },
  // Markers
  { id: 'markers', group: 'Markers', label: 'Trade markers', hint: 'markers: all six kinds. Hover a marker for its tooltip.', control: { kind: 'bool' }, props: ['markers'] },
  // Custom theme colours
  ...([
    ['cBackground', 'Background'], ['cUp', 'Candle up'], ['cDown', 'Candle down'], ['cGrid', 'Grid'], ['cText', 'Labels'], ['cCrosshair', 'Crosshair'],
  ] as const).map(([id, label]): LabCapability => ({ id, group: 'Custom theme colours', label, control: { kind: 'color', presets: PALETTE }, props: ['theme'], needs: (s) => s.theme === 'custom' })),
  // Actions
  { id: 'now', group: 'Actions', label: '↵ Jump to latest', hint: 'scrollToLatestTrigger', control: { kind: 'action', action: 'now' }, props: ['scrollToLatestTrigger'] },
  { id: 'bulk', group: 'Actions', label: '+5K candles', hint: 'Stress: append 5,000 candles (capped at 60,000).', control: { kind: 'action', action: 'bulk' }, props: ['data'] },
  { id: 'regen', group: 'Actions', label: 'New random data', control: { kind: 'action', action: 'regen' }, props: ['data'] },
  { id: 'reset', group: 'Actions', label: 'Reset everything', control: { kind: 'action', action: 'reset' }, props: [] },
];

export const LAB_GROUPS: LabGroup[] = ['Data', 'View', 'Overlays', 'Panels', 'Markers', 'Custom theme colours', 'Actions'];

/** ChartProps fields the Lab deliberately has no control for, with the reason. Everything else needs a capability. */
export const LAB_EXCLUDED_PROPS = {
  bufferRatio: 'deprecated: accepted for compatibility, no renderer reads it',
} as const;

// ---------------------------------------------------------------------------- data

const MAX_CANDLES = 60_000;
const baseStart = (count: number) => Math.floor(Date.now() / MINUTE) * MINUTE - (count - 1) * MINUTE;

function makeBase(s: LabState): Candle[] {
  return generateCandles(s.count, { seed: s.seed, startTs: baseStart(s.count), startPrice: 50_000, withVolume: s.withVolume });
}

/** The feed as a broken exchange would deliver it: a NaN candle, a duplicate timestamp and two swapped chunks. */
export function makeDirty(data: Candle[]): Candle[] {
  if (data.length < 8) return data;
  const out = data.slice();
  const mid = Math.floor(out.length / 2);
  out.splice(mid, 0, { ...out[mid], close: Number.NaN, high: Number.NaN });
  out.splice(mid + 3, 0, { ...out[mid + 2] }); // duplicate timestamp
  const a = out.slice(2, 5), b = out.slice(5, 8);
  out.splice(2, 6, ...b, ...a); // two out-of-order chunks
  return out;
}

// ---------------------------------------------------------------------------- state -> chart props

const MARKER_KINDS: MarkerKind[] = ['entry-long', 'exit-long', 'entry-short', 'exit-short', 'stop-loss', 'take-profit'];

export function labMarkers(data: Candle[]): ChartMarker[] {
  if (data.length < 10) return [];
  return [0.62, 0.7, 0.76, 0.82, 0.88, 0.94].map((at, i) => {
    const c = data[Math.min(data.length - 1, Math.floor(data.length * at))];
    const kind = MARKER_KINDS[i];
    return { timestamp: c.timestamp, price: kind.startsWith('entry') ? c.low : c.high, kind, label: kind.replace('-', ' '), changePct: kind.startsWith('exit') || kind === 'take-profit' ? 1.5 : kind === 'stop-loss' ? -0.8 : undefined };
  });
}

export function labCustomPanel(data: Candle[]): CustomPanel {
  return {
    id: 'wave', label: 'Wave −1…1', yRange: { min: -1, max: 1 }, referenceLines: [0],
    series: [{ id: 'wave', name: 'wave', color: '#38bdf8', data: data.map((c, i) => ({ timestamp: c.timestamp, value: Math.sin(i / 9) })) }],
  };
}

export type LabChartProps = Omit<ChartProps, 'data' | 'width' | 'height' | 'onCrosshairChange' | 'bufferRatio'> & { data: Candle[] };

export function labChartProps(s: LabState, data: Candle[]): LabChartProps {
  const indicators: IndicatorLine[] = [];
  const shadedAreas: ShadedArea[] = [];
  if (!s.empty && data.length) {
    if (s.sma) { const l = calcSMA(data, s.smaPeriod, 'sma', '#F5A623'); if (l) indicators.push(l); }
    if (s.ema) { const l = calcEMA(data, s.emaPeriod, 'ema', '#50E3C2'); if (l) indicators.push(l); }
    if (s.vwap) { const l = calcVWAP(data, 'vwap', '#60A5FA'); if (l) indicators.push(l); }
    if (s.bb) {
      const b = calcBollingerBands(data, s.bbPeriod, s.bbMult, { upper: '#9B59B6', basis: '#7F8C8D', lower: '#9B59B6' });
      if (b) { indicators.push(b.upper, b.basis, b.lower); shadedAreas.push({ fromId: 'bb-upper', toId: 'bb-lower', color: '#9B59B6', opacity: 0.12 }); }
    }
  }
  const theme: ChartProps['theme'] = s.theme === 'custom'
    ? { background: s.cBackground, candleUp: s.cUp, candleDown: s.cDown, gridH: `${s.cGrid}66`, gridV: `${s.cGrid}66`, priceLabel: s.cText, timeLabel: s.cText, crosshair: s.cCrosshair,
        lineChart: s.cUp, rsiLine: s.cText, rsiThreshold: s.cGrid, hudBackground: s.cBackground, hudText: s.cText, markerNeutral: s.cText }
    : s.theme;
  return {
    data: s.empty ? [] : data,
    indicators, shadedAreas,
    markers: s.markers ? labMarkers(data) : [],
    customPanels: s.customPanel && data.length ? [labCustomPanel(data)] : [],
    intervalMs: s.interval === 'auto' ? undefined : Number(s.interval),
    visibleDataPoints: s.zoom,
    theme,
    showOhlcHud: s.hud,
    showRsiPanel: s.rsi, rsiPeriod: s.rsiPeriod,
    showMacdPanel: s.macd,
    showVolumePanel: s.volume,
    chartType: s.chartType,
    scrollToLatestTrigger: s.latest,
    hour12: s.hour12,
    sparkline: s.sparkline,
    maxZoom: s.maxZoom === 'auto' ? undefined : Number(s.maxZoom),
    showGrid: s.grid,
  };
}

/** Chart box for the available area: `fill` uses all of it, `compact` a fixed box, `tiny` a thumbnail. */
export function labSize(size: LabState['size'], avail: { width: number; height: number }): { width: number; height: number } {
  if (size === 'tiny') return { width: Math.min(220, avail.width), height: Math.min(140, avail.height) };
  if (size === 'compact') return { width: Math.min(560, avail.width), height: Math.min(320, avail.height) };
  return avail;
}

// ---------------------------------------------------------------------------- model (state + data + live feed)

export interface LabModel {
  getState(): LabState;
  getData(): Candle[];
  /** The candles handed to the chart: dirty/empty applied. Stable identity until something changes. */
  getChartData(): Candle[];
  set<K extends LabKey>(key: K, value: LabState[K]): void;
  act(action: LabActionId): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export function createLab(initial: Partial<LabState> = {}): LabModel {
  let state: LabState = { ...DEFAULT_LAB_STATE, ...initial };
  let data = makeBase(state);
  let chartData = data;
  let srcData: Candle[] | null = data;
  let srcDirty = state.dirty;
  let timer: ReturnType<typeof setInterval> | null = null;
  let tick = 0;
  let rand = createRng(state.seed + 1);
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  // Stable identity: only rebuilt when the source candles or the dirty flag change.
  const refreshChartData = () => {
    if (srcData !== data || srcDirty !== state.dirty) {
      chartData = state.dirty ? makeDirty(data) : data;
      srcData = data;
      srcDirty = state.dirty;
    }
  };
  const regenerate = () => { data = makeBase(state); rand = createRng(state.seed + 1); tick = 0; };

  const restartFeed = () => {
    if (timer) clearInterval(timer);
    timer = null;
    if (state.live === 'off') return;
    timer = setInterval(() => {
      tick++;
      const last = data[data.length - 1];
      if (!last) return;
      const next = tick % 5 === 0 ? [...data.slice(data.length >= MAX_CANDLES ? 1 : 0), nextCandle(last, rand)] : [...data.slice(0, -1), tickLast(last, rand)];
      data = next;
      refreshChartData();
      emit();
    }, Number(state.live));
  };

  const model: LabModel = {
    getState: () => state,
    getData: () => data,
    getChartData: () => { refreshChartData(); return chartData; },
    set(key, value) {
      if (state[key] === value) return;
      state = { ...state, [key]: value };
      if (key === 'count' || key === 'withVolume') regenerate();
      if (key === 'live') restartFeed();
      emit();
    },
    act(action) {
      if (action === 'now') state = { ...state, latest: state.latest + 1 };
      else if (action === 'regen') { state = { ...state, seed: state.seed + 1 }; regenerate(); }
      else if (action === 'bulk') {
        let prev = data[data.length - 1];
        const extra: Candle[] = [];
        for (let i = 0; i < 5000 && prev; i++) { prev = nextCandle(prev, rand); extra.push(prev); }
        const all = [...data, ...extra];
        data = all.length > MAX_CANDLES ? all.slice(all.length - MAX_CANDLES) : all;
        state = { ...state, latest: state.latest + 1 };
      } else if (action === 'reset') {
        state = { ...DEFAULT_LAB_STATE };
        regenerate();
        restartFeed();
      }
      emit();
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { if (timer) clearInterval(timer); timer = null; listeners.clear(); },
  };
  restartFeed();
  return model;
}

/** Controls visible for the current state, grouped in display order. */
export function visibleCapabilities(state: LabState): { group: LabGroup; items: LabCapability[] }[] {
  return LAB_GROUPS.map((group) => ({ group, items: LAB_CAPABILITIES.filter((c) => c.group === group && (!c.needs || c.needs(state))) })).filter((g) => g.items.length);
}

// ---------------------------------------------------------------------------- renderer helpers

/** The option value string currently selected for an enum control (state may hold a number). */
export const labSelected = (state: LabState, id: string): string => String((state as unknown as Record<string, unknown>)[id]);

/** Set a control from what a renderer has in hand: an option string, a number, a boolean or a colour. Coerces numeric enums. */
export function labApply(model: LabModel, id: string, raw: string | number | boolean): void {
  const current = (model.getState() as unknown as Record<string, unknown>)[id];
  const value = typeof current === 'number' ? Number(raw) : typeof current === 'boolean' ? Boolean(raw) : raw;
  model.set(id as LabKey, value as never);
}

/** The package each demo showcases, and the accent colour that makes it unmistakable on screen. */
export const DEMO_PACKAGES = {
  react: { pkg: '@stacklatte/chart-react', platform: 'React · Next.js', renderer: 'HTML5 Canvas 2D', accent: '#2563eb' },
  angular: { pkg: '@stacklatte/chart-angular', platform: 'Angular', renderer: 'HTML5 Canvas 2D', accent: '#dd0031' },
  native: { pkg: '@stacklatte/chart-native', platform: 'React Native · iOS / Android', renderer: 'Skia (GPU)', accent: '#16a34a' },
} as const;
export type DemoPackageId = keyof typeof DEMO_PACKAGES;
