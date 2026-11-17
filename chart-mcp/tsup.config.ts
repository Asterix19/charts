import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts', server: 'src/server.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  // The MCP SDK and zod stay external (installed as dependencies); the engine is bundled-free too.
  external: ['@modelcontextprotocol/sdk', 'zod', '@stacklatte/chart-engine'],
});
