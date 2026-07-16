import { app, BrowserWindow } from 'electron';
import path from 'node:path';

import { getAppPaths } from './utils/app-paths.js';

export function getAppIconPath(): string {
  return path.join(app.getAppPath(), 'resources', 'uvc-logo.png');
}

export class MainApplication {
  private mainWindow: BrowserWindow | null = null;

  createWindow(): BrowserWindow {
    const appPaths = getAppPaths();

    this.mainWindow = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 1120,
      minHeight: 760,
      backgroundColor: '#0c111b',
      title: 'UVC Cube',
      icon: getAppIconPath(),
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: appPaths.preload,
      },
    });

    if (appPaths.devServerUrl) {
      void this.mainWindow.loadURL(appPaths.devServerUrl);
    } else {
      void this.mainWindow.loadFile(path.join(appPaths.renderer, 'index.html'));
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }
}
