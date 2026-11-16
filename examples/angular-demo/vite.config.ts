import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const version = (pkg: string) => JSON.parse(readFileSync(new URL(`../../${pkg}/package.json`, import.meta.url), 'utf8')).version as string;

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
  // Shown in the banner so it is obvious which build of which package this page is running.
  define: { __PKG_VERSION__: JSON.stringify(version('chart-angular')), __ENGINE_VERSION__: JSON.stringify(version('chart-engine')) },
});
