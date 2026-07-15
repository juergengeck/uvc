import { app, ipcMain } from 'electron';

import type { SettingsValues, SystemInfo } from '@shared/contracts';

import {
  getDiscoveryRuntimeSnapshot,
  pushDiscoverySettings,
  refreshDiscoveryRuntime,
  setDiscoveryDeviceTrust,
} from '../services/headless-authority.js';
import { getCubeSettingsService } from '../services/cube-settings.js';
import { getWorkspaceSnapshot } from '../services/workspace.js';

export function registerIpcHandlers(): void {
  ipcMain.handle('system:info', async (): Promise<SystemInfo> => {
    return {
      appName: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    };
  });

  ipcMain.handle('workspace:snapshot', async () => {
    return getWorkspaceSnapshot();
  });

  ipcMain.handle('settings:sections', async () => {
    return getCubeSettingsService().getSections();
  });

  ipcMain.handle('settings:get', async () => {
    return getCubeSettingsService().getSettings();
  });

  ipcMain.handle('settings:updateSection', async (_event, sectionId: string, values: SettingsValues) => {
    return getCubeSettingsService().updateSection(sectionId, values);
  });

  ipcMain.handle('discovery:getRuntime', async () => {
    return getDiscoveryRuntimeSnapshot();
  });

  ipcMain.handle('discovery:refreshRuntime', async () => {
    return refreshDiscoveryRuntime();
  });

  ipcMain.handle('discovery:setDeviceTrust', async (_event, deviceId: string, trusted: boolean) => {
    return setDiscoveryDeviceTrust(deviceId, trusted);
  });

  ipcMain.handle('discovery:pushSettings', async () => {
    return pushDiscoverySettings();
  });
}
