// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // eslint-import-resolver-typescript's "typescript" resolver currently
    // throws ("invalid interface loaded as resolver") under this project's
    // ESLint 9 / TypeScript 7 combo — an upstream compatibility gap, not a
    // real unresolved-import problem (tsc --noEmit already verifies every
    // import, including the "@/*" path aliases, resolves correctly).
    rules: {
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/no-duplicates': 'off',
    },
  },
]);
