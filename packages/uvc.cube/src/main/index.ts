import { app, BrowserWindow } from 'electron';

import {getAppIconPath, MainApplication} from './app.js';
import { registerIpcHandlers } from './ipc/controller.js';
import {startPeerDirectory, stopPeerDirectory} from './services/peer-directory.js';
import {cubeOneRuntime} from './services/cube-one-runtime.js';
import {getCubeSettingsService} from './services/cube-settings.js';
import {startTestRunnerApi, stopTestRunnerApi} from './services/test-runner-api.js';

const mainApplication = new MainApplication();

app.setName('UVC Cube');

async function start(): Promise<void> {
  if (process.platform === 'darwin') {
    app.dock.setIcon(getAppIconPath());
  }

  const settingsService = getCubeSettingsService();
  const identity = await cubeOneRuntime.init(await settingsService.getSettings());
  settingsService.setInstanceId(identity.instanceId);
  startPeerDirectory(
    identity,
    device => cubeOneRuntime.recordDiscovery(device),
    personId => cubeOneRuntime.isPaired(personId),
    device => cubeOneRuntime.canonicalizeDiscoveredDevice(device),
  );
  registerIpcHandlers();
  await startTestRunnerApi();
  mainApplication.createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainApplication.createWindow();
    }
  });
}

app.whenReady().then(() => {
  void start().catch(error => {
    console.error('[UvcCube] startup failed:', error);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPeerDirectory();
  void stopTestRunnerApi();
  void cubeOneRuntime.shutdown();
});
