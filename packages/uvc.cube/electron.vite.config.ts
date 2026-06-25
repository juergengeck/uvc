import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const settingsCoreSrc = resolve(__dirname, '../../../one/packages/settings.core/src');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      target: 'node20',
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@settingscore': settingsCoreSrc,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      target: 'node20',
      rollupOptions: {
        output: {
          format: 'cjs',
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@settingscore': settingsCoreSrc,
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@settingscore': settingsCoreSrc,
      },
    },
  },
});
