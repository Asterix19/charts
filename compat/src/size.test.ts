import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { abs } from './exports';

/**
 * Bundle-size budgets (gzipped bytes of the published ESM entry). Measured sizes are listed next to each budget;
 * budgets leave ~30% headroom, so growth is a deliberate decision rather than an accident.
 */
const BUDGETS: Array<[string, string, number, number]> = [
  // [name, file, measured gz at time of writing, budget gz]
  ['@stacklatte/chart-web', 'chart-web/dist/index.mjs', 5_860, 8_000],
  ['@stacklatte/chart-native', 'chart-native/dist/index.mjs', 7_990, 10_500],
  ['@stacklatte/chart-angular', 'chart-angular/dist/fesm2022/stacklatte-chart-angular.mjs', 1_480, 3_000],
];

/** The engine's ESM build is code-split, so measure what a bundler actually ships for each entry point. */
const BUNDLED: Array<[string, string, number, number]> = [
  // [name, import statement, measured gz, budget gz]
  ['@stacklatte/chart-engine (whole)', "import * as e from '@stacklatte/chart-engine'; console.log(e);", 8_376, 11_000],
  ['@stacklatte/chart-engine/canvas (ChartController)', "import { ChartController } from '@stacklatte/chart-engine/canvas'; console.log(ChartController);", 11_011, 14_500],
];

describe('bundle size budgets (gzip)', () => {
  it.each(BUDGETS)('%s stays under budget', (_name, file, _measured, budget) => {
    const gz = gzipSync(readFileSync(abs(file))).length;
    expect(gz, `${file} is ${gz} B gzipped (budget ${budget})`).toBeLessThanOrEqual(budget);
  });
});

describe('bundled size budgets (gzip)', () => {
  const require2 = createRequire(import.meta.url);
  const esb = require2('esbuild') as typeof import('esbuild');
  it.each(BUNDLED)('%s stays under budget', async (_name, code, _measured, budget) => {
    const r = await esb.build({ stdin: { contents: code, resolveDir: abs('compat'), loader: 'js' }, bundle: true, minify: true, format: 'esm', write: false, platform: 'browser', treeShaking: true });
    const gz = gzipSync(r.outputFiles[0].contents).length;
    expect(gz, `${gz} B gzipped (budget ${budget})`).toBeLessThanOrEqual(budget);
  });
});

describe('tree shaking', () => {
  const require = createRequire(import.meta.url);
  const esbuild = require('esbuild') as typeof import('esbuild');

  const bundle = async (code: string) => {
    const r = await esbuild.build({
      stdin: { contents: code, resolveDir: abs('compat'), loader: 'js' },
      bundle: true, minify: true, format: 'esm', write: false, treeShaking: true, platform: 'browser',
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    });
    return gzipSync(r.outputFiles[0].contents).length;
  };

  it('importing one indicator pulls in a small fraction of the engine', async () => {
    const one = await bundle(`import { calcRSI } from '@stacklatte/chart-engine'; console.log(calcRSI([], 14));`);
    const all = await bundle(`import * as e from '@stacklatte/chart-engine'; console.log(e);`);
    expect(one, `calcRSI alone: ${one} B vs whole engine: ${all} B`).toBeLessThan(all * 0.25);
    expect(one).toBeLessThan(2_000);
  });

  it('a web app using SLChart ships under 22 kB gzipped including engine + canvas primitives', async () => {
    const size = await bundle(`import { SLChart } from '@stacklatte/chart-web'; console.log(SLChart);`);
    expect(size, `SLChart bundle: ${size} B gz`).toBeLessThan(22_000);
  });
});
