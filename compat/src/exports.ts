import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type * as TS from 'typescript';

// Use TypeScript 6's classic compiler API (the repo root is on TS 7, whose JS API differs).
const require = createRequire(import.meta.url);
const ts: typeof TS = require('typescript');

export const ROOT = resolve(new URL('../..', import.meta.url).pathname);

export interface ExportInfo { name: string; kind: 'value' | 'type' | 'both' }

/** Every name a consumer can import from a declaration entry point, and whether it is a value, a type, or both. */
export function listExports(dtsEntry: string): ExportInfo[] {
  if (!existsSync(dtsEntry)) throw new Error(`Missing declaration file ${dtsEntry} — run "npm run build" first.`);
  const program = ts.createProgram([dtsEntry], {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
    types: [],
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(dtsEntry)!;
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`${dtsEntry} is not a module`);
  return checker
    .getExportsOfModule(moduleSymbol)
    .map((sym): ExportInfo => {
      const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      const isValue = !!(target.flags & ts.SymbolFlags.Value);
      const isType = !!(target.flags & (ts.SymbolFlags.Type | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias));
      return { name: sym.name, kind: isValue && isType ? 'both' : isValue ? 'value' : 'type' };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const PACKAGES: Record<string, { dts: string[] }> = {
  'chart-engine': { dts: ['chart-engine/dist/index.d.ts'] },
  'chart-canvas': { dts: ['chart-canvas/dist/index.d.ts'] },
  'chart-native': { dts: ['chart-native/dist/index.d.ts'] },
  'chart-web': { dts: ['chart-web/dist/index.d.ts'] },
  'chart-core': { dts: ['chart-core/dist/index.d.ts', 'chart-core/dist/core.d.ts'] },
  'chart-angular': { dts: ['chart-angular/dist/types/stacklatte-chart-angular.d.ts'] },
};

export const abs = (p: string) => join(ROOT, p);
