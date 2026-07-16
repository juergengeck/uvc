import { app, BrowserWindow, ipcMain } from 'electron';

import type { SettingsValues, SystemInfo } from '@shared/contracts';

import { getCubeSettingsService } from '../services/cube-settings.js';
import { getWorkspaceSnapshot } from '../services/workspace.js';
import {invokeUvcPlan, registerUvcPlans} from '../registry/uvc-plan-registry.js';
import {onPeerDirectoryChanged} from '../services/peer-directory.js';

export function registerIpcHandlers(): void {
  registerUvcPlans();
  ipcMain.handle('plan:invoke', async (_event, operation: string, method: string, params?: unknown) => (
    invokeUvcPlan(operation, method, params)
  ));
  onPeerDirectoryChanged(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('discovery:changed');
    }
  });
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

}
