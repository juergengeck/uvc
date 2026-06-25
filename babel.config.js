const path = require('path');

module.exports = function (api) {
  // Cache based on env + platform so web builds don't alias react-native
  const platform = api.caller((caller) => caller && caller.platform);
  api.cache.using(() => `${process.env.NODE_ENV}-${platform}`);

  // Set the environment
  const env = api.env();
  const isWeb = platform === 'web';

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          native: !isWeb,
          jsxRuntime: 'automatic'
        }
      ]
    ],
    plugins: [
      '@babel/plugin-transform-export-namespace-from',
      '@babel/plugin-transform-nullish-coalescing-operator',
      [
        'module-resolver',
        {
          root: ['.', '..'],
          alias: {
            '@app': './app',
            '@src': './src',
            '@': './src',
            // Only alias react-native on native platforms; on web, let Metro
            // resolve to react-native-web via its built-in mapping
            ...(!isWeb && {
              'react-native': './node_modules/react-native'
            })
          },
          extensions: [
            '.web.ts',
            '.web.tsx',
            '.ios.ts',
            '.android.ts',
            '.ts',
            '.ios.tsx',
            '.android.tsx',
            '.tsx',
            '.jsx',
            '.js',
            '.json'
          ]
        }
      ],
      'react-native-reanimated/plugin'
    ],
    env: {
      production: {
        plugins: ['transform-remove-console']
      }
    }
  };
}; 