const path = require('path');

module.exports = function (api) {
  // Use the current node environment instead of forever caching
  api.cache.using(() => process.env.NODE_ENV);

  // Set the environment
  const env = api.env();
  const isDevClient = env === 'development-client';

  return {
    presets: [
      [
        'babel-preset-expo',
        {
          native: true,
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
            'llama.rn': './node_modules/llama.rn',
            'react-native': './node_modules/react-native'
          },
          extensions: [
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