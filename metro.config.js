// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const oneWorkspaceRoot = path.resolve(projectRoot, '../one');
const expoCompatRoot = path.resolve(projectRoot, 'compat/one-core-expo');
const config = getDefaultConfig(projectRoot);

const linkedPackageRoot = packageName =>
  path.resolve(projectRoot, 'node_modules', ...packageName.split('/'));
const oneLinkedRoot = linkedPackageRoot('@refinio/one.core');
const oneBrowserSystemRoot = path.join(oneLinkedRoot, 'lib/system');
const webCompatModules = {
  '@refinio/one.core-expo/dist/load-expo': path.join(oneBrowserSystemRoot, 'load-browser.js'),
  '@refinio/one.core-expo/dist/load-expo.js': path.join(oneBrowserSystemRoot, 'load-browser.js'),
  '@refinio/one.core/lib/system/expo/buffer': path.join(expoCompatRoot, 'buffer.js'),
  '@refinio/one.core/lib/system/expo/buffer.js': path.join(expoCompatRoot, 'buffer.js'),
  '@refinio/one.core/lib/system/expo/index': path.join(expoCompatRoot, 'buffer.js'),
  '@refinio/one.core/lib/system/expo/index.js': path.join(expoCompatRoot, 'buffer.js'),
  '@refinio/one.core/lib/system/expo/storage-base': path.join(oneBrowserSystemRoot, 'browser/storage-base.js'),
  '@refinio/one.core/lib/system/expo/storage-base.js': path.join(oneBrowserSystemRoot, 'browser/storage-base.js'),
  '@refinio/one.core/lib/system/expo/storage-base-delete-file': path.join(oneBrowserSystemRoot, 'browser/storage-base-delete-file.js'),
  '@refinio/one.core/lib/system/expo/storage-base-delete-file.js': path.join(oneBrowserSystemRoot, 'browser/storage-base-delete-file.js'),
  '@refinio/one.core/lib/system/expo/storage-streams-impl': path.join(oneBrowserSystemRoot, 'browser/storage-streams.js'),
  '@refinio/one.core/lib/system/expo/storage-streams-impl.js': path.join(oneBrowserSystemRoot, 'browser/storage-streams.js'),
  '@refinio/one.core/lib/system/expo/websocket': path.join(oneBrowserSystemRoot, 'browser/websocket.js'),
  '@refinio/one.core/lib/system/expo/websocket.js': path.join(oneBrowserSystemRoot, 'browser/websocket.js'),
  'react-native-fs': path.resolve(projectRoot, 'compat/react-native-fs.web.js'),
  'react-native-udp-direct': path.resolve(projectRoot, 'compat/react-native-udp-direct.web.js'),
};

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
  '@refinio/one.core/lib/system/expo/websocket': path.join(linkedPackageRoot('@refinio/one.core-expo'), 'dist/system/websocket.js'),
  '@refinio/one.core/lib/system/expo/websocket.js': path.join(linkedPackageRoot('@refinio/one.core-expo'), 'dist/system/websocket.js'),
  '@refinio/one.core/lib/system/expo/crypto-helpers': path.join(linkedPackageRoot('@refinio/one.core-expo'), 'dist/system/crypto-helpers.js'),
  '@refinio/one.core/lib/system/expo/crypto-helpers.js': path.join(linkedPackageRoot('@refinio/one.core-expo'), 'dist/system/crypto-helpers.js'),
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
  '@glueone/glue.core': path.resolve(oneWorkspaceRoot, 'packages/glue.core'),
  '@refinio/api': path.resolve(oneWorkspaceRoot, 'packages/refinio.api'),
  '@refinio/connection.btle': path.resolve(oneWorkspaceRoot, 'packages/connection.btle'),
  '@refinio/connection.core': path.resolve(oneWorkspaceRoot, 'packages/connection.core'),
  '@refinio/meaning.core': path.resolve(oneWorkspaceRoot, 'packages/meaning.core'),
  '@refinio/one.core': path.resolve(oneWorkspaceRoot, 'packages/one.core'),
  '@refinio/one.core-expo': path.resolve(oneWorkspaceRoot, 'packages/one.core-expo'),
  '@refinio/one.models': path.resolve(oneWorkspaceRoot, 'packages/one.models'),
  '@refinio/quicvc-protocol': path.resolve(oneWorkspaceRoot, 'packages/quicvc-protocol'),
  '@refinio/settings.core': path.resolve(oneWorkspaceRoot, 'packages/settings.core'),
  '@refinio/trie.core': path.resolve(oneWorkspaceRoot, 'packages/trie.core'),
  '@refinio/uvc.core': path.resolve(oneWorkspaceRoot, 'packages/uvc.core'),
};

const linkedRefinioPackages = Object.fromEntries(
  Object.keys(refinioPackages).map(packageName => [packageName, linkedPackageRoot(packageName)]),
);

function resolveLinkedSourceFile(modulePath, platform) {
  const extensions = [
    ...(platform ? [`.${platform}.ts`, `.${platform}.tsx`, `.${platform}.mjs`, `.${platform}.js`, `.${platform}.jsx`, `.${platform}.json`] : []),
    '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json', '.cjs',
  ];

  if (fs.existsSync(modulePath) && fs.statSync(modulePath).isFile()) {
    return modulePath;
  }
  for (const extension of extensions) {
    const candidate = `${modulePath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  if (fs.existsSync(modulePath) && fs.statSync(modulePath).isDirectory()) {
    const packageJsonPath = path.join(modulePath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const entry = packageJson.module || packageJson.main;
      if (typeof entry === 'string' && entry !== '.' && entry !== './') {
        const resolvedEntry = resolveLinkedSourceFile(path.resolve(modulePath, entry), platform);
        if (resolvedEntry) {
          return resolvedEntry;
        }
      }
    }
    return resolveLinkedSourceFile(path.join(modulePath, 'index'), platform);
  }

  return null;
}

function asLinkedSourceFile(modulePath, platform) {
  const filePath = resolveLinkedSourceFile(modulePath, platform);
  return filePath ? {type: 'sourceFile', filePath} : null;
}

function resolveRefinioPackageSubpath(moduleName) {
  const packageName = Object.keys(refinioPackages)
    .sort((a, b) => b.length - a.length)
    .find(name => moduleName === name || moduleName.startsWith(`${name}/`));

  if (!packageName) {
    return null;
  }

  const packageRoot = linkedRefinioPackages[packageName];
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
    ...new Set(Object.values(refinioPackages)),
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
      if (platform === 'web' && webCompatModules[moduleName]) {
        return asLinkedSourceFile(webCompatModules[moduleName], platform)
          || context.resolveRequest(context, webCompatModules[moduleName], platform);
      }
      if (expoCompatModules[moduleName]) {
        return asLinkedSourceFile(expoCompatModules[moduleName], platform)
          || context.resolveRequest(context, expoCompatModules[moduleName], platform);
      }
      if (platform === 'web' && moduleName === 'react-native') {
        return context.resolveRequest(context, 'react-native-web', platform);
      }
      if (appNativeModules[moduleName]) {
        return context.resolveRequest(context, appNativeModules[moduleName], platform);
      }
      const refinioPath = resolveRefinioPackageSubpath(moduleName);
      if (refinioPath) {
        return asLinkedSourceFile(refinioPath, platform)
          || context.resolveRequest(context, refinioPath, platform);
      }
      if (moduleName.startsWith('.')) {
        for (const [packageName, realPackageRoot] of Object.entries(refinioPackages)) {
          const linkedRoot = linkedRefinioPackages[packageName];
          const originRoot = context.originModulePath.startsWith(linkedRoot)
            ? linkedRoot
            : context.originModulePath.startsWith(realPackageRoot)
              ? realPackageRoot
              : null;
          if (originRoot) {
            const linkedOrigin = path.join(
              linkedRoot,
              path.relative(originRoot, context.originModulePath),
            );
            const linkedResolution = asLinkedSourceFile(
              path.resolve(path.dirname(linkedOrigin), moduleName),
              platform,
            );
            if (linkedResolution) {
              return linkedResolution;
            }
          }
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};
