import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  sourcemap: true,
  minify: true,
  clean: true,
  external: ['@stacklatte/chart-react', 'react', 'react-dom'],
});
