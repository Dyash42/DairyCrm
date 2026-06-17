// Metro config tuned for this npm-workspaces monorepo.
// It watches the repo root so changes in sibling packages are picked up,
// and resolves modules from both the app's and the root's node_modules
// (npm hoists most deps to the root).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
