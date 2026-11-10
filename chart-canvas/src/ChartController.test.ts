import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '@stacklatte/chart-engine';

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

  it('shows "No data" instead of crashing when given no candles', async () => {
    mount({ data: [] });
    await frame();
    expect(contexts.at(-1)!.fillText).toHaveBeenCalledWith('No data', expect.any(Number), expect.any(Number));
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
