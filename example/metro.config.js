const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// The library is a symlink to the repo root; resolve its dependencies from here.
const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);
config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
