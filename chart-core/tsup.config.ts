import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  minify: true,
  clean: true,
  treeshake: true,
  external: [
    'react',
    'react-native',
    '@shopify/react-native-skia',
    'react-native-gesture-handler',
    'react-native-reanimated',
    'react-native-worklets',
  ],
});
