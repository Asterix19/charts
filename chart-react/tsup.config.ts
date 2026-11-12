import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // Declarations are emitted separately via `tsc --emitDeclarationOnly` (see the
  // "build" script) — tsup's bundled rollup-plugin-dts does not yet support
  // TypeScript 7's Program API (throws on `useCaseSensitiveFileNames`).
  dts: false,
  sourcemap: true,
  minify: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom'],
});
