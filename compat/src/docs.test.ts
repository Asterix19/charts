import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateChartConfig } from '@stacklatte/chart-engine';

import { ROOT, abs, listExports } from './exports';
import type * as TS from 'typescript';

const tsApi: typeof TS = createRequire(import.meta.url)('typescript');

/**
 * Documentation is part of the product — especially for LLMs, which copy snippets verbatim. These checks fail
 * the build when any doc references something that does not exist:
 *   • a named import that the package does not export
 *   • a ChartConfig JSON example that does not validate (or one marked "invalid" that does)
 *   • an <sl-chart> binding that is not an @Input of the component
 *   • an @stacklatte/* package that does not exist
 *   • a relative link to a missing file
 */

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.cache', 'ios', 'android', 'out-tsc', '.next', 'build', 'test-results']);
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(md|txt)$/.test(e) && !/(CHANGELOG|LICENSE|lorem)/i.test(e) && !p.includes('/e2e/') && !p.includes('/compat/')) out.push(p);
  }
  return out;
}

/** Extra locations (outside this repo) that publish docs for the packages, e.g. the stacklatte.com tutorials. */
const EXTRA_ROOTS = (process.env.DOCS_EXTRA_ROOTS ?? '').split(':').filter(Boolean);
const files = [...walk(ROOT), ...EXTRA_ROOTS.flatMap((r) => (existsSync(r) ? walk(r) : []))].filter((f) => /(README\.md|llms.*\.txt|docs\/.*\.md|\.md)$/.test(f));

const KNOWN_PACKAGES = ['chart-engine', 'chart-native', 'chart-react', 'chart-angular', 'chart-core', 'chart-web', 'chart-mcp'];
const entry: Record<string, string> = {
  '@stacklatte/chart-engine': 'chart-engine/dist/index.d.ts',
  '@stacklatte/chart-engine/canvas': 'chart-engine/dist/canvas/index.d.ts',
  '@stacklatte/chart-native': 'chart-native/dist/index.d.ts',
  '@stacklatte/chart-react': 'chart-react/dist/index.d.ts',
  '@stacklatte/chart-web': 'chart-web/dist/index.d.ts',
  '@stacklatte/chart-angular': 'chart-angular/dist/types/stacklatte-chart-angular.d.ts',
  '@stacklatte/chart-core': 'chart-core/dist/index.d.ts',
  '@stacklatte/chart-core/core': 'chart-core/dist/core.d.ts',
};
const exportsCache = new Map<string, Set<string>>();
const exportsOf = (spec: string) => {
  if (!exportsCache.has(spec)) exportsCache.set(spec, new Set(listExports(abs(entry[spec])).map((e) => e.name)));
  return exportsCache.get(spec)!;
};

interface Block { lang: string; info: string; code: string; line: number }
function blocks(text: string): Block[] {
  const out: Block[] = [];
  const re = /^```([^\n]*)\n([\s\S]*?)^```/gm;
  for (let m; (m = re.exec(text)); ) {
    const info = m[1].trim();
    out.push({ lang: info.split(/\s+/)[0].toLowerCase(), info, code: m[2], line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

const angularInputs = new Set(
  [...readFileSync(abs('chart-angular/src/sl-chart.component.ts'), 'utf8').matchAll(/@Input\([^)]*\)\s+(\w+)/g)].map((m) => m[1])
    .concat([...readFileSync(abs('chart-angular/src/sl-chart.component.ts'), 'utf8').matchAll(/@Output\(\)\s+(\w+)/g)].map((m) => m[1])),
);

describe('documentation', () => {
  it('finds the docs to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  describe.each(files.map((f) => [relative(ROOT, f) || f, f] as const))('%s', (rel, file) => {
    const text = readFileSync(file, 'utf8');
    const bs = blocks(text);

    it('imports only symbols that exist', () => {
      const problems: string[] = [];
      for (const b of bs.filter((x) => ['ts', 'tsx', 'typescript', 'js', 'jsx', 'javascript', 'mjs'].includes(x.lang))) {
        for (const m of b.code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](@stacklatte\/[a-z-]+(?:\/(?:core|canvas))?)['"]/g)) {
          if (!entry[m[2]]) { problems.push(`line ${b.line}: unknown module ${m[2]}`); continue; }
          const have = exportsOf(m[2]);
          for (const raw of m[1].split(',')) {
            const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
            if (name && !have.has(name)) problems.push(`line ${b.line}: ${m[2]} does not export "${name}"`);
          }
        }
      }
      expect(problems).toEqual([]);
    });

    it('ChartConfig JSON examples validate (or are marked "json invalid" and really are)', () => {
      const problems: string[] = [];
      for (const b of bs.filter((x) => x.lang === 'json')) {
        let parsed: any;
        try { parsed = JSON.parse(b.code); } catch { continue; }
        if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || !('overlays' in parsed)) continue;
        const expectInvalid = /\binvalid\b/.test(b.info);
        const result = validateChartConfig(parsed);
        if (expectInvalid && result.valid) problems.push(`line ${b.line}: marked invalid but validates`);
        if (!expectInvalid && !result.valid) problems.push(`line ${b.line}: ${result.errors.map((e) => `[${e.code}] ${e.path}`).join(', ')}`);
      }
      expect(problems).toEqual([]);
    });

    it('<sl-chart> bindings are real inputs/outputs', () => {
      const problems: string[] = [];
      for (const b of bs) {
        for (const tag of b.code.matchAll(/<sl-chart\b([\s\S]*?)\/?>/g)) {
          for (const bind of tag[1].matchAll(/(?:\[\(?(\w+)\)?\]|\((\w+)\)|(?<=\s)(\w+)(?==["']))/g)) {
            const name = bind[1] ?? bind[2] ?? bind[3];
            if (name && !angularInputs.has(name)) problems.push(`line ${b.line}: <sl-chart> has no input/output "${name}"`);
          }
        }
      }
      expect(problems).toEqual([]);
    });

    it('mentions only real @stacklatte packages', () => {
      // The "Names that do NOT exist" section deliberately lists hallucinated names so agents avoid them.
      const scanned = text.replace(/## Names that do NOT exist[^\n]*\n[\s\S]*?(?=\n## |$)/, '');
      const bad = [...scanned.matchAll(/@stacklatte\/([a-z][a-z-]*)/g)].map((m) => m[1]).filter((n) => !KNOWN_PACKAGES.includes(n) && n !== 'chart-examples' && n !== 'chart-contracts');
      expect([...new Set(bad)]).toEqual([]);
    });

    it('every screenshot it embeds exists in docs/images', () => {
      const missing: string[] = [];
      for (const m of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const src = m[1];
        if (/^https:\/\/raw\.githubusercontent\.com\/Asterix19\/charts\/main\/docs\/images\//.test(src)) {
          if (!existsSync(join(ROOT, 'docs', 'images', src.split('/').pop()!))) missing.push(src);
        } else if (!/^https?:/.test(src) && !existsSync(join(dirname(file), src))) missing.push(src);
      }
      expect(missing).toEqual([]);
    });

    it('has no broken relative links', () => {
      const broken: string[] = [];
      for (const m of text.matchAll(/\]\((\.{1,2}\/[^)#\s]+)(?:#[^)]*)?\)/g)) {
        const target = join(dirname(file), m[1]);
        if (!existsSync(target)) broken.push(m[1]);
      }
      expect(broken).toEqual([]);
    });
  });
});

/**
 * Complete examples must compile. A block counts as "complete" when it imports from an @stacklatte package and has an
 * `export` — fragments (a bare JSX line, a config literal) are skipped. Each is type-checked strictly against the
 * built packages, so a snippet that imports fine but misuses a prop fails here.
 */
describe('complete TypeScript examples compile', () => {
  const dir = join(ROOT, 'compat', '.cache', 'snippets');
  const snippets: Array<{ doc: string; line: number; file: string }> = [];

  for (const file of files) {
    const rel = relative(ROOT, file) || file;
    for (const b of blocks(readFileSync(file, 'utf8'))) {
      if (!['ts', 'tsx', 'typescript'].includes(b.lang)) continue;
      if (!/from ['"]@stacklatte\//.test(b.code) || !/^export /m.test(b.code)) continue;
      if (/\bnocheck\b/.test(b.info)) continue;
      snippets.push({ doc: rel, line: b.line, file: `${rel.replace(/[^a-z0-9]+/gi, '_')}_L${b.line}.${b.lang === 'ts' || b.lang === 'typescript' ? 'ts' : 'tsx'}` });
    }
  }

  it('finds complete examples to check', () => {
    expect(snippets.length).toBeGreaterThan(0);
  });

  it('every complete example type-checks', () => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const byFile = new Map<string, { doc: string; line: number }>();
    for (const sn of snippets) {
      const src = blocks(readFileSync(join(ROOT, sn.doc), 'utf8')).find((b) => b.line === sn.line)!;
      writeFileSync(join(dir, sn.file), src.code);
      byFile.set(join(dir, sn.file), sn);
    }
    const program = tsApi.createProgram([...byFile.keys()], {
      strict: true, noEmit: true, skipLibCheck: true, target: tsApi.ScriptTarget.ES2022, module: tsApi.ModuleKind.ESNext,
      moduleResolution: tsApi.ModuleResolutionKind.Bundler, jsx: tsApi.JsxEmit.ReactJSX, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      experimentalDecorators: true, types: [], esModuleInterop: true,
      // Consumers get chart-angular's types from the ng-packagr output (dist/), not the source package root.
      paths: { '@stacklatte/chart-angular': [join(ROOT, 'chart-angular/dist/types/stacklatte-chart-angular.d.ts')] },
    });
    const problems = [...byFile.keys()].flatMap((f) =>
      tsApi.getPreEmitDiagnostics(program, program.getSourceFile(f)).map((d) => {
        const sn = byFile.get(f)!;
        const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
        return `${sn.doc}:${sn.line + pos}  TS${d.code}: ${tsApi.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 220)}`;
      }),
    );
    expect(problems).toEqual([]);
  });
});

describe('documentation states the real scenario count', () => {
  it('every "N scenarios" claim matches the catalogue', async () => {
    const { SCENARIOS } = await import('@stacklatte/chart-examples');
    const wrong: string[] = [];
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\b(\d+)[ -](?:reproducible )?scenarios?\b/g)) {
        if (Number(m[1]) !== SCENARIOS.length && Number(m[1]) > 5) wrong.push(`${relative(ROOT, file)}: says ${m[1]}, catalogue has ${SCENARIOS.length}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

