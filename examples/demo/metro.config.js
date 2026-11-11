// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so Metro sees changes in local packages
config.watchFolders = [workspaceRoot];

// Resolve modules from the workspace root first, then the project
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prefer the app's own node_modules for singleton packages
// This prevents React / RN from being loaded twice
config.resolver.disableHierarchicalLookup = false;

// Comparison runs (e2e-native/compare-chart-core.mjs): serve the demo's `@stacklatte/chart-native` imports from a
// different implementation so the SAME app can be driven against the legacy package.
//   CHART_IMPL=core-shim       → this repo's @stacklatte/chart-core (the thin re-export existing users will upgrade to)
//   CHART_IMPL=core-published  → the actually published @stacklatte/chart-core@2.3.3 (downloaded into compat/.cache)
const IMPL = {
  'core-shim': path.resolve(workspaceRoot, 'chart-core'),
  'core-published': path.resolve(workspaceRoot, 'compat/.cache/chart-core-2.3.3/package'),
};
const target = IMPL[process.env.CHART_IMPL ?? ''];
if (target) {
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Only the demo app's own imports are redirected — the shim must still resolve ITS chart-native import normally.
    const fromDemo = (context.originModulePath ?? '').startsWith(projectRoot);
    const name = moduleName === '@stacklatte/chart-native' && fromDemo ? target : moduleName;
    return (upstream ?? context.resolveRequest)(context, name, platform);
  };
}

module.exports = config;
