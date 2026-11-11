// @vitest-environment jsdom
import './testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calcMACD, normalizeCandles } from '@stacklatte/chart-engine';
import { SCENARIOS, type Scenario } from './scenarios';

import { ChartController } from '@stacklatte/chart-engine/canvas';
import { installCanvasMock, type MockContext2D } from './testing/canvasMock';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

let contexts: MockContext2D[];
let host: HTMLDivElement;
let controller: ChartController | undefined;

beforeEach(() => {
  contexts = installCanvasMock();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400, toJSON() {},
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

const mount = (s: Scenario, extra: Record<string, unknown> = {}) => {
  const data = s.data();
  controller = new ChartController(host, { data, width: 600, height: s.height, ...s.props(data), ...extra });
  return controller;
};

const expectedCanvases = (s: Scenario) => {
  const p = s.props(s.data());
  const data = s.data();
  if (data.length === 0) return 0; // "No data" text box, no canvases
  // The MACD panel is omitted while there is too little data for MACD(12,26,9) to exist (same as the React renderer).
  const macdShown = !!p.showMacdPanel && calcMACD(normalizeCandles(data)) !== null;
  return 1 + [p.showVolumePanel, p.showRsiPanel, macdShown].filter(Boolean).length + (p.customPanels?.length ?? 0);
};

describe.each(SCENARIOS.map((s) => [s.id, s] as const))('scenario %s', (_id, s) => {
  it('mounts and draws without throwing', async () => {
    mount(s);
    await frame();
    expect(host.querySelectorAll('canvas')).toHaveLength(expectedCanvases(s));
    if (expectedCanvases(s) > 0) expect(contexts.length).toBeGreaterThan(0);
  });

  it('survives wheel zoom, drag pan, hover and pinch-like gestures', async () => {
    mount(s);
    await frame();
    const canvas = host.querySelector('canvas');
    if (!canvas) return; // "No data" text box: nothing to interact with
    const ptr = (type: string, x: number, id = 1, extra: PointerEventInit = {}) =>
      canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: 100, pointerId: id, pointerType: 'mouse', bubbles: true, ...extra }));

    for (const dy of [-800, 800, -5000, 5000, 0, 1e9, -1e9]) {
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, clientX: 300, bubbles: true, cancelable: true }));
    }
    ptr('pointerdown', 100); ptr('pointermove', 500); ptr('pointermove', -2000); ptr('pointermove', 9000); ptr('pointerup', 9000);
    ptr('pointermove', 250, 1, { buttons: 0 }); ptr('pointerleave', 0);
    // two-finger pinch
    ptr('pointerdown', 200, 1, { pointerType: 'touch' }); ptr('pointerdown', 400, 2, { pointerType: 'touch' });
    ptr('pointermove', 100, 1, { pointerType: 'touch' }); ptr('pointermove', 500, 2, { pointerType: 'touch' });
    ptr('pointerup', 100, 1, { pointerType: 'touch' }); ptr('pointerup', 500, 2, { pointerType: 'touch' });
    await frame();
    expect(host.querySelectorAll('canvas').length).toBeGreaterThan(0);
  });

  it('survives resizing and toggling every panel', async () => {
    const c = mount(s);
    await frame();
    const data = s.data();
    for (const [w, h] of [[300, 200], [1200, 900], [50, 50], [600, s.height]] as const) {
      c.update({ data, width: w, height: h, ...s.props(data), showRsiPanel: true, showMacdPanel: true, showVolumePanel: true });
      await frame();
    }
    c.update({ data, width: 600, height: s.height, ...s.props(data), showRsiPanel: false, showMacdPanel: false, showVolumePanel: false });
    await frame();
    expect(host.querySelectorAll('canvas')).toHaveLength(data.length ? 1 + (s.props(data).customPanels?.length ?? 0) : 0);
  });

  if (s.live) {
    it('keeps up with 100 live ticks', async () => {
      const c = mount(s);
      let data = s.data();
      for (let tick = 1; tick <= 100; tick++) {
        data = s.live!.next(data, tick);
        c.update({ data, width: 600, height: s.height, ...s.props(data) });
      }
      await frame();
      expect(host.querySelectorAll('canvas').length).toBeGreaterThan(0);
    });
  }

  if (s.budget) {
    it(`mounts within its budget (${s.budget.mountMs} ms)`, async () => {
      const t0 = performance.now();
      mount(s);
      await frame();
      expect(performance.now() - t0).toBeLessThan(s.budget!.mountMs * 4); // jsdom + mock canvas, so generous
    });
  }
});

describe('marker scenarios actually draw their markers', () => {
  it.each([['markers', 1], ['edge-unsorted-markers', 6]] as const)('%s reports >= %i visible markers', async (id, min) => {
    const s = SCENARIOS.find((x) => x.id === id)!;
    mount(s);
    await frame();
    expect(controller!.getVisibleMarkers().length).toBeGreaterThanOrEqual(min);
    if (id === 'edge-unsorted-markers') expect(controller!.getVisibleMarkers()).toHaveLength(6); // the off-screen one is excluded
  });
});

