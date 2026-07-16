export interface SystemInfo {
  appName: string;
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  packaged: boolean;
  electron: string;
  chrome: string;
  node: string;
}

export interface SettingsFieldOption {
  value: string | number | boolean;
  label: string;
}

export type SettingsFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'range'
  | 'password'
  | 'custom';

export interface SettingsFieldSnapshot {
  key: string;
  type: SettingsFieldType;
  label: string;
  description?: string;
  defaultValue: unknown;
  options?: SettingsFieldOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface SettingsSectionSnapshot {
  id: string;
  name: string;
  module: string;
  order?: number;
  fields: SettingsFieldSnapshot[];
}

export type SettingsValues = Record<string, unknown>;
export type SettingsSnapshot = Record<string, SettingsValues>;

export interface WorkspacePackageInfo {
  name: string;
  version: string;
  path: string;
  description?: string;
}

export interface WorkspaceHighlight {
  title: string;
  expectedPackage: string;
  description: string;
  status: 'available' | 'missing';
}

export interface WorkspaceSnapshot {
  rootPath: string;
  packagesPath: string;
  packageCount: number;
  packageNames: string[];
  packages: WorkspacePackageInfo[];
  highlights: WorkspaceHighlight[];
}

export interface DiscoveryStatusSnapshot {
  service?: string;
  role?: string;
  status?: string;
  healthy?: boolean;
  ownerId?: string;
  instanceId?: string;
  updatedAt?: string;
  mdns?: {
    serviceType?: string;
    serviceName?: string;
    host?: string;
    domain?: string;
    txt?: Record<string, string>;
  };
  discovery?: {
    protocol?: string;
    peersSeen?: number;
    lastScanAt?: string;
  };
}

export interface DiscoveryDeviceSnapshot {
  id: string;
  /** ONE Instance id claimed by a standard discovery advertisement. */
  instanceId?: string;
  name?: string;
  type?: string;
  role?: string;
  address?: string;
  port?: number;
  mdnsName?: string;
  online?: boolean;
  connected?: boolean;
  ownerId?: string;
  publicKey?: string;
  lastSeenAt?: string;
  trustState?: string;
  capabilities?: string[];
}

export interface CubeIdentitySnapshot {
  personId: string;
  instanceId: string;
  publicKey: string;
  publicSignKey: string;
  displayName: string;
}

export interface DiscoveryConfigSnapshot {
  discovery?: {
    enabled?: boolean;
    mode?: string;
    intervalMs?: number;
    serviceType?: string;
    serviceName?: string;
    domain?: string;
    [key: string]: unknown;
  };
  trust?: {
    autoTrustKnownDevices?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DiscoveryRuntimeSnapshot {
  discoverySource: string;
  status: DiscoveryStatusSnapshot;
  devices: DiscoveryDeviceSnapshot[];
  config: DiscoveryConfigSnapshot;
  fetchedAt: string;
}

export interface DiscoverySettingsPushResult {
  config: DiscoveryConfigSnapshot;
  runtime: DiscoveryRuntimeSnapshot;
}

export interface ElectronApi {
  isElectron: boolean;
  getSystemInfo: () => Promise<SystemInfo>;
  getWorkspaceSnapshot: () => Promise<WorkspaceSnapshot>;
  getSettingsSections: () => Promise<SettingsSectionSnapshot[]>;
  getSettingsSnapshot: () => Promise<SettingsSnapshot>;
  updateSettingsSection: (sectionId: string, values: SettingsValues) => Promise<SettingsSnapshot>;
  getDiscoveryRuntimeSnapshot: () => Promise<DiscoveryRuntimeSnapshot>;
  getCubeIdentity: () => Promise<CubeIdentitySnapshot>;
  invokePlan: <T = unknown>(operation: string, method: string, params?: unknown) => Promise<T>;
  onDiscoveryChanged: (listener: () => void) => () => void;
  refreshDiscoveryRuntime: () => Promise<DiscoveryRuntimeSnapshot>;
  setDiscoveryDeviceTrust: (deviceId: string, trusted: boolean) => Promise<DiscoveryRuntimeSnapshot>;
  pushDiscoverySettings: () => Promise<DiscoverySettingsPushResult>;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}
