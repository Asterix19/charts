import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // Declarations are emitted via `tsc --emitDeclarationOnly` (see "build") —
  // tsup's rollup-plugin-dts does not yet support TypeScript 7's Program API.
  dts: false,
  sourcemap: true,
  minify: true,
  clean: true,
  treeshake: true,
});
