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
      // Force all @refinio/one.core imports to resolve to root node_modules
      '@refinio/one.core': path.resolve(__dirname, 'node_modules/@refinio/one.core'),
      expo: path.resolve(__dirname, 'node_modules/expo'),
      'expo-crypto': path.resolve(__dirname, 'node_modules/expo-crypto'),
      'expo-secure-store': path.resolve(__dirname, 'node_modules/expo-secure-store'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
      'react-native-ble-plx': path.resolve(__dirname, 'node_modules/react-native-ble-plx'),
      'react-native-fs': path.resolve(__dirname, 'node_modules/react-native-fs'),
      react: path.resolve(__dirname, 'node_modules/react'),
    },
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@src': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'app'),
    },
    // Map react-native to react-native-web for web platform builds
    resolveRequest: (context, moduleName, platform) => {
      if (platform === 'web' && moduleName === 'react-native') {
        return context.resolveRequest(context, 'react-native-web', platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};
