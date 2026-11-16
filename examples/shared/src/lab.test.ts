import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCandles } from '@stacklatte/chart-engine';
import type { ChartProps } from '@stacklatte/chart-engine';
import { DEFAULT_LAB_STATE, LAB_CAPABILITIES, LAB_EXCLUDED_PROPS, createLab, labChartProps, labSize, makeDirty, visibleCapabilities } from './lab';
import type { LabKey, LabState } from './lab';

// Adding a field to ChartProps without deciding how the Lab exposes it is a compile error here.
const PROP_KEYS = {
  data: 1, indicators: 1, shadedAreas: 1, markers: 1, customPanels: 1, width: 1, height: 1, intervalMs: 1, visibleDataPoints: 1, theme: 1,
  showOhlcHud: 1, showRsiPanel: 1, rsiPeriod: 1, showMacdPanel: 1, showVolumePanel: 1, chartType: 1, scrollToLatestTrigger: 1, onCrosshairChange: 1,
  bufferRatio: 1, hour12: 1, maxZoom: 1, showGrid: 1,
} satisfies Record<keyof ChartProps, 1>;

describe('Lab coverage', () => {
  const covered = new Set(LAB_CAPABILITIES.flatMap((c) => c.props));
  it.each(Object.keys(PROP_KEYS))('ChartProps.%s has a control (or a documented reason not to)', (key) => {
    const excluded = key in LAB_EXCLUDED_PROPS;
    expect(covered.has(key as keyof ChartProps) || excluded, `no Lab control exercises "${key}"`).toBe(true);
  });

  it('every control id is a state key or an action, and ids are unique', () => {
    const ids = LAB_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of LAB_CAPABILITIES) {
      if (c.control.kind === 'action') expect(['now', 'bulk', 'regen', 'reset']).toContain(c.control.action);
      else expect(c.id in DEFAULT_LAB_STATE, `${c.id} is not a LabState key`).toBe(true);
    }
  });

  it('every enum default is one of its options and every number default is in range', () => {
    for (const c of LAB_CAPABILITIES) {
      const v = (DEFAULT_LAB_STATE as unknown as Record<string, unknown>)[c.id];
      if (c.control.kind === 'enum') expect(c.control.options.map((o) => o.value), c.id).toContain(String(v));
      if (c.control.kind === 'number') { expect(v as number).toBeGreaterThanOrEqual(c.control.min); expect(v as number).toBeLessThanOrEqual(c.control.max); }
    }
  });
});

describe('labChartProps', () => {
  const model = () => createLab({ count: 200 });
  const props = (patch: Partial<LabState>) => { const m = model(); for (const [k, v] of Object.entries(patch)) m.set(k as LabKey, v as never); const p = labChartProps(m.getState(), m.getChartData()); m.dispose(); return p; };

  it('maps booleans and enums straight to ChartProps', () => {
    const p = props({ rsi: true, macd: true, volume: true, hud: false, grid: false, hour12: true, chartType: 'line', zoom: 120, rsiPeriod: 7 });
    expect(p).toMatchObject({ showRsiPanel: true, showMacdPanel: true, showVolumePanel: true, showOhlcHud: false, showGrid: false, hour12: true, chartType: 'line', visibleDataPoints: 120, rsiPeriod: 7 });
  });
  it('builds overlays, the Bollinger shaded area, markers (all six kinds) and the custom panel', () => {
    const p = props({ sma: true, ema: true, vwap: true, bb: true, markers: true, customPanel: true });
    expect(p.indicators!.map((i) => i.id)).toEqual(['sma', 'ema', 'vwap', 'bb-upper', 'bb-basis', 'bb-lower']);
    expect(p.shadedAreas).toHaveLength(1);
    expect(new Set(p.markers!.map((m) => m.kind)).size).toBe(6);
    expect(p.customPanels).toHaveLength(1);
  });
  it('period controls change the overlays', () => {
    const a = props({ sma: true, smaPeriod: 5 }).indicators![0].data.length;
    const b = props({ sma: true, smaPeriod: 50 }).indicators![0].data.length;
    expect(a).toBeGreaterThan(b);
  });
  it('custom theme builds a full palette from the six colours; presets pass through as names', () => {
    const t = props({ theme: 'custom', cBackground: '#000000', cUp: '#00ff00' }).theme as { background: string; candleUp: string };
    expect(t).toMatchObject({ background: '#000000', candleUp: '#00ff00' });
    expect(props({ theme: 'light' }).theme).toBe('light');
  });
  it('forces or auto-detects the interval, and applies maxZoom', () => {
    expect(props({ interval: 'auto' }).intervalMs).toBeUndefined();
    expect(props({ interval: '300000' }).intervalMs).toBe(300000);
    expect(props({ maxZoom: '50' }).maxZoom).toBe(50);
  });
  it('empty feed gives data=[]; volume off strips volume from the candles', () => {
    expect(props({ empty: true }).data).toEqual([]);
    expect(props({ withVolume: false }).data.every((c) => c.volume === undefined)).toBe(true);
  });
  it('sizes: fill / compact / tiny', () => {
    const avail = { width: 900, height: 600 };
    expect(labSize('fill', avail)).toEqual(avail);
    expect(labSize('compact', avail)).toEqual({ width: 560, height: 320 });
    expect(labSize('tiny', avail)).toEqual({ width: 220, height: 140 });
  });
});

describe('dirty data', () => {
  it('is genuinely dirty, and normalizeCandles recovers a clean, sorted, unique series', () => {
    const clean = createLab({ count: 100 }).getData();
    const dirty = makeDirty(clean);
    expect(dirty.length).toBeGreaterThan(clean.length);
    expect(dirty.some((c) => Number.isNaN(c.close))).toBe(true);
    const ts = dirty.map((c) => c.timestamp);
    expect(ts).not.toEqual([...ts].sort((a, b) => a - b));
    const fixed = normalizeCandles(dirty);
    expect(fixed.every((c) => Number.isFinite(c.close))).toBe(true);
    expect(new Set(fixed.map((c) => c.timestamp)).size).toBe(fixed.length);
  });
});

describe('model', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('notifies subscribers, keeps a stable chart-data identity until something changes', () => {
    const m = createLab({ count: 100 });
    const fn = vi.fn();
    m.subscribe(fn);
    const a = m.getChartData();
    expect(m.getChartData()).toBe(a);
    m.set('dirty', true);
    const b = m.getChartData();
    expect(b).not.toBe(a);
    expect(m.getChartData()).toBe(b);
    expect(fn).toHaveBeenCalled();
    m.dispose();
  });
  it('live feed ticks the forming candle and appends a new one every 5th tick, and stops when switched off', () => {
    const m = createLab({ count: 100 });
    m.set('live', '100');
    const n0 = m.getData().length;
    vi.advanceTimersByTime(400);
    expect(m.getData().length).toBe(n0);
    vi.advanceTimersByTime(100);
    expect(m.getData().length).toBe(n0 + 1);
    m.set('live', 'off');
    vi.advanceTimersByTime(2000);
    expect(m.getData().length).toBe(n0 + 1);
    m.dispose();
  });
  it('actions: +5K appends, regen changes the series, now bumps the trigger, reset restores defaults', () => {
    const m = createLab({ count: 100 });
    const first = m.getData()[0].close;
    m.act('bulk');
    expect(m.getData().length).toBe(5100);
    m.act('now');
    expect(m.getState().latest).toBeGreaterThan(0);
    m.act('regen');
    expect(m.getData()[0].close).not.toBe(first);
    m.set('rsi', true);
    m.act('reset');
    expect(m.getState()).toEqual(DEFAULT_LAB_STATE);
    expect(m.getData().length).toBe(DEFAULT_LAB_STATE.count);
    m.dispose();
  });
  it('+5K is capped so the stress button cannot run the page out of memory', () => {
    const m = createLab({ count: 50000 });
    for (let i = 0; i < 4; i++) m.act('bulk');
    expect(m.getData().length).toBeLessThanOrEqual(60000);
    m.dispose();
  });
  it('dependent controls only show while their feature is on', () => {
    const ids = (s: LabState) => visibleCapabilities(s).flatMap((g) => g.items.map((i) => i.id));
    expect(ids(DEFAULT_LAB_STATE)).not.toContain('smaPeriod');
    expect(ids({ ...DEFAULT_LAB_STATE, sma: true })).toContain('smaPeriod');
    expect(ids(DEFAULT_LAB_STATE)).not.toContain('cBackground');
    expect(ids({ ...DEFAULT_LAB_STATE, theme: 'custom' })).toContain('cBackground');
  });
});
