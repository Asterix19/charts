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

module.exports = config;
