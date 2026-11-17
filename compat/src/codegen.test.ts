// The Lab's "copy the code" output must be real, working code: every generated snippet is type-checked strictly against the
// built packages, and every generated ChartConfig must pass the library's own validator.
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type * as TS from 'typescript';
import { validateChartConfig } from '@stacklatte/chart-engine';
import { CODEGEN_TARGETS, DEFAULT_LAB_STATE, LAB_CAPABILITIES, generateChart } from '@stacklatte/chart-engine/lab';
import type { CodegenTarget, LabState } from '@stacklatte/chart-engine/lab';
import { ROOT } from './exports';

const ts: typeof TS = createRequire(import.meta.url)('typescript');

const RICH: Partial<LabState> = { sma: true, ema: true, bb: true, vwap: true, rsi: true, macd: true, volume: true, customPanel: true, markers: true, hud: true };

/** Baseline, a fully loaded chart, and every control flipped / set to each option, on top of the rich baseline. */
function states(): [string, LabState][] {
  const out: [string, LabState][] = [['default', DEFAULT_LAB_STATE], ['rich', { ...DEFAULT_LAB_STATE, ...RICH }], ['rich custom theme', { ...DEFAULT_LAB_STATE, ...RICH, theme: 'custom' }], ['sparkline', { ...DEFAULT_LAB_STATE, sparkline: true }], ['sparkline line', { ...DEFAULT_LAB_STATE, sparkline: true, chartType: 'line' }]];
  for (const cap of LAB_CAPABILITIES) {
    const k = cap.control;
    const base = { ...DEFAULT_LAB_STATE, ...RICH } as LabState;
    const id = cap.id as keyof LabState;
    if (k.kind === 'bool') out.push([`${cap.id}=${!base[id]}`, { ...base, [id]: !base[id] }]);
    if (k.kind === 'enum') for (const o of k.options) out.push([`${cap.id}=${o.value}`, { ...base, [id]: typeof base[id] === 'number' ? Number(o.value) : o.value }]);
    if (k.kind === 'number') out.push([`${cap.id}=${k.max}`, { ...base, [id]: k.max }]);
  }
  return out;
}

describe('generated ChartConfig', () => {
  it.each(states())('is valid for %s', (_name, state) => {
    const { chartConfig } = generateChart(state, 'react');
    if (!chartConfig) return; // sparkline: not expressible, documented as a gap
    const result = validateChartConfig(chartConfig);
    expect(result.valid, JSON.stringify(result) + JSON.stringify(chartConfig)).toBe(true);
  });
});

describe('generated code type-checks against the real packages', () => {
  const dir = join(ROOT, 'compat', '.cache', 'codegen');

  it('every target, for every control value', () => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const files = new Map<string, string>();
    const seen = new Set<string>();
    for (const target of CODEGEN_TARGETS.map((t) => t.id) as CodegenTarget[]) {
      for (const [name, state] of states()) {
        const { code } = generateChart(state, target);
        const key = `${target}\n${code}`;
        if (seen.has(key)) continue; // controls that do not change the code (candle count, live feed...) add nothing
        seen.add(key);
        const file = join(dir, `${target}_${files.size}_${name.replace(/[^a-z0-9]+/gi, '_')}.${target === 'react' || target === 'react-native' ? 'tsx' : 'ts'}`);
        writeFileSync(file, code);
        files.set(file, `${target} / ${name}`);
      }
    }
    expect(files.size).toBeGreaterThan(40);
    const program = ts.createProgram([...files.keys()], {
      strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      experimentalDecorators: true, types: [], esModuleInterop: true,
      paths: { '@stacklatte/chart-angular': [join(ROOT, 'chart-angular/dist/types/stacklatte-chart-angular.d.ts')] },
    });
    const problems = [...files.keys()].flatMap((f) =>
      ts.getPreEmitDiagnostics(program, program.getSourceFile(f)).map((d) => {
        const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
        return `${files.get(f)} (${f.split('/').pop()}:${pos}): TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 200)}`;
      }),
    );
    expect(problems).toEqual([]);
  });
});

describe('generated Angular templates bind to the right kind of member', () => {
  it('signals are called with (), plain fields are not, and every bound name exists on the class', () => {
    for (const [name, state] of states()) {
      const { code } = generateChart(state, 'angular');
      for (const m of code.matchAll(/\[(\w+)\]="(\w+)(\(\))?"/g)) {
        const [, input, ident, call] = m;
        if (/^\d+$|^(true|false)$/.test(ident)) continue; // literals: [height]="520", [showOhlcHud]="true"
        const member = new RegExp(`readonly ${ident}\\s*=\\s*(computed|input)?`).exec(code);
        expect(member, `${name}: template binds [${input}]="${ident}" but the class has no member ${ident}`).not.toBeNull();
        const isSignal = !!member![1];
        expect(!!call, `${name}: [${input}]="${ident}${call ?? ''}" ${isSignal ? 'is a signal and must be called' : 'is a plain field and must not be called'}`).toBe(isSignal);
      }
    }
  });
});

describe('prompt', () => {
  it('names the package, the exact settings, the code, the docs URL and the rules', () => {
    const { prompt } = generateChart({ ...DEFAULT_LAB_STATE, ...RICH, rsiPeriod: 9 }, 'react');
    for (const must of ['@stacklatte/chart-react', 'RSI(9)', 'SMA(20)', 'Bollinger', 'https://stacklatte.com/llms.txt', 'use client', '```tsx', '"version": "1"', 'npm install']) expect(prompt, must).toContain(must);
  });
  it('every target produces install, code, prompt and spec', () => {
    for (const t of CODEGEN_TARGETS) {
      const g = generateChart(DEFAULT_LAB_STATE, t.id);
      expect(g.install).toBe(t.install);
      expect(g.code.length).toBeGreaterThan(80);
      expect(g.prompt).toContain(t.pkg);
      expect(g.spec.length).toBeGreaterThan(3);
    }
  });
});
