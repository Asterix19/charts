import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/core.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  sourcemap: true,
  minify: true,
  clean: true,
  external: [
    '@stacklatte/chart-native',
    '@stacklatte/chart-engine',
    'react',
    'react-native',
    '@shopify/react-native-skia',
    'react-native-gesture-handler',
  ],
});
