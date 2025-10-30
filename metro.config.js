// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

module.exports = {
  ...config,
  projectRoot,
  resolver: {
    ...config.resolver,
    // Disable unstable features that might cause module path issues
    unstable_enablePackageExports: false,
    unstable_enableSymlinks: false,
    extraNodeModules: {
      buffer: require.resolve('buffer'),
      // Redirect Node.js modules to empty stubs
      dgram: path.resolve(__dirname, 'src/stubs/empty-module.js'),
      crypto: require.resolve('expo-crypto'),
    },
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@src': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'app'),
    },
    // Block Node.js-specific files from being bundled (if they exist)
    blockList: [],
  },
};