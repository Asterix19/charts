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

// Comparison runs (e2e-native/compare-chart-core.mjs): serve the demo's `@stacklatte/chart-native` imports from the last
// published (now deprecated) @stacklatte/chart-core@2.3.3, downloaded into compat/.cache, so the SAME app can be driven
// against what people still have installed.
//   CHART_IMPL=core-published
const IMPL = {
  'core-published': path.resolve(workspaceRoot, 'compat/.cache/chart-core-2.3.3/package'),
};
const target = IMPL[process.env.CHART_IMPL ?? ''];
if (target) {
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Only the demo app's own imports are redirected — the old package's own imports resolve normally.
    const fromDemo = (context.originModulePath ?? '').startsWith(projectRoot);
    const name = moduleName === '@stacklatte/chart-native' && fromDemo ? target : moduleName;
    return (upstream ?? context.resolveRequest)(context, name, platform);
  };
}

module.exports = config;
