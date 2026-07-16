import { contextBridge, ipcRenderer } from 'electron';

import type { ElectronApi } from '@shared/contracts';

const planCall = <T>(operation: string, method: string, params?: unknown): Promise<T> => (
  ipcRenderer.invoke('plan:invoke', operation, method, params)
);

const electronApi: ElectronApi = {
  isElectron: true,
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  getWorkspaceSnapshot: () => ipcRenderer.invoke('workspace:snapshot'),
  getSettingsSections: () => ipcRenderer.invoke('settings:sections'),
  getSettingsSnapshot: () => ipcRenderer.invoke('settings:get'),
  updateSettingsSection: (sectionId: string, values) => ipcRenderer.invoke('settings:updateSection', sectionId, values),
  getDiscoveryRuntimeSnapshot: () => planCall('discovery', 'getRuntime'),
  getCubeIdentity: () => planCall('cubeIdentity', 'get'),
  invokePlan: (operation, method, params) => planCall(operation, method, params),
  onDiscoveryChanged: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('discovery:changed', handler);
    return () => ipcRenderer.removeListener('discovery:changed', handler);
  },
  refreshDiscoveryRuntime: () => planCall('discovery', 'refreshRuntime'),
  setDiscoveryDeviceTrust: (deviceId, trusted) => planCall(
    'discovery',
    'setDeviceTrust',
    {deviceId, trusted},
  ),
  pushDiscoverySettings: () => planCall('discovery', 'pushSettings'),
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);
