import { calcEMA } from '@stacklatte/chart-core/core';
import type { Candle } from '@stacklatte/chart-core/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SLChart from './ChartCanvas';
import { createMockContext, installCanvasMock, type MockContext2D } from './testUtils/canvasMock';

function makeCandles(n: number): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = price + (i % 5 === 0 ? -1 : 1) * (1 + (i % 3));
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    candles.push({ timestamp: 1_700_000_000_000 + i * 60_000, open, high, low, close });
    price = close;
  }
  return candles;
}

let contexts: MockContext2D[];

beforeEach(() => {
  contexts = installCanvasMock();
  // jsdom doesn't implement layout, so give every canvas a deterministic
  // bounding rect for the pointer-event coordinate math in the gesture tests.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, toJSON() {},
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SLChart (web)', () => {
  it('renders a "No data" placeholder when given no candles', () => {
    render(<SLChart data={[]} width={400} height={300} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('draws candles on a single main canvas by default', () => {
    const candles = makeCandles(30);
    const { container } = render(<SLChart data={candles} width={400} height={300} />);

    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBe(1);

    const ctx = contexts[contexts.length - 1];
    expect(ctx.fillRect).toHaveBeenCalled(); // candle bodies
    expect(ctx.stroke).toHaveBeenCalled(); // wicks / axis grid
    expect(ctx.fillText).toHaveBeenCalled(); // axis labels
  });

  it('draws a smooth line instead of candles when chartType="line"', () => {
    const candles = makeCandles(30);
    render(<SLChart data={candles} width={400} height={300} chartType="line" />);

    const ctx = contexts[contexts.length - 1];
    expect(ctx.bezierCurveTo).toHaveBeenCalled();
  });

  it('renders extra canvases for RSI and MACD panels', () => {
    const candles = makeCandles(60);
    const { container } = render(
      <SLChart data={candles} width={400} height={600} showRsiPanel showMacdPanel />,
    );

    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBe(3);
  });

  it('draws indicator overlays and shaded areas without throwing', () => {
    const candles = makeCandles(40);
    const ema9 = calcEMA(candles, 9, 'ema-9', '#4a90e2');
    const ema21 = calcEMA(candles, 21, 'ema-21', '#50e3c2');
    expect(ema9).not.toBeNull();
    expect(ema21).not.toBeNull();

    expect(() =>
      render(
        <SLChart
          data={candles}
          width={400}
          height={300}
          indicators={[ema9!, ema21!]}
          shadedAreas={[{ fromId: 'ema-9', toId: 'ema-21', color: '#888', opacity: 0.2 }]}
        />,
      ),
    ).not.toThrow();
  });

  it('shows the OHLC HUD and locks the crosshair to the pointed candle on drag', () => {
    const candles = makeCandles(30);
    const onCrosshairChange = vi.fn();
    const { container } = render(
      <SLChart data={candles} width={400} height={300} showOhlcHud onCrosshairChange={onCrosshairChange} />,
    );

    // Live HUD shows the latest candle before any interaction.
    expect(screen.getByText('LIVE')).toBeInTheDocument();

    const canvas = container.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 150, pointerId: 1 });

    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    expect(onCrosshairChange).toHaveBeenCalled();
    const lastCandle = onCrosshairChange.mock.calls.at(-1)?.[0];
    expect(lastCandle).not.toBeNull();

    fireEvent.pointerUp(canvas, { clientX: 40, clientY: 150, pointerId: 1 });
  });

  it('pans the viewport on pointer drag without throwing', () => {
    const candles = makeCandles(200);
    const { container } = render(<SLChart data={candles} width={400} height={300} visibleDataPoints={60} />);
    const canvas = container.querySelector('canvas')!;

    expect(() => {
      fireEvent.pointerDown(canvas, { clientX: 300, clientY: 150, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 100, clientY: 150, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 100, clientY: 150, pointerId: 1 });
    }).not.toThrow();
  });

  it('zooms on wheel without throwing', () => {
    const candles = makeCandles(200);
    const { container } = render(<SLChart data={candles} width={400} height={300} visibleDataPoints={60} />);
    const canvas = container.querySelector('canvas')!;

    expect(() => {
      fireEvent.wheel(canvas, { deltaY: -100, clientX: 200, clientY: 150 });
    }).not.toThrow();
  });
});

describe('canvasMock harness', () => {
  it('creates independent mock contexts per call', () => {
    const a = createMockContext();
    const b = createMockContext();
    a.fillRect(1, 2, 3, 4);
    expect(a.fillRect).toHaveBeenCalledTimes(1);
    expect(b.fillRect).not.toHaveBeenCalled();
  });
});
