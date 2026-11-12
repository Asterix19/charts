import { act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calcMACD, normalizeCandles } from '@stacklatte/chart-engine';
import { SCENARIOS, type Scenario } from '@stacklatte/chart-examples';

import SLChart from './ChartCanvas';
import { installCanvasMock } from './testUtils/canvasMock';

const nextFrame = () => act(() => new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); }));

beforeEach(() => {
  installCanvasMock();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400, toJSON() {},
  });
});
afterEach(() => vi.restoreAllMocks());

const propsOf = (s: Scenario, data = s.data()) => ({ data, width: 600, height: s.height, ...s.props(data) });

const expectedCanvases = (s: Scenario) => {
  const data = s.data();
  const p = s.props(data);
  if (data.length === 0) return 0; // "No data" placeholder, no canvas
  const macdShown = !!p.showMacdPanel && calcMACD(normalizeCandles(data)) !== null;
  return 1 + [p.showVolumePanel, p.showRsiPanel, macdShown].filter(Boolean).length + (p.customPanels?.length ?? 0);
};

describe.each(SCENARIOS.map((s) => [s.id, s] as const))('React scenario %s', (_id, s) => {
  it('renders without throwing and with the expected canvases', () => {
    const { container } = render(<SLChart {...propsOf(s)} />);
    expect(container.querySelectorAll('canvas')).toHaveLength(expectedCanvases(s));
  });

  it('survives hostile gestures', async () => {
    const { container } = render(<SLChart {...propsOf(s)} />);
    const canvas = container.querySelector('canvas');
    if (!canvas) return; // "No data" placeholder
    for (const dy of [-800, 800, -5000, 5000, 0, 1e9, -1e9]) fireEvent.wheel(canvas, { deltaY: dy, clientX: 300 });
    for (const x of [100, 500, -2000, 9000]) fireEvent.pointerMove(canvas, { clientX: x, clientY: 100, pointerId: 1, pointerType: 'mouse', buttons: 0 });
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 500, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: -2000, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 500, pointerId: 1 });
    fireEvent.pointerDown(canvas, { clientX: 200, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(canvas, { clientX: 400, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(canvas, { clientX: 100, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(canvas, { clientX: 500, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerLeave(canvas, { pointerType: 'mouse' });
    await nextFrame();
    expect(container.querySelectorAll('canvas').length).toBeGreaterThan(0);
  });

  it('survives resizing and toggling every panel', () => {
    const { rerender, container } = render(<SLChart {...propsOf(s)} />);
    for (const [w, h] of [[300, 200], [1200, 900], [50, 50], [600, s.height]] as const) {
      rerender(<SLChart {...propsOf(s)} width={w} height={h} showRsiPanel showMacdPanel showVolumePanel />);
    }
    rerender(<SLChart {...propsOf(s)} showRsiPanel={false} showMacdPanel={false} showVolumePanel={false} />);
    expect(container).toBeTruthy();
  });

  if (s.live) {
    it('keeps up with 100 live ticks', () => {
      const { rerender, container } = render(<SLChart {...propsOf(s)} />);
      let data = s.data();
      for (let tick = 1; tick <= 100; tick++) {
        data = s.live!.next(data, tick);
        rerender(<SLChart {...propsOf(s, data)} />);
      }
      expect(container.querySelectorAll('canvas').length).toBeGreaterThan(0);
    });
  }
});
