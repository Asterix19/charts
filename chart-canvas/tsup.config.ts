import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // Declarations via `tsc --emitDeclarationOnly` (see chart-engine/tsup.config.ts).
  dts: false,
  sourcemap: true,
  minify: true,
  clean: true,
  treeshake: true,
  external: ['@stacklatte/chart-engine'],
});
