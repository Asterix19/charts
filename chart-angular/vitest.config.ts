import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup.ts'],
  },
  // Components are JIT-compiled in tests; decorators need the legacy transform.
  esbuild: { target: 'es2022', tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } } },
});
