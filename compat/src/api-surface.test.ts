import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PACKAGES, abs, listExports } from './exports';

/**
 * Locks the public API of every package. Removing or renaming an export fails here — that is a breaking
 * change for the people who have these packages installed. Adding one also fails until the snapshot is
 * updated on purpose (`npm run update-api -w @stacklatte/chart-contracts`), so additions are reviewed too.
 */
const update = process.env.UPDATE_API === '1';

describe.each(Object.entries(PACKAGES))('%s public API', (name, { dts }) => {
  it.each(dts)('%s matches the committed surface', (file) => {
    const current = listExports(abs(file));
    const snapshot = join(abs('compat/api-surface'), `${name}${dts.length > 1 ? `.${file.split('/').pop()!.replace('.d.ts', '')}` : ''}.json`);
    if (update || !existsSync(snapshot)) {
      mkdirSync(dirname(snapshot), { recursive: true });
      writeFileSync(snapshot, JSON.stringify(current, null, 2) + '\n');
    }
    const committed = JSON.parse(readFileSync(snapshot, 'utf8')) as typeof current;
    const key = (e: { name: string; kind: string }) => `${e.name}:${e.kind}`;
    const removed = committed.filter((c) => !current.some((x) => x.name === c.name)).map((e) => e.name);
    const changedKind = committed.filter((c) => current.some((x) => x.name === c.name && x.kind !== c.kind)).map((e) => e.name);
    const added = current.filter((c) => !committed.some((x) => x.name === c.name)).map((e) => e.name);
    expect({ removed, changedKind }, 'BREAKING: exports removed or changed kind').toEqual({ removed: [], changedKind: [] });
    expect(added, 'new exports — run `npm run update-api -w @stacklatte/chart-contracts` to accept them').toEqual([]);
    expect(current.map(key)).toEqual(committed.map(key));
  });
});

describe('cross-package consistency', () => {
  const names = (pkg: string, file = PACKAGES[pkg].dts[0]) => new Set(listExports(abs(file)).map((e) => e.name));

  it('chart-native, chart-web and chart-angular re-export the whole engine', () => {
    const engine = names('chart-engine');
    for (const pkg of ['chart-native', 'chart-web', 'chart-angular']) {
      const have = names(pkg);
      const missing = [...engine].filter((n) => !have.has(n));
      expect(missing, `${pkg} is missing engine exports`).toEqual([]);
    }
  });

  it('chart-core (legacy) still exposes everything chart-native does, and /core exposes the engine', () => {
    const native = names('chart-native');
    const core = names('chart-core', 'chart-core/dist/index.d.ts');
    expect([...native].filter((n) => !core.has(n))).toEqual([]);
    const engine = names('chart-engine');
    const coreSub = names('chart-core', 'chart-core/dist/core.d.ts');
    expect([...engine].filter((n) => !coreSub.has(n))).toEqual([]);
  });

  it('every renderer exposes SLChart or its framework equivalent; the engine /canvas entry carries the shared Canvas 2D renderer', () => {
    expect(names('chart-native').has('SLChart')).toBe(true);
    expect(names('chart-web').has('SLChart')).toBe(true);
    expect(names('chart-angular').has('SlChartComponent')).toBe(true);
    expect(names('chart-engine-canvas').has('ChartController')).toBe(true);
  });
});
