import { BrowserWindow, ipcMain } from 'electron';

import { getCubeSettingsService } from '../services/cube-settings.js';
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
  ipcMain.handle('settings:sections', async () => {
    return getCubeSettingsService().getSections();
  });

}
