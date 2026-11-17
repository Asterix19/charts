import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

import { createServer } from '../src/server.js';

let client: Client | undefined;
afterEach(async () => { await client?.close(); client = undefined; });

async function connect(): Promise<Client> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(b);
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(a);
  return client;
}
const textOf = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content[0]).text;
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => c.callTool({ name, arguments: args });

describe('tools', () => {
  it('exposes exactly the documented tools and the docs resource', async () => {
    const c = await connect();
    const tools = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(['generate_chart', 'get_docs', 'list_capabilities', 'report_issue', 'validate_chart_config']);
    expect((await c.listResources()).resources.map((r) => r.uri)).toContain('stacklatte-charts://llms.txt');
    expect(c.getServerCapabilities()?.tools).toBeDefined();
  });

  it('list_capabilities lists every group, the presets and the frameworks', async () => {
    const c = await connect();
    const doc = JSON.parse(textOf(await call(c, 'list_capabilities')));
    expect(doc.groups.map((g: { group: string }) => g.group)).toEqual(expect.arrayContaining(['Data', 'View', 'Overlays', 'Panels', 'Markers']));
    expect(doc.presets.map((p: { id: string }) => p.id)).toEqual(['trading', 'area', 'sparkline', 'everything']);
    expect(doc.frameworks.map((f: { id: string }) => f.id)).toEqual(['react', 'angular', 'react-native', 'typescript']);
    const chartType = doc.groups.flatMap((g: { controls: { id: string }[] }) => g.controls).find((x: { id: string }) => x.id === 'chartType');
    expect(chartType.options).toEqual(['candle', 'line', 'area']);
  });

  it('generate_chart returns code, install, ChartConfig and a prompt for the exact settings', async () => {
    const c = await connect();
    const out = textOf(await call(c, 'generate_chart', { framework: 'react', preset: 'trading', settings: { rsiPeriod: 9, zoom: 120, macd: true } }));
    for (const must of ['# Chart for react', 'RSI(9)', 'MACD', 'showMacdPanel', 'visibleDataPoints={120}', 'npm install @stacklatte/chart-react', '"type": "macd"', 'Prompt for an AI assistant', 'https://stacklatte.com/llms.txt']) expect(out, must).toContain(must);
  });

  it('generates a sparkline for a list of stocks', async () => {
    const c = await connect();
    const out = textOf(await call(c, 'generate_chart', { framework: 'react', preset: 'sparkline' }));
    expect(out).toContain('sparkline');
    expect(out).toContain('width={120} height={36}');
    expect(out).toContain('Not applicable'); // ChartConfig cannot express sparkline mode
  });

  it('works for every framework', async () => {
    const c = await connect();
    for (const [framework, needle] of [['angular', '@stacklatte/chart-angular'], ['react-native', '@stacklatte/chart-native'], ['typescript', 'ChartController']] as const) {
      expect(textOf(await call(c, 'generate_chart', { framework, preset: 'area' })), framework).toContain(needle);
    }
  });

  it('rejects unknown settings and out-of-range values with a clear error instead of ignoring them', async () => {
    const c = await connect();
    const bad = await call(c, 'generate_chart', { framework: 'react', settings: { rsiPerod: 9 } }).catch((e) => ({ isError: true, content: [{ type: 'text', text: String(e) }] }));
    expect((bad as { isError?: boolean }).isError).toBe(true);
    const range = await call(c, 'generate_chart', { framework: 'react', settings: { rsiPeriod: 500 } }).catch((e) => ({ isError: true, content: [{ type: 'text', text: String(e) }] }));
    expect((range as { isError?: boolean }).isError).toBe(true);
    const enumBad = await call(c, 'generate_chart', { framework: 'react', settings: { chartType: 'donut' } }).catch((e) => ({ isError: true, content: [{ type: 'text', text: String(e) }] }));
    expect((enumBad as { isError?: boolean }).isError).toBe(true);
    expect(textOf(enumBad)).toMatch(/candle, line, area|one of/i);
  });

  it('validate_chart_config accepts a valid document and itemises the errors of an invalid one', async () => {
    const c = await connect();
    const valid = { version: '1', theme: 'dark', priceDisplay: 'area', interval: '1h', overlays: [], shadedAreas: [], subPanels: [], viewport: { visibleCandles: 100, followLive: true }, hud: { showOhlcHud: true } };
    expect(textOf(await call(c, 'validate_chart_config', { config: valid }))).toContain('Valid ChartConfig');
    const invalid = await call(c, 'validate_chart_config', { config: { ...valid, theme: 'neon', overlays: [{ type: 'rsi' }] } });
    expect((invalid as { isError?: boolean }).isError).toBe(true);
    expect(textOf(invalid)).toContain('theme');
  });

  it('get_docs serves the overview, the full docs and keyword search', async () => {
    const c = await connect();
    expect(textOf(await call(c, 'get_docs', {}))).toContain('@stacklatte/chart-react');
    expect(textOf(await call(c, 'get_docs', { topic: 'full' })).length).toBeGreaterThan(20000);
    expect(textOf(await call(c, 'get_docs', { query: 'sparkline' })).toLowerCase()).toContain('sparkline');
    expect(textOf(await call(c, 'get_docs', { query: 'zzzzqqq' }))).toContain('No match');
  });

  it('report_issue points at bugs@stacklatte.com with a prefilled mailto', async () => {
    const c = await connect();
    const out = textOf(await call(c, 'report_issue', { summary: 'crosshair stuck' }));
    expect(out).toContain('bugs@stacklatte.com');
    expect(decodeURIComponent(out)).toContain('mailto:bugs@stacklatte.com?subject=Stacklatte Charts: crosshair stuck');
  });

  it('serves the llms.txt resource', async () => {
    const c = await connect();
    const r = await c.readResource({ uri: 'stacklatte-charts://llms.txt' });
    expect((r.contents[0] as { text: string }).text).toContain('@stacklatte/chart-react');
  });
});

describe('the published binary, over stdio (how Claude Code starts it)', () => {
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  it.skipIf(!existsSync(cli))('lists its tools and answers a generate_chart call', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [cli] });
    const c = new Client({ name: 'stdio-test', version: '1.0.0' });
    await c.connect(transport);
    try {
      expect((await c.listTools()).tools.length).toBe(5);
      expect(textOf(await call(c, 'generate_chart', { framework: 'react', preset: 'area' }))).toContain('chartType="area"');
    } finally {
      await c.close();
    }
  });
});
