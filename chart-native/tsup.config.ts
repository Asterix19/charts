import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // See chart-engine/tsup.config.ts for why declarations are emitted via tsc.
  dts: false,
  sourcemap: true,
  minify: true,
  clean: true,
  treeshake: true,
  external: [
    '@stacklatte/chart-engine',
    'react',
    'react-native',
    '@shopify/react-native-skia',
    'react-native-gesture-handler',
    'react-native-reanimated',
    'react-native-worklets',
  ],
});
