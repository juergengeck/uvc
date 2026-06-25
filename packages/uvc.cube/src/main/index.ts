import { app, BrowserWindow } from 'electron';

import { MainApplication } from './app.js';
import { registerIpcHandlers } from './ipc/controller.js';

const mainApplication = new MainApplication();

app.setName('UVC Cube');

async function start(): Promise<void> {
  registerIpcHandlers();
  mainApplication.createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainApplication.createWindow();
    }
  });
}

app.whenReady().then(() => {
  void start();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
