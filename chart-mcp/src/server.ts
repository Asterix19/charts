import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateChartConfig } from '@stacklatte/chart-engine';
import {
  CODEGEN_TARGETS,
  DEFAULT_LAB_STATE,
  LAB_CAPABILITIES,
  LAB_PRESETS,
  generateChart,
  visibleCapabilities,
} from '@stacklatte/chart-engine/lab';
import type { CodegenTarget, LabState } from '@stacklatte/chart-engine/lab';
import { z } from 'zod';

import { LLMS_FULL, LLMS_TXT } from './docs.generated.js';

export const BUGS_EMAIL = 'bugs@stacklatte.com';
const FRAMEWORKS = CODEGEN_TARGETS.map((t) => t.id) as [CodegenTarget, ...CodegenTarget[]];

// ---------------------------------------------------------------------------- the settings schema, derived from the capability list

/** One zod field per chart capability, so an AI client gets itemised errors instead of silently ignored typos. */
function settingsShape() {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const cap of LAB_CAPABILITIES) {
    const c = cap.control;
    const doc = `${cap.label}${cap.hint ? `: ${cap.hint}` : ''}`;
    if (c.kind === 'bool') shape[cap.id] = z.boolean().describe(doc);
    else if (c.kind === 'enum') {
      const allowed = c.options.map((o) => o.value);
      shape[cap.id] = z
        .union([z.string(), z.number()])
        .refine((v) => allowed.includes(String(v)), { message: `must be one of: ${allowed.join(', ')}` })
        .describe(`${doc}. One of: ${allowed.join(', ')}`);
    } else if (c.kind === 'number') shape[cap.id] = z.number().min(c.min).max(c.max).describe(`${doc} (${c.min}–${c.max})`);
    else if (c.kind === 'color') shape[cap.id] = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb colour').describe(`${doc} (only used when theme is "custom")`);
  }
  return shape;
}

const settingsSchema = z.object(settingsShape()).partial().strict();

/** Defaults, then the preset, then the caller's settings (numeric options arrive as strings or numbers). */
function resolveState(preset: string | undefined, settings: Record<string, unknown> | undefined): LabState {
  const state = { ...DEFAULT_LAB_STATE } as unknown as Record<string, unknown>;
  const p = preset ? LAB_PRESETS.find((x) => x.id === preset) : undefined;
  Object.assign(state, p?.set ?? {});
  for (const [k, v] of Object.entries(settings ?? {})) state[k] = typeof DEFAULT_LAB_STATE[k as keyof LabState] === 'number' ? Number(v) : v;
  return state as unknown as LabState;
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true } : {}) });
const fence = (lang: string, code: string) => `\`\`\`${lang}\n${code.trimEnd()}\n\`\`\``;

/** The paragraphs of the full docs that mention a word, for `get_docs { query }`. */
function search(query: string, limit = 10): string {
  const needle = query.toLowerCase();
  const hits = LLMS_FULL.split(/\n{2,}/).filter((p) => p.toLowerCase().includes(needle)).slice(0, limit);
  return hits.length ? hits.join('\n\n---\n\n') : `No match for "${query}" in the docs. Try get_docs with topic "full".`;
}

// ---------------------------------------------------------------------------- server

export function createServer(): McpServer {
  const server = new McpServer({ name: 'stacklatte-charts', version: '1.0.0' }, {
    instructions:
      'Stacklatte Charts: open-source trading charts for React, Angular and React Native (npm: @stacklatte/chart-react, chart-angular, chart-native, chart-engine). ' +
      'Use generate_chart to get exact, type-checked code (plus a validated ChartConfig and a prompt) for a chart, list_capabilities to see every option, ' +
      'validate_chart_config before using a ChartConfig, and get_docs for the API. Never invent props: every prop is listed by list_capabilities / get_docs.',
  });

  server.registerTool(
    'list_capabilities',
    {
      title: 'List chart capabilities',
      description: 'Every option a chart supports (data, view, overlays, panels, markers, custom theme), with allowed values and defaults, the presets, and the supported frameworks. Call this before generate_chart.',
      inputSchema: {},
    },
    async () => {
      const groups = visibleCapabilities({ ...DEFAULT_LAB_STATE, sma: true, ema: true, bb: true, rsi: true, theme: 'custom' }).filter((g) => g.group !== 'Actions').map((g) => ({
        group: g.group,
        controls: g.items.map((c) => ({
          id: c.id, label: c.label, ...(c.hint ? { hint: c.hint } : {}), type: c.control.kind,
          ...(c.control.kind === 'enum' ? { options: c.control.options.map((o) => o.value) } : {}),
          ...(c.control.kind === 'number' ? { min: c.control.min, max: c.control.max, step: c.control.step } : {}),
          default: (DEFAULT_LAB_STATE as unknown as Record<string, unknown>)[c.id],
        })),
      }));
      return text(JSON.stringify({ frameworks: CODEGEN_TARGETS.map((t) => ({ id: t.id, package: t.pkg, install: t.install })), presets: LAB_PRESETS.map(({ id, label, hint }) => ({ id, label, hint })), groups }, null, 2));
    },
  );

  server.registerTool(
    'generate_chart',
    {
      title: 'Generate a chart',
      description:
        'Generate ready-to-paste code for a chart (React, Angular, React Native or plain TypeScript), the validated ChartConfig JSON, a plain-English spec and a complete prompt, for the exact settings given. ' +
        'Start from a preset (trading, area, sparkline, everything) and/or pass settings (see list_capabilities). The code assumes the project already has candles: Candle[] (oldest first, timestamp in Unix ms). ' +
        'For a list of many small charts (stock tickers) use preset "sparkline" and feed it closesToCandles(prices).',
      inputSchema: {
        framework: z.enum(FRAMEWORKS).describe('Target framework: react (Next.js), angular, react-native or typescript'),
        preset: z.enum(LAB_PRESETS.map((p) => p.id) as [string, ...string[]]).optional().describe('Starting point; settings are applied on top'),
        settings: settingsSchema.optional().describe('Chart settings (see list_capabilities). Unknown keys are rejected.'),
      },
    },
    async ({ framework, preset, settings }) => {
      const state = resolveState(preset, settings as Record<string, unknown> | undefined);
      const g = generateChart(state, framework);
      const out = [
        `# Chart for ${framework}`,
        '## Exact settings', g.spec.map((l) => `- ${l}`).join('\n'),
        '## Install', fence('sh', g.install),
        '## Code', fence(framework === 'angular' || framework === 'typescript' ? 'ts' : 'tsx', g.code),
        g.chartConfig ? `## ChartConfig (validated, LLM-safe JSON)\n${fence('json', JSON.stringify(g.chartConfig, null, 2))}${g.configGaps.length ? `\nNot expressible in ChartConfig (they are props in the code): ${g.configGaps.join('; ')}.` : ''}` : `## ChartConfig\nNot applicable: ${g.configGaps.join('; ')}.`,
        '## Prompt for an AI assistant', fence('markdown', g.prompt),
      ];
      return text(out.join('\n\n'));
    },
  );

  server.registerTool(
    'validate_chart_config',
    {
      title: 'Validate a ChartConfig',
      description: 'Check a ChartConfig JSON document against the library\'s strict validator (closed enums, unknown keys rejected). Returns itemised errors with their paths, or confirms it is valid.',
      inputSchema: { config: z.unknown().describe('The ChartConfig object (not a string)') },
    },
    async ({ config }) => {
      const result = validateChartConfig(config as never);
      if (result.valid) return text('Valid ChartConfig. Use it with buildChartPipeline(config, candles).');
      return text(`Invalid ChartConfig:\n${result.errors.map((e) => `- [${e.code}] ${e.path}: ${e.message}`).join('\n')}`, true);
    },
  );

  server.registerTool(
    'get_docs',
    {
      title: 'Read the Stacklatte Charts docs',
      description: 'The API docs written for AI agents. topic "overview" = llms.txt (short), "full" = llms-full.txt (everything). Pass query to get only the paragraphs that mention a word (e.g. "sparkline", "markers", "ChartConfig").',
      inputSchema: {
        topic: z.enum(['overview', 'full']).default('overview'),
        query: z.string().min(2).optional().describe('Return only paragraphs of the full docs that mention this word'),
      },
    },
    async ({ topic, query }) => text(query ? search(query) : topic === 'full' ? LLMS_FULL : LLMS_TXT),
  );

  server.registerTool(
    'report_issue',
    {
      title: 'How to report a bug',
      description: `Where and how to report a problem with Stacklatte Charts: email ${BUGS_EMAIL} (or open a GitHub issue). Returns a template and a mailto link to give the user.`,
      inputSchema: { summary: z.string().optional().describe('One line describing the problem') },
    },
    async ({ summary }) => {
      const subject = summary ? `Stacklatte Charts: ${summary}` : 'Stacklatte Charts issue';
      const body = 'What went wrong?\n\n\nWhat did you expect?\n\n\nSteps to reproduce:\n1. \n\nPackages and versions (npm ls @stacklatte/chart-react @stacklatte/chart-engine):\n\nFramework / browser / device:\n';
      return text([`Send bug reports to ${BUGS_EMAIL} (GitHub issues also work: https://github.com/Asterix19/charts/issues).`, '', `mailto:${BUGS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '', 'Template:', fence('text', body)].join('\n'));
    },
  );

  server.registerResource('llms', 'stacklatte-charts://llms.txt', { title: 'Stacklatte Charts: docs for AI agents', mimeType: 'text/plain' }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/plain', text: LLMS_TXT }] }));

  return server;
}
