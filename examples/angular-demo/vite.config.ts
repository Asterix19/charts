import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Consume the ng-packagr *build output* (what npm users get), not the source.
      '@stacklatte/chart-angular': fileURLToPath(
        new URL('../../chart-angular/dist/fesm2022/stacklatte-chart-angular.mjs', import.meta.url),
      ),
    },
  },
  // The demo component is JIT-compiled (partial-compiled library code is linked at runtime
  // by @angular/compiler), so decorators use the legacy (experimentalDecorators) transform.
  // Vite 8 transpiles TypeScript with oxc, hence `oxc` (not `esbuild`).
  oxc: { decorator: { legacy: true } },
});
