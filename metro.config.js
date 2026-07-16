// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const oneWorkspaceRoot = path.resolve(projectRoot, '../one');
const expoCompatRoot = path.resolve(projectRoot, 'compat/one-core-expo');
const config = getDefaultConfig(projectRoot);

const expoCompatModules = {
  '@refinio/one.core-expo/dist/load-expo': path.join(expoCompatRoot, 'load-expo.js'),
  '@refinio/one.core-expo/dist/load-expo.js': path.join(expoCompatRoot, 'load-expo.js'),
  '@refinio/one.core/lib/system/expo/buffer': path.join(expoCompatRoot, 'buffer.js'),
  '@refinio/one.core/lib/system/expo/buffer.js': path.join(expoCompatRoot, 'buffer.js'),
  '@refinio/one.core/lib/system/expo/index': path.join(expoCompatRoot, 'index.js'),
  '@refinio/one.core/lib/system/expo/index.js': path.join(expoCompatRoot, 'index.js'),
  '@refinio/one.core/lib/system/expo/storage-base': path.join(expoCompatRoot, 'storage-base.js'),
  '@refinio/one.core/lib/system/expo/storage-base.js': path.join(expoCompatRoot, 'storage-base.js'),
  '@refinio/one.core/lib/system/expo/storage-base-delete-file': path.join(expoCompatRoot, 'storage-base-delete-file.js'),
  '@refinio/one.core/lib/system/expo/storage-base-delete-file.js': path.join(expoCompatRoot, 'storage-base-delete-file.js'),
  '@refinio/one.core/lib/system/expo/storage-streams-impl': path.join(expoCompatRoot, 'storage-streams-impl.js'),
  '@refinio/one.core/lib/system/expo/storage-streams-impl.js': path.join(expoCompatRoot, 'storage-streams-impl.js'),
  '@refinio/one.core/lib/system/expo/websocket': path.resolve(oneWorkspaceRoot, 'packages/one.core-expo/dist/system/websocket.js'),
  '@refinio/one.core/lib/system/expo/websocket.js': path.resolve(oneWorkspaceRoot, 'packages/one.core-expo/dist/system/websocket.js'),
  '@refinio/one.core/lib/system/expo/crypto-helpers': path.resolve(oneWorkspaceRoot, 'packages/one.core-expo/dist/system/crypto-helpers.js'),
  '@refinio/one.core/lib/system/expo/crypto-helpers.js': path.resolve(oneWorkspaceRoot, 'packages/one.core-expo/dist/system/crypto-helpers.js'),
};

const appNativeModules = {
  'base64-js': path.resolve(projectRoot, 'node_modules/base64-js'),
  expo: path.resolve(projectRoot, 'node_modules/expo'),
  'expo-crypto': path.resolve(projectRoot, 'node_modules/expo-crypto'),
  'expo-file-system': path.resolve(projectRoot, 'node_modules/expo-file-system'),
  'expo-secure-store': path.resolve(projectRoot, 'node_modules/expo-secure-store'),
  'isomorphic-ws': path.resolve(projectRoot, 'node_modules/isomorphic-ws'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  'react-native-ble-plx': path.resolve(projectRoot, 'node_modules/react-native-ble-plx'),
  'react-native-fs': path.resolve(projectRoot, 'node_modules/react-native-fs'),
  react: path.resolve(projectRoot, 'node_modules/react'),
  'scrypt-js': path.resolve(projectRoot, 'node_modules/scrypt-js'),
  tweetnacl: path.resolve(projectRoot, 'node_modules/tweetnacl'),
};

const refinioPackages = {
  '@refinio/api': path.resolve(oneWorkspaceRoot, 'packages/refinio.api'),
  '@refinio/connection.btle': path.resolve(oneWorkspaceRoot, 'packages/connection.btle'),
  '@refinio/connection.core': path.resolve(oneWorkspaceRoot, 'packages/connection.core'),
  '@refinio/one.core': path.resolve(oneWorkspaceRoot, 'packages/one.core'),
  '@refinio/one.core-expo': path.resolve(oneWorkspaceRoot, 'packages/one.core-expo'),
  '@refinio/one.models': path.resolve(oneWorkspaceRoot, 'packages/one.models'),
  '@refinio/quicvc-protocol': path.resolve(oneWorkspaceRoot, 'packages/quicvc-protocol'),
};

function resolveRefinioPackageSubpath(moduleName) {
  const packageName = Object.keys(refinioPackages)
    .sort((a, b) => b.length - a.length)
    .find(name => moduleName === name || moduleName.startsWith(`${name}/`));

  if (!packageName) {
    return null;
  }

  const packageRoot = refinioPackages[packageName];
  const subpath = moduleName.slice(packageName.length + 1);
  if (packageName === '@refinio/connection.core' && subpath) {
    return subpath === 'recipes'
      ? path.join(packageRoot, 'dist/esm/recipes/index.js')
      : path.join(packageRoot, 'dist/esm', subpath);
  }
  return subpath ? path.join(packageRoot, subpath) : packageRoot;
}

module.exports = {
  ...config,
  projectRoot,
  watchFolders: [
    ...(config.watchFolders || []),
    oneWorkspaceRoot,
  ],
  resolver: {
    ...config.resolver,
    // The @refinio packages are linked from ../one via file: dependencies.
    // Metro must follow those symlinks and watch the target workspace.
    unstable_enablePackageExports: false,
    unstable_enableSymlinks: true,
    extraNodeModules: {
      buffer: require.resolve('buffer'),
      ...refinioPackages,
      ...appNativeModules,
    },
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@src': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'app'),
    },
    // Map react-native to react-native-web for web platform builds
    resolveRequest: (context, moduleName, platform) => {
      if (expoCompatModules[moduleName]) {
        return context.resolveRequest(context, expoCompatModules[moduleName], platform);
      }
      if (platform === 'web' && moduleName === 'react-native') {
        return context.resolveRequest(context, 'react-native-web', platform);
      }
      if (appNativeModules[moduleName]) {
        return context.resolveRequest(context, appNativeModules[moduleName], platform);
      }
      const refinioPath = resolveRefinioPackageSubpath(moduleName);
      if (refinioPath) {
        return context.resolveRequest(context, refinioPath, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};
