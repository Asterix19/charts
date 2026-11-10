import Ajv from 'ajv';
import { createGenerator } from 'ts-json-schema-generator';
import { describe, expect, it } from 'vitest';

import type { ChartConfig } from './config';
import { validateChartConfig } from './validate';

/**
 * We hand LLMs the generated JSON Schema (structured output / tool calling) and enforce a separate
 * runtime validator. They must agree: a model that follows the schema must not be rejected at runtime
 * for structural reasons, and a structurally wrong config must be rejected by both.
 */

const schema = createGenerator({ path: new URL('./config.ts', import.meta.url).pathname, type: 'ChartConfig', skipTypeCheck: true }).createSchema('ChartConfig');
const ajv = new Ajv({ allErrors: true, strict: false });
const schemaValid = ajv.compile(schema);

const rich = (): ChartConfig => ({
  version: '1', theme: 'dark', priceDisplay: 'candle', interval: '1h',
  overlays: [
    { type: 'ema', id: 'e', params: { period: 9 }, color: 'cyan', label: 'EMA' },
    { type: 'sma', id: 's', params: { period: 20 }, color: 'orange' },
    { type: 'bollinger_bands', params: { period: 20, stdDev: 2 }, bands: { upper: { id: 'u', color: 'blue' }, lower: { id: 'l', color: 'blue' }, basis: { id: 'b', color: 'gray' } } },
    { type: 'vwap', id: 'v', params: {}, color: 'pink' },
  ],
  shadedAreas: [{ fromOverlayId: 'u', toOverlayId: 'l', color: 'purple', opacity: 0.2 }],
  subPanels: [{ type: 'rsi', params: { period: 14 } }, { type: 'macd' }, { type: 'volume' }],
  markers: [{ timestamp: 1, price: 2, kind: 'entry-long', label: 'x' }],
  viewport: { visibleCandles: 100, followLive: true },
  hud: { showOhlcHud: true },
});

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const runtime = (c: unknown) => validateChartConfig(c as ChartConfig).valid;
const viaSchema = (c: unknown) => schemaValid(c) as boolean;

describe('JSON Schema ↔ runtime validator parity', () => {
  it('both accept the rich valid config', () => {
    expect(viaSchema(rich())).toBe(true);
    expect(runtime(rich())).toBe(true);
  });

  const structural: Array<[string, (c: any) => void]> = [
    ['theme out of enum', (c) => (c.theme = 'neon')],
    ['priceDisplay out of enum', (c) => (c.priceDisplay = 'ohlc')],
    ['interval out of enum', (c) => (c.interval = '2h')],
    ['raw hex colour', (c) => (c.overlays[0].color = '#00ffff')],
    ['unknown overlay type', (c) => (c.overlays[0].type = 'ichimoku')],
    ['unknown sub-panel type', (c) => (c.subPanels[0].type = 'stochastic')],
    ['unknown marker kind', (c) => (c.markers[0].kind = 'buy')],
    ['unknown top-level key', (c) => (c.sparkles = true)],
    ['unknown nested key (viewport)', (c) => (c.viewport.zoom = 2)],
    ['unknown nested key (hud)', (c) => (c.hud.extra = 1)],
    ['unknown nested key (overlay)', (c) => (c.overlays[0].width = 3)],
    ['unknown nested key (params)', (c) => (c.overlays[0].params.smoothing = 2)],
    ['unknown nested key (band)', (c) => (c.overlays[2].bands.upper.dash = true)],
    ['missing theme', (c) => delete c.theme],
    ['missing overlays', (c) => delete c.overlays],
    ['missing viewport', (c) => delete c.viewport],
    ['missing hud', (c) => delete c.hud],
    ['missing overlay id', (c) => delete c.overlays[0].id],
    ['missing overlay color', (c) => delete c.overlays[0].color],
    ['missing ema period', (c) => delete c.overlays[0].params.period],
    ['theme is a number', (c) => (c.theme = 1)],
    ['overlays is an object', (c) => (c.overlays = {})],
    ['followLive is a string', (c) => (c.viewport.followLive = 'yes')],
    ['showOhlcHud is a number', (c) => (c.hud.showOhlcHud = 1)],
    ['period is a string', (c) => (c.overlays[0].params.period = '9')],
    ['marker price is a string', (c) => (c.markers[0].price = '2')],
    ['null config section', (c) => (c.viewport = null)],
  ];

  it.each(structural)('structural error "%s" is rejected by BOTH', (_name, mutate) => {
    const c = clone(rich());
    mutate(c);
    expect(viaSchema(c), 'schema').toBe(false);
    expect(runtime(c), 'runtime').toBe(false);
  });

  const semantic: Array<[string, (c: any) => void]> = [
    ['period 0', (c) => (c.overlays[0].params.period = 0)],
    ['period 501', (c) => (c.overlays[0].params.period = 501)],
    ['period 1.5', (c) => (c.overlays[0].params.period = 1.5)],
    ['stdDev 0', (c) => (c.overlays[2].params.stdDev = 0)],
    ['opacity 2', (c) => (c.shadedAreas[0].opacity = 2)],
    ['visibleCandles 5', (c) => (c.viewport.visibleCandles = 5)],
    ['visibleCandles 9999', (c) => (c.viewport.visibleCandles = 9999)],
    ['duplicate overlay id', (c) => (c.overlays[1].id = 'e')],
    ['shaded area refs a missing overlay', (c) => (c.shadedAreas[0].fromOverlayId = 'ghost')],
    ['shaded area refs itself', (c) => (c.shadedAreas[0].toOverlayId = 'u')],
    ['marker timestamp NaN-like (null)', (c) => (c.markers[0].timestamp = null)],
  ];

  it.each(semantic)('semantic error "%s" is rejected at runtime (schema may allow it)', (_name, mutate) => {
    const c = clone(rich());
    mutate(c);
    expect(runtime(c), 'runtime').toBe(false);
  });

  it('never lets runtime accept what the schema rejects (random mutation fuzz)', () => {
    let seed = 1234;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const junk = ['neon', '', null, 0, -1, 1.5, true, [], {}, 'dark', '#fff', 99999, 'ema'];
    const paths: string[][] = [
      ['theme'], ['priceDisplay'], ['interval'], ['overlays', '0', 'color'], ['overlays', '0', 'params', 'period'],
      ['overlays', '1', 'type'], ['subPanels', '0', 'type'], ['viewport', 'visibleCandles'], ['viewport', 'followLive'],
      ['hud', 'showOhlcHud'], ['shadedAreas', '0', 'opacity'], ['markers', '0', 'kind'], ['version'],
    ];
    let runtimeAccepted = 0;
    for (let i = 0; i < 600; i++) {
      const c: any = clone(rich());
      const p = pick(paths);
      let o = c;
      for (let k = 0; k < p.length - 1; k++) o = o[p[k]];
      const v = pick(junk);
      if (rand() < 0.15) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = v;
      if (runtime(c)) {
        runtimeAccepted++;
        expect(viaSchema(c), `runtime accepted but schema rejected: ${JSON.stringify(c)}`).toBe(true);
      }
    }
    expect(runtimeAccepted).toBeGreaterThan(0); // the fuzz actually exercised accepting cases
  });
});
