// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getThemeColors, calcEMA, calcRSI, calcSMA, buildMarkerPoints, buildPaddedRange, buildTimestampIndex, computeLayout, type Candle, type ChartMarker } from '../index';

import { ChartController } from './ChartController';
import { installCanvasMock, type MockContext2D } from './testUtils/canvasMock';

function makeCandles(count: number, volume = true): Candle[] {
  let price = 100;
  return Array.from({ length: count }, (_, i) => {
    const open = price;
    const close = price + (i % 5 === 0 ? -1 : 1) * (1 + (i % 3));
    price = close;
    return {
      timestamp: 1_700_000_000_000 + i * 60_000,
      open, close,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      ...(volume ? { volume: 1000 } : {}),
    };
  });
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

let contexts: MockContext2D[];
let host: HTMLDivElement;
let controller: ChartController | undefined;

beforeEach(() => {
  contexts = installCanvasMock();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, toJSON() {},
  });
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  host.remove();
  vi.restoreAllMocks();
});

const mount = (props: Partial<ConstructorParameters<typeof ChartController>[1]> = {}) => {
  controller = new ChartController(host, { data: makeCandles(60), width: 400, height: 300, ...props });
  return controller;
};

describe('ChartController', () => {
  it('draws candles, wicks and axis labels on a single main canvas', async () => {
    mount();
    await frame();
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    const ctx = contexts.at(-1)!;
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('shows a "No data" text box (no canvases) instead of crashing when given no candles, and recovers when data arrives', async () => {
    mount({ data: [] });
    await frame();
    expect(host.textContent).toContain('No data');
    expect(host.querySelectorAll('canvas')).toHaveLength(0);
    controller!.update({ data: makeCandles(30), width: 400, height: 300 });
    await frame();
    expect(host.textContent).not.toContain('No data');
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    controller!.update({ data: [], width: 400, height: 300 });
    await frame();
    expect(host.textContent).toContain('No data');
    expect(host.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('adds and removes sub-panel canvases as props change', async () => {
    const c = mount();
    await frame();
    expect(host.querySelectorAll('canvas')).toHaveLength(1);

    c.update({ data: makeCandles(60), width: 400, height: 500, showVolumePanel: true, showRsiPanel: true, showMacdPanel: true });
    await frame();
    expect(host.querySelectorAll('canvas')).toHaveLength(4);

    c.update({ data: makeCandles(60), width: 400, height: 500, showRsiPanel: true });
    await frame();
    expect(host.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('renders custom panels', async () => {
    const candles = makeCandles(60);
    mount({
      data: candles, height: 600,
      customPanels: [{ id: 'c', label: 'C', series: [{ id: 's', name: 'S', color: '#e07b39', data: candles.map((x) => ({ timestamp: x.timestamp, value: 0.5 })) }] }],
    });
    await frame();
    expect(host.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('coalesces repaints to at most one per animation frame', async () => {
    const c = mount();
    await frame();
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    for (let i = 0; i < 20; i++) c.update({ data: makeCandles(60 + (i % 2)), width: 400, height: 300 });
    expect(raf).toHaveBeenCalledTimes(1);
  });

  it('wheel zoom repaints with a different visible range', async () => {
    mount();
    await frame();
    const canvas = host.querySelector('canvas')!;
    const before = contexts.at(-1)!.fillRect.mock.calls.length;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, clientX: 200, clientY: 100, bubbles: true, cancelable: true }));
    await frame();
    const zoomedIn = contexts.at(-1)!.fillRect.mock.calls.length;
    expect(zoomedIn).toBeLessThan(before); // fewer, wider candles
  });

  it('wheel events are preventDefault-ed so the page does not scroll', async () => {
    mount();
    const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    host.querySelector('canvas')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('drag pans the viewport away from the live edge', async () => {
    mount({ visibleDataPoints: 30 });
    await frame();
    const canvas = host.querySelector('canvas')!;
    const firstTick = () => contexts.at(-1)!.fillText.mock.calls.map((c) => c[0]).join('|');
    const before = firstTick();
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, pointerId: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, pointerId: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, pointerId: 1, bubbles: true }));
    await frame();
    expect(firstTick()).not.toBe(before); // time-axis labels moved
  });

  it('reports the inspected candle through onCrosshairChange and clears on leave', async () => {
    const onCrosshairChange = vi.fn();
    mount({ showOhlcHud: true, onCrosshairChange });
    await frame();
    const canvas = host.querySelector('canvas')!;

    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 100, pointerId: 1, pointerType: 'mouse', buttons: 0, bubbles: true }));
    await frame();
    const candle = onCrosshairChange.mock.calls.at(-1)![0];
    expect(candle).toEqual(expect.objectContaining({ timestamp: expect.any(Number), close: expect.any(Number) }));

    canvas.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
    await frame();
    expect(onCrosshairChange.mock.calls.at(-1)![0]).toBeNull();
  });

  it('does not lock a crosshair when showOhlcHud is off', async () => {
    const onCrosshairChange = vi.fn();
    mount({ onCrosshairChange });
    await frame();
    host.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, pointerId: 1, pointerType: 'mouse', buttons: 0, bubbles: true }));
    await frame();
    expect(onCrosshairChange).not.toHaveBeenCalledWith(expect.objectContaining({ close: expect.any(Number) }));
  });

  it('follows the live edge when new candles arrive', async () => {
    const onCrosshairChange = vi.fn();
    const c = mount({ visibleDataPoints: 20, showOhlcHud: true, onCrosshairChange });
    await frame();

    const next = makeCandles(61);
    c.update({ data: next, width: 400, height: 300, visibleDataPoints: 20, showOhlcHud: true, onCrosshairChange });
    await frame();

    // Inspect the right-most slot: if the viewport followed, that is the NEW candle.
    host.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointermove', { clientX: 330, pointerId: 1, pointerType: 'mouse', buttons: 0, bubbles: true }));
    await frame();
    expect(onCrosshairChange.mock.calls.at(-1)![0].timestamp).toBe(next[60].timestamp);
  });

  it('does not chase new candles once the user has panned back in time', async () => {
    const onCrosshairChange = vi.fn();
    const props = { visibleDataPoints: 20, showOhlcHud: true, onCrosshairChange, width: 400, height: 300 };
    const c = mount(props);
    await frame();
    const canvas = host.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, pointerId: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, pointerId: 1, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, pointerId: 1, bubbles: true }));
    await frame();

    const next = makeCandles(63);
    c.update({ ...props, data: next });
    await frame();
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 330, pointerId: 1, pointerType: 'mouse', buttons: 0, bubbles: true }));
    await frame();
    const inspected = onCrosshairChange.mock.calls.at(-1)![0];
    expect(inspected.timestamp).toBeLessThan(next[59].timestamp); // still looking at history
  });

  it('destroy() removes its DOM, detaches listeners and cancels the pending frame', async () => {
    const c = mount();
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    c.update({ data: makeCandles(61), width: 400, height: 300 }); // schedules a frame
    const canvas = host.querySelector('canvas')!;
    c.destroy();
    expect(cancel).toHaveBeenCalled();
    expect(host.querySelectorAll('canvas')).toHaveLength(0);
    const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false); // listeners are gone
    controller = undefined;
  });
});

describe('ChartController — marker tooltip', () => {
  const candles = makeCandles(60);
  const marker = (patch: Partial<ChartMarker> = {}): ChartMarker => ({ timestamp: candles[30].timestamp, price: candles[30].close, kind: 'entry-long', label: 'Buy', ...patch });

  /** Client coordinates of a marker, derived with the same engine functions the controller uses. */
  const clientPosition = (m: ChartMarker) => {
    const layout = computeLayout(400, 300, false, false, false);
    const range = buildPaddedRange(Math.min(...candles.map((c) => c.low)), Math.max(...candles.map((c) => c.high)), 0.05);
    const [pt] = buildMarkerPoints([m], buildTimestampIndex(candles), candles.length, layout.chartWidth, layout.mainChartHeight, range.min, range.max);
    return { x: layout.padding.left + pt.x, y: layout.padding.top + pt.y };
  };

  const hover = (x: number, y: number) =>
    host.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', buttons: 0, bubbles: true }));
  const tooltip = () => host.querySelector('[data-sl-layer="marker-tooltip"]');

  it('shows the label, price and time when hovering a marker, and hides it when the pointer moves away', async () => {
    const m = marker();
    mount({ data: candles, markers: [m] });
    await frame();
    const pos = clientPosition(m);
    hover(pos.x, pos.y);
    await frame();
    expect(tooltip()).not.toBeNull();
    expect(tooltip()!.getAttribute('role')).toBe('tooltip');
    expect(tooltip()!.textContent).toContain('Buy');
    expect(tooltip()!.textContent).toContain('Price');
    expect(tooltip()!.textContent).toContain('Time');

    hover(5, 280);
    await frame();
    expect(tooltip()).toBeNull();
  });

  it('shows a signed change row coloured by direction', async () => {
    const m = marker({ kind: 'exit-long', label: 'Sell', changePct: -3.5 });
    mount({ data: candles, markers: [m] });
    await frame();
    const pos = clientPosition(m);
    hover(pos.x, pos.y);
    await frame();
    expect(tooltip()!.textContent).toContain('-3.50%');
  });

  it('falls back to a name derived from the marker kind when there is no label', async () => {
    const m = marker({ kind: 'stop-loss', label: undefined });
    mount({ data: candles, markers: [m] });
    await frame();
    const pos = clientPosition(m);
    hover(pos.x, pos.y);
    await frame();
    expect(tooltip()!.textContent).toMatch(/stop/i);
  });

  it('hides on pointerleave', async () => {
    const m = marker();
    mount({ data: candles, markers: [m] });
    await frame();
    const pos = clientPosition(m);
    hover(pos.x, pos.y);
    await frame();
    host.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
    await frame();
    expect(tooltip()).toBeNull();
  });

  it('treats a marker label as text, never as HTML', async () => {
    const m = marker({ label: '<img src=x onerror="window.__pwned = true">' });
    mount({ data: candles, markers: [m] });
    await frame();
    const pos = clientPosition(m);
    hover(pos.x, pos.y);
    await frame();
    expect(tooltip()!.querySelector('img')).toBeNull();
    expect(tooltip()!.textContent).toContain('<img src=x');
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('never creates a tooltip when there are no markers', async () => {
    mount({ data: candles });
    await frame();
    hover(200, 100);
    await frame();
    expect(tooltip()).toBeNull();
  });

  it('getVisibleMarkers() reports host-space positions that hit the tooltip', async () => {
    const m = marker();
    const c = mount({ data: candles, markers: [m, marker({ timestamp: candles[0].timestamp - 1e9 })] });
    await frame();
    const [only, ...rest] = c.getVisibleMarkers();
    expect(rest).toEqual([]); // the off-window marker is not reported
    expect(only.kind).toBe('entry-long');
    const expected = clientPosition(m);
    expect(only.x).toBeCloseTo(expected.x, 5);
    expect(only.y).toBeCloseTo(expected.y, 5);
  });

  it('is removed with the chart on destroy()', async () => {
    const m = marker();
    const c = mount({ data: candles, markers: [m] });
    await frame();
    const pos = clientPosition(m);
    hover(pos.x, pos.y);
    await frame();
    c.destroy();
    expect(host.querySelector('[data-sl-layer="marker-tooltip"]')).toBeNull();
    controller = undefined;
  });
});

describe('ChartController — display options', () => {
  const texts = () => contexts.flatMap((c) => c.fillText.mock.calls.map((x) => String(x[0])));
  const count = (fn: keyof MockContext2D) => contexts.reduce((n, c) => n + (c[fn] as unknown as { mock: { calls: unknown[] } }).mock.calls.length, 0);

  it('hour12 switches the time axis to AM/PM labels (and 24-hour is the default)', async () => {
    const twelve = mount({ data: makeCandles(60), hour12: true });
    await frame();
    expect(texts().some((t) => /\b(AM|PM)\b/i.test(t)), 'hour12=true shows AM/PM').toBe(true);
    twelve.destroy(); controller = undefined; host.innerHTML = '';

    contexts.length = 0;
    mount({ data: makeCandles(60) });
    await frame();
    expect(texts().some((t) => /\b(AM|PM)\b/i.test(t)), 'default has no AM/PM').toBe(false);
  });

  it('showGrid={false} draws fewer dashed grid lines than the default but keeps the axis labels', async () => {
    mount({ data: makeCandles(60) });
    await frame();
    const withGrid = count('setLineDash');
    const labelsWith = texts().length;
    controller!.destroy(); controller = undefined; host.innerHTML = ''; contexts.length = 0;

    mount({ data: makeCandles(60), showGrid: false });
    await frame();
    expect(count('setLineDash')).toBeLessThan(withGrid);
    expect(texts().length, 'axis labels are always shown').toBe(labelsWith);
  });

  it('maxZoom caps how many candles can be on screen, however far the user zooms out', async () => {
    mount({ data: makeCandles(300), visibleDataPoints: 300, maxZoom: 40 });
    await frame();
    const canvas = host.querySelector('canvas')!;
    for (let i = 0; i < 10; i++) canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 800, clientX: 200, bubbles: true, cancelable: true }));
    await frame();
    const capped = contexts.at(-1)!.fillRect.mock.calls.length;
    controller!.destroy(); controller = undefined; host.innerHTML = ''; contexts.length = 0;

    mount({ data: makeCandles(300), visibleDataPoints: 300 });
    await frame();
    const free = contexts.at(-1)!.fillRect.mock.calls.length;
    expect(capped).toBeLessThan(free / 2);
    expect(capped).toBeLessThanOrEqual(60); // 40 bodies + slack for the axis/HUD rectangles
  });

  it('a valid non-default rsiPeriod changes the RSI panel; an invalid one leaves it empty rather than crashing', async () => {
    const lineTos = () => contexts.flatMap((c) => c.bezierCurveTo.mock.calls.map((x) => x.join(','))).join('|');
    mount({ data: makeCandles(120), showRsiPanel: true, rsiPeriod: 14 });
    await frame();
    const p14 = lineTos();
    controller!.destroy(); controller = undefined; host.innerHTML = ''; contexts.length = 0;

    mount({ data: makeCandles(120), showRsiPanel: true, rsiPeriod: 7 });
    await frame();
    expect(lineTos()).not.toBe(p14);
    controller!.destroy(); controller = undefined; host.innerHTML = ''; contexts.length = 0;

    expect(() => mount({ data: makeCandles(120), showRsiPanel: true, rsiPeriod: 0 })).not.toThrow();
  });

  it('scrollToLatestTrigger returns a panned-away chart to the newest candle', async () => {
    const onCrosshairChange = vi.fn();
    const c = mount({ data: makeCandles(300), visibleDataPoints: 40, showOhlcHud: true, onCrosshairChange });
    await frame();
    const canvas = host.querySelector('canvas')!;
    const newest = () => {
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 330, pointerId: 1, pointerType: 'mouse', buttons: 0, bubbles: true }));
      return frame().then(() => onCrosshairChange.mock.calls.at(-1)![0].timestamp as number);
    };
    const atEnd = await newest();
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, pointerId: 2, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 350, pointerId: 2, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 350, pointerId: 2, bubbles: true }));
    await frame();
    expect(await newest()).toBeLessThan(atEnd); // panned back in time

    c.update({ data: makeCandles(300), width: 400, height: 300, visibleDataPoints: 40, showOhlcHud: true, onCrosshairChange, scrollToLatestTrigger: 1 });
    await frame();
    expect(await newest()).toBe(atEnd);
  });
});

describe('ChartController — OHLC + indicator HUD (parity with the React / React Native HUD)', () => {
  const candles = makeCandles(80);
  const hud = () => host.querySelector('[data-sl-layer="ohlc-hud"]') as HTMLElement | null;
  const rows = () => [...hud()!.querySelectorAll(':scope > div:nth-child(2) > div')].map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
  const hover = (x: number) =>
    host.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: 100, pointerId: 1, pointerType: 'mouse', buttons: 0, bubbles: true }));
  const price = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  it('is absent unless showOhlcHud is set', async () => {
    mount({ data: candles });
    await frame();
    expect(hud()).toBeNull();
  });

  it('shows LIVE, the change % and the latest candle\'s O/H/L/C and volume when nothing is inspected', async () => {
    mount({ data: candles, showOhlcHud: true });
    await frame();
    const last = candles[candles.length - 1];
    expect(hud()!.textContent).toContain('LIVE');
    const pct = (((last.close - last.open) / last.open) * 100);
    expect(hud()!.textContent).toContain(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
    expect(rows()).toEqual(expect.arrayContaining([`O${price(last.open)}`, `H${price(last.high)}`, `L${price(last.low)}`, `C${price(last.close)}`, 'V1.00K']));
  });

  it('switches to the inspected candle (time instead of LIVE) while hovering, and back on leave', async () => {
    mount({ data: candles, showOhlcHud: true });
    await frame();
    hover(200);
    await frame();
    expect(hud()!.textContent).not.toContain('LIVE');
    expect(hud()!.textContent).toMatch(/\d{1,2}:\d{2}/);
    host.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
    await frame();
    expect(hud()!.textContent).toContain('LIVE');
  });

  it('has one row per indicator, with the value AT the shown candle', async () => {
    const ema = calcEMA(candles, 9, 'ema9', '#00ff00')!;
    const sma = calcSMA(candles, 20, 'sma20', '#ff00ff')!;
    mount({ data: candles, showOhlcHud: true, indicators: [ema, sma] });
    await frame();
    const last = candles[candles.length - 1].timestamp;
    const at = (line: typeof ema) => line.data.find((p) => p.timestamp === last)!.value.toFixed(2);
    expect(rows().some((r) => r.endsWith(at(ema)) && r.startsWith('EMA'))).toBe(true);
    expect(rows().some((r) => r.endsWith(at(sma)) && r.startsWith('SMA'))).toBe(true);
    // the dot beside each value uses the indicator's colour
    const dots = [...hud()!.querySelectorAll('span')].filter((d) => d.style.borderRadius === '3px').map((d) => d.style.background);
    expect(dots.join('|')).toMatch(/rgb\(0, 255, 0\)/);
    expect(dots.join('|')).toMatch(/rgb\(255, 0, 255\)/);
  });

  it('shows the RSI row only while inspecting, with the RSI at the inspected candle', async () => {
    mount({ data: candles, showOhlcHud: true, showRsiPanel: true });
    await frame();
    expect(rows().some((r) => r.startsWith('RSI'))).toBe(false); // live: no RSI row (same as React)
    hover(250);
    await frame();
    expect(rows().some((r) => r.startsWith('RSI'))).toBe(true);
    const shown = Number(rows().find((r) => r.startsWith('RSI'))!.replace('RSI', ''));
    // the renderer runs RSI over a window that starts one period before the visible range (80 candles, 60 visible → from index 6)
    expect(calcRSI(candles.slice(6), 14).some((p) => Math.abs(p.value - shown) < 0.06)).toBe(true);
  });

  it('shows one row per custom-panel series while inspecting', async () => {
    const series = [{ id: 'corr', name: 'Correlation', color: '#abcdef', data: candles.map((c) => ({ timestamp: c.timestamp, value: 0.42 })) }];
    mount({ data: candles, showOhlcHud: true, customPanels: [{ id: 'p', label: 'Panel', series }], height: 500 });
    await frame();
    expect(rows().some((r) => r.endsWith('0.42'))).toBe(false);
    hover(200);
    await frame();
    expect(rows().some((r) => r.endsWith('0.42'))).toBe(true);
  });

  it('can be dragged by its grip, without panning the chart', async () => {
    mount({ data: candles, showOhlcHud: true, visibleDataPoints: 30 });
    await frame();
    const grip = hud()!.querySelector('[data-sl-hud-grip]') as HTMLElement;
    const before = { top: hud()!.style.top, left: hud()!.style.left };
    const canvasDraws = () => contexts.length;
    const drawsBefore = canvasDraws();
    grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, pointerId: 5, bubbles: true }));
    grip.dispatchEvent(new PointerEvent('pointermove', { clientX: 70, clientY: 50, pointerId: 5, bubbles: true }));
    grip.dispatchEvent(new PointerEvent('pointerup', { clientX: 70, clientY: 50, pointerId: 5, bubbles: true }));
    expect(hud()!.style.left).toBe('66px'); // 6 + 60
    expect(hud()!.style.top).toBe('46px'); // 6 + 40
    expect(`${before.top}/${before.left}`).toBe('6px/6px');
    await frame();
    expect(canvasDraws()).toBe(drawsBefore); // dragging the HUD did not pan/repaint the chart
  });

  it('keeps its dragged position across repaints and data updates', async () => {
    const c = mount({ data: candles, showOhlcHud: true });
    await frame();
    const grip = hud()!.querySelector('[data-sl-hud-grip]') as HTMLElement;
    grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, pointerId: 6, bubbles: true }));
    grip.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, clientY: 30, pointerId: 6, bubbles: true }));
    grip.dispatchEvent(new PointerEvent('pointerup', { clientX: 30, clientY: 30, pointerId: 6, bubbles: true }));
    c.update({ data: makeCandles(81), width: 400, height: 300, showOhlcHud: true });
    await frame();
    expect(hud()!.style.left).toBe('36px');
  });

  it('renders caller-supplied indicator names as text, never as HTML', async () => {
    const ema = { ...calcEMA(candles, 9, 'e', '#fff')!, name: '<img src=x onerror="window.__hudPwned = true">' };
    mount({ data: candles, showOhlcHud: true, indicators: [ema] });
    await frame();
    expect(hud()!.querySelector('img')).toBeNull();
    expect((window as unknown as { __hudPwned?: boolean }).__hudPwned).toBeUndefined();
  });

  it('is removed when showOhlcHud is turned off, and on destroy()', async () => {
    const c = mount({ data: candles, showOhlcHud: true });
    await frame();
    expect(hud()).not.toBeNull();
    c.update({ data: candles, width: 400, height: 300, showOhlcHud: false });
    await frame();
    expect(hud()).toBeNull();
    c.update({ data: candles, width: 400, height: 300, showOhlcHud: true });
    await frame();
    c.destroy();
    expect(host.querySelector('[data-sl-layer="ohlc-hud"]')).toBeNull();
    controller = undefined;
  });

  it('uses the theme colours (custom palette)', async () => {
    mount({ data: candles, showOhlcHud: true, theme: { ...getThemeColors('dark'), hudBackground: '#123456', candleUp: '#00ff00', candleDown: '#00ff00' } });
    await frame();
    expect(hud()!.style.background).toMatch(/rgb\(18, 52, 86\)|#123456/);
  });
});

