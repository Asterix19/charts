import { defineConfig } from 'tsup';

export default defineConfig({
  // Three entry points: the pure-logic main entry (no DOM), the Canvas 2D renderer (`@stacklatte/chart-engine/canvas`) and the
  // chart configurator (`@stacklatte/chart-engine/lab`: capability schema, state -> props, code / ChartConfig / AI-prompt generation).
  entry: { index: 'src/index.ts', canvas: 'src/canvas/index.ts', lab: 'src/lab/index.ts' },
  format: ['cjs', 'esm'],
  // Declarations are emitted via `tsc --emitDeclarationOnly` (see "build") —
  // tsup's rollup-plugin-dts does not yet support TypeScript 7's Program API.
  dts: false,
  sourcemap: true,
  minify: true,
  clean: true,
  treeshake: true,
});
