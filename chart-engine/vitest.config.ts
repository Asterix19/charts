import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Logic tests run in node; the canvas/ tests opt in to jsdom with a `@vitest-environment jsdom` docblock.
    environment: 'node',
    setupFiles: ['./src/canvas/testUtils/setup.ts'],
  },
});
