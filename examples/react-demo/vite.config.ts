import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const version = (pkg: string) => JSON.parse(readFileSync(new URL(`../../${pkg}/package.json`, import.meta.url), 'utf8')).version as string;

export default defineConfig({
  plugins: [react()],
  // Shown in the banner so it is obvious which build of which package this page is running.
  define: { __PKG_VERSION__: JSON.stringify(version('chart-react')), __ENGINE_VERSION__: JSON.stringify(version('chart-engine')) },
});
