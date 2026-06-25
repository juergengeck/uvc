import { contextBridge, ipcRenderer } from 'electron';

import type { ElectronApi } from '@shared/contracts';

const electronApi: ElectronApi = {
  isElectron: true,
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getWorkspaceSnapshot: () => ipcRenderer.invoke('workspace:snapshot'),
  getSettingsSections: () => ipcRenderer.invoke('settings:sections'),
  getSettingsSnapshot: () => ipcRenderer.invoke('settings:get'),
  updateSettingsSection: (sectionId: string, values) => ipcRenderer.invoke('settings:updateSection', sectionId, values),
  getDiscoveryRuntimeSnapshot: () => ipcRenderer.invoke('discovery:getRuntime'),
  refreshDiscoveryRuntime: () => ipcRenderer.invoke('discovery:refreshRuntime'),
  pushDiscoverySettings: () => ipcRenderer.invoke('discovery:pushSettings'),
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);
