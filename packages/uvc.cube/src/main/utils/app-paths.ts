import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AppPaths {
  renderer: string;
  preload: string;
  devServerUrl?: string;
}

export function resolveAppPaths(): AppPaths {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;

  if (app.isPackaged) {
    const appPath = app.getAppPath();
    return {
      renderer: path.join(appPath, 'out', 'renderer'),
      preload: path.join(appPath, 'out', 'preload', 'index.cjs'),
    };
  }

  return {
    renderer: path.join(__dirname, '..', 'renderer'),
    preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
    devServerUrl,
  };
}

let cachedPaths: AppPaths | undefined;

export function getAppPaths(): AppPaths {
  cachedPaths ??= resolveAppPaths();
  return cachedPaths;
}
