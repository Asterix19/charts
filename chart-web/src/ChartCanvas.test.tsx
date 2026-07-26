import { buildPaddedRange, calcEMA, computeLayout, getCandleX, getY } from '@stacklatte/chart-core/core';
import type { Candle, ChartMarker } from '@stacklatte/chart-core/core';
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

  it('renders an extra canvas for the volume panel and draws one bar per visible candle', () => {
    const candles = makeCandles(30).map((c) => ({ ...c, volume: 1000 }));
    const { container } = render(
      <SLChart data={candles} width={400} height={600} showVolumePanel />,
    );

    const canvases = container.querySelectorAll('canvas');
    expect(canvases.length).toBe(2);

    const ctx = contexts[contexts.length - 1];
    expect(ctx.fillRect).toHaveBeenCalledTimes(candles.length);
  });

  it('renders 4 canvases when RSI, MACD, and volume panels are all shown together', () => {
    const candles = makeCandles(60).map((c) => ({ ...c, volume: 1000 }));
    const { container } = render(
      <SLChart data={candles} width={400} height={900} showRsiPanel showMacdPanel showVolumePanel />,
    );

    expect(container.querySelectorAll('canvas').length).toBe(4);
  });

  it('draws trade markers without throwing', () => {
    const candles = makeCandles(30);
    expect(() =>
      render(
        <SLChart
          data={candles}
          width={400}
          height={300}
          markers={[
            { timestamp: candles[5].timestamp, price: candles[5].low - 1, kind: 'entry-long' },
            { timestamp: candles[10].timestamp, price: candles[10].high + 1, kind: 'exit-long', label: 'exit' },
            { timestamp: candles[15].timestamp, price: candles[15].close, kind: 'stop-loss' },
            { timestamp: candles[20].timestamp, price: candles[20].close, kind: 'take-profit' },
          ]}
        />,
      ),
    ).not.toThrow();

    const ctx = contexts[contexts.length - 1];
    expect(ctx.fill).toHaveBeenCalled(); // triangle/dot markers
    expect(ctx.stroke).toHaveBeenCalled(); // x marker + wicks/axis grid
  });

  it('draws exactly one dot per take-profit marker (arc is unique to the dot shape)', () => {
    const candles = makeCandles(30);
    render(
      <SLChart
        data={candles}
        width={400}
        height={300}
        markers={[
          { timestamp: candles[5].timestamp, price: candles[5].close, kind: 'take-profit' },
          { timestamp: candles[10].timestamp, price: candles[10].close, kind: 'take-profit' },
        ]}
      />,
    );

    const ctx = contexts[contexts.length - 1];
    expect(ctx.arc).toHaveBeenCalledTimes(2);
  });

  it('clips markers whose timestamp falls outside the visible window', () => {
    const candles = makeCandles(60);
    // visibleDataPoints=30 keeps only the most recent 30 candles on screen.
    render(
      <SLChart
        data={candles}
        width={400}
        height={300}
        visibleDataPoints={30}
        markers={[
          { timestamp: candles[0].timestamp, price: candles[0].close, kind: 'take-profit' }, // out of view
          { timestamp: candles[59].timestamp, price: candles[59].close, kind: 'take-profit' }, // in view
        ]}
      />,
    );

    const ctx = contexts[contexts.length - 1];
    expect(ctx.arc).toHaveBeenCalledTimes(1);
  });

  it('does not draw any marker shape when a marker timestamp matches no candle', () => {
    const candles = makeCandles(30);
    render(
      <SLChart
        data={candles}
        width={400}
        height={300}
        markers={[{ timestamp: 999_999_999, price: candles[5].close, kind: 'take-profit' }]}
      />,
    );

    const ctx = contexts[contexts.length - 1];
    expect(ctx.arc).not.toHaveBeenCalled();
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

  // ── Marker hover tooltip ──────────────────────────────────────────────
  // All 30 candles fit on screen at width=400 (visibleDataPoints defaults to
  // 60), so viewport = {start:0, end:30} exactly and fractionalOffsetX is 0 —
  // this lets the test derive the marker's exact on-screen pixel position
  // with the library's own geometry functions instead of guessing coordinates.

  function markerScreenPos(candles: Candle[], candleIndex: number, price: number) {
    const layout = computeLayout(400, 300, false, false, false);
    const values = candles.flatMap((c) => [c.high, c.low]);
    const range = buildPaddedRange(Math.min(...values), Math.max(...values), 0.05);
    return {
      clientX: layout.padding.left + getCandleX(candleIndex, candles.length, layout.chartWidth),
      clientY: layout.padding.top + getY(price, range.min, range.max, layout.mainChartHeight),
    };
  }

  it('shows a tooltip with the label, price, and time when hovering a marker, and hides it when the pointer leaves', () => {
    const candles = makeCandles(30);
    const marker: ChartMarker = {
      timestamp: candles[5].timestamp, price: candles[5].close, kind: 'stop-loss', label: 'Stopped out',
    };
    const { container } = render(<SLChart data={candles} width={400} height={300} markers={[marker]} />);
    const canvas = container.querySelector('canvas')!;
    const { clientX, clientY } = markerScreenPos(candles, 5, marker.price);

    expect(screen.queryByText('Stopped out')).not.toBeInTheDocument();

    fireEvent.pointerMove(canvas, { clientX, clientY, pointerId: 1, pointerType: 'mouse', buttons: 0 });

    expect(screen.getByText('Stopped out')).toBeInTheDocument();
    expect(screen.getByText(marker.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))).toBeInTheDocument();

    fireEvent.pointerLeave(canvas, { clientX, clientY, pointerId: 1, pointerType: 'mouse' });

    expect(screen.queryByText('Stopped out')).not.toBeInTheDocument();
  });

  it('falls back to a kind-derived heading and shows changePct when the marker has no label', () => {
    const candles = makeCandles(30);
    const marker: ChartMarker = {
      timestamp: candles[10].timestamp, price: candles[10].close, kind: 'exit-long', changePct: -3.25,
    };
    const { container } = render(<SLChart data={candles} width={400} height={300} markers={[marker]} />);
    const canvas = container.querySelector('canvas')!;
    const { clientX, clientY } = markerScreenPos(candles, 10, marker.price);

    fireEvent.pointerMove(canvas, { clientX, clientY, pointerId: 1, pointerType: 'mouse', buttons: 0 });

    expect(screen.getByText('Exit (long)')).toBeInTheDocument();
    expect(screen.getByText('-3.25%')).toBeInTheDocument();
  });

  it('does not show a tooltip when hovering away from every marker', () => {
    const candles = makeCandles(30);
    const marker: ChartMarker = { timestamp: candles[5].timestamp, price: candles[5].close, kind: 'take-profit', label: 'TP hit' };
    const { container } = render(<SLChart data={candles} width={400} height={300} markers={[marker]} />);
    const canvas = container.querySelector('canvas')!;

    fireEvent.pointerMove(canvas, { clientX: 5, clientY: 5, pointerId: 1, pointerType: 'mouse', buttons: 0 });

    expect(screen.queryByText('TP hit')).not.toBeInTheDocument();
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
