import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMarkerPoints, buildPaddedRange, buildTimestampIndex, computeLayout, type Candle } from '@stacklatte/chart-engine';

import { SlChartComponent } from './sl-chart.component';
import { installCanvasMock, type MockContext2D } from './testing/canvasMock';

function makeCandles(count: number): Candle[] {
  let price = 100;
  return Array.from({ length: count }, (_, i) => {
    const open = price;
    const close = price + (i % 5 === 0 ? -1 : 1) * (1 + (i % 3));
    price = close;
    return { timestamp: 1_700_000_000_000 + i * 60_000, open, close, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, volume: 500 };
  });
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

let contexts: MockContext2D[];

beforeEach(() => {
  contexts = installCanvasMock();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, toJSON() {},
  });
});

afterEach(() => vi.restoreAllMocks());

async function create(inputs: Record<string, unknown> = {}): Promise<ComponentFixture<SlChartComponent>> {
  const fixture = TestBed.createComponent(SlChartComponent);
  const all = { data: makeCandles(60), width: 400, height: 300, ...inputs };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  await fixture.whenStable();
  await frame();
  return fixture;
}

const canvases = (f: ComponentFixture<SlChartComponent>) => f.nativeElement.querySelectorAll('canvas') as NodeListOf<HTMLCanvasElement>;

describe('<sl-chart>', () => {
  it('mounts a canvas after first render and draws candles', async () => {
    const fixture = await create();
    expect(canvases(fixture)).toHaveLength(1);
    expect(contexts.at(-1)!.fillRect).toHaveBeenCalled();
  });

  it('sizes its host from the width/height inputs', async () => {
    const fixture = await create({ width: 500, height: 320 });
    const host = fixture.nativeElement.querySelector('.sl-chart-host') as HTMLElement;
    expect(host.style.width).toBe('500px');
    expect(host.style.height).toBe('320px');
  });

  it('adds sub-panel canvases when inputs turn them on', async () => {
    const fixture = await create({ height: 500 });
    expect(canvases(fixture)).toHaveLength(1);
    fixture.componentRef.setInput('showVolumePanel', true);
    fixture.componentRef.setInput('showRsiPanel', true);
    fixture.detectChanges();
    await frame();
    expect(canvases(fixture)).toHaveLength(3);
  });

  it('repaints when the data input changes', async () => {
    const fixture = await create();
    const before = (HTMLCanvasElement.prototype.getContext as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    fixture.componentRef.setInput('data', makeCandles(61));
    fixture.detectChanges();
    await frame();
    expect((HTMLCanvasElement.prototype.getContext as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(before);
  });

  it('emits crosshairChange; the HUD shows LIVE, then the inspected candle\'s time, then LIVE again', async () => {
    const fixture = await create({ showOhlcHud: true });
    const emitted: Array<Candle | null> = [];
    fixture.componentInstance.crosshairChange.subscribe((c) => emitted.push(c));
    await frame();
    expect(fixture.nativeElement.querySelector('[data-sl-layer="ohlc-hud"]')?.textContent).toContain('LIVE');

    const canvas = canvases(fixture)[0];
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 100, pointerId: 1, pointerType: 'mouse', buttons: 0, bubbles: true }));
    await frame();
    fixture.detectChanges();
    expect(emitted.at(-1)).toEqual(expect.objectContaining({ close: expect.any(Number) }));
    expect(fixture.nativeElement.querySelector('[data-sl-layer="ohlc-hud"]')?.textContent).not.toContain('LIVE');
    expect(fixture.nativeElement.querySelector('[data-sl-layer="ohlc-hud"]')?.textContent).toMatch(/\d{1,2}:\d{2}/);

    canvas.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
    await frame();
    fixture.detectChanges();
    expect(emitted.at(-1)).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-sl-layer="ohlc-hud"]')?.textContent).toContain('LIVE');
  });

  it('hides the HUD unless showOhlcHud is set', async () => {
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('[data-sl-layer="ohlc-hud"]')).toBeNull();
  });

  it('tears down its canvases and listeners on destroy', async () => {
    const fixture = await create();
    const canvas = canvases(fixture)[0];
    fixture.destroy();
    const event = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('is SSR-safe: renders nothing and does not touch the DOM canvas API on the server', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    const getContext = HTMLCanvasElement.prototype.getContext as unknown as { mockClear(): void; mock: { calls: unknown[] } };
    getContext.mockClear();
    const fixture = await create();
    expect(canvases(fixture)).toHaveLength(0);
    expect(getContext.mock.calls).toHaveLength(0);
  });

  it('shows the marker tooltip on hover (the controller feature, through the component)', async () => {
    const candles = makeCandles(60);
    const marker = { timestamp: candles[30].timestamp, price: candles[30].close, kind: 'entry-long' as const, label: 'Buy', changePct: 2.5 };
    const fixture = await create({ data: candles, markers: [marker], height: 300 });

    const layout = computeLayout(400, 300, false, false, false);
    const range = buildPaddedRange(Math.min(...candles.map((c) => c.low)), Math.max(...candles.map((c) => c.high)), 0.05);
    const [pt] = buildMarkerPoints([marker], buildTimestampIndex(candles), candles.length, layout.chartWidth, layout.mainChartHeight, range.min, range.max);

    canvases(fixture)[0].dispatchEvent(new PointerEvent('pointermove', {
      clientX: layout.padding.left + pt.x, clientY: layout.padding.top + pt.y, pointerId: 1, pointerType: 'mouse', buttons: 0, bubbles: true,
    }));
    await frame();
    const tip = fixture.nativeElement.querySelector('[data-sl-layer="marker-tooltip"]');
    expect(tip).not.toBeNull();
    expect(tip.textContent).toContain('Buy');
    expect(tip.textContent).toContain('+2.50%');
  });

  it('the HUD is the full one: change %, OHLC, volume and a row per indicator (same as React / React Native)', async () => {
    const candles = makeCandles(60);
    const ema = { id: 'ema9', name: 'EMA(9)', color: '#00ff00', data: candles.map((c) => ({ timestamp: c.timestamp, value: c.close })) };
    const fixture = await create({ data: candles, showOhlcHud: true, indicators: [ema] });
    const text = fixture.nativeElement.querySelector('[data-sl-layer="ohlc-hud"]')!.textContent as string;
    for (const needle of ['LIVE', '%', 'O', 'H', 'L', 'C', 'V', 'EMA']) expect(text, needle).toContain(needle);
    expect(fixture.nativeElement.querySelector('[data-sl-hud-grip]')).not.toBeNull(); // draggable
  });
});
