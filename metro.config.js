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
    },
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@src': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'app'),
    },
  },
};