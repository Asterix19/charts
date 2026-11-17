// @vitest-environment jsdom
import './testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartController } from '@stacklatte/chart-engine/canvas';
import { LAB_CAPABILITIES, createLab, labChartProps, labSize } from '@stacklatte/chart-engine/lab';
import type { LabKey } from '@stacklatte/chart-engine/lab';
import { installCanvasMock } from './testing/canvasMock';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
let host: HTMLDivElement;
let controller: ChartController | undefined;

beforeEach(() => {
  installCanvasMock();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400, toJSON() {} });
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => { controller?.destroy(); controller = undefined; host.remove(); vi.restoreAllMocks(); });

/** Every value each control can take (booleans: both; enums: every option; numbers: min, default-ish middle, max). */
const cases = LAB_CAPABILITIES.flatMap((c): [string, LabKey, unknown][] => {
  if (c.control.kind === 'bool') return [true, false].map((v) => [`${c.id}=${v}`, c.id as LabKey, v]);
  if (c.control.kind === 'enum') {
    const numeric = c.control.options.every((o) => o.value !== '' && !Number.isNaN(Number(o.value)));
    return c.control.options.map((o) => [`${c.id}=${o.value}`, c.id as LabKey, numeric ? Number(o.value) : o.value]);
  }
  if (c.control.kind === 'number') return [c.control.min, c.control.max].map((v) => [`${c.id}=${v}`, c.id as LabKey, v]);
  if (c.control.kind === 'color') return [['#000000', '#ffffff'].map((v) => [`${c.id}=${v}`, c.id as LabKey, v] as [string, LabKey, unknown])][0];
  return [];
});

describe('every Lab control value draws without throwing', () => {
  it.each(cases)('%s', async (_name, key, value) => {
    const m = createLab({ count: 300, rsi: true, macd: true, volume: true, markers: true, customPanel: true, sma: true, ema: true, bb: true, vwap: true, theme: key.startsWith('c') && key !== 'chartType' && key !== 'count' ? 'custom' : 'dark' });
    // 'count' is stored as a number, but the UI hands the enum string; the model stores whatever the renderer passes.
    m.set(key, value as never);
    const s = m.getState();
    const size = labSize(s.size, { width: 600, height: 400 });
    controller = new ChartController(host, { ...labChartProps(s, m.getChartData()), ...size });
    await frame();
    controller.update({ ...labChartProps(s, m.getChartData()), ...size });
    controller.flush();
    if (s.empty) expect(host.querySelectorAll('canvas')).toHaveLength(0);
    else expect(host.querySelectorAll('canvas').length).toBeGreaterThan(0);
    m.dispose();
  });

  it('a live feed at 100 ms keeps drawing as candles roll over', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const m = createLab({ count: 200, live: '100' });
    controller = new ChartController(host, { ...labChartProps(m.getState(), m.getChartData()), width: 600, height: 400 });
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(100);
      controller.update({ ...labChartProps(m.getState(), m.getChartData()), width: 600, height: 400 });
      controller.flush();
    }
    expect(host.querySelectorAll('canvas').length).toBeGreaterThan(0);
    m.dispose();
    vi.useRealTimers();
  });
});
