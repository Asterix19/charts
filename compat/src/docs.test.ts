import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateChartConfig } from '@stacklatte/chart-engine';

import { ROOT, abs, listExports } from './exports';

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

const KNOWN_PACKAGES = ['chart-engine', 'chart-canvas', 'chart-native', 'chart-web', 'chart-angular', 'chart-core'];
const entry: Record<string, string> = {
  '@stacklatte/chart-engine': 'chart-engine/dist/index.d.ts',
  '@stacklatte/chart-canvas': 'chart-canvas/dist/index.d.ts',
  '@stacklatte/chart-native': 'chart-native/dist/index.d.ts',
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
        for (const m of b.code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](@stacklatte\/[a-z-]+(?:\/core)?)['"]/g)) {
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
      const bad = [...text.matchAll(/@stacklatte\/([a-z][a-z-]*)/g)].map((m) => m[1]).filter((n) => !KNOWN_PACKAGES.includes(n) && n !== 'chart-examples' && n !== 'chart-contracts');
      expect([...new Set(bad)]).toEqual([]);
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
