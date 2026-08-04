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

export interface CubeUvcCycleRecord {
  kind?: 'cycle';
  id: string;
  timestamp: number;
  durationMinutes?: number;
  evidenceCount?: number;
  location: string;
  resources: string[];
  status: 'planned' | 'running' | 'completed' | 'failed';
}

export interface CubeUvcDeviceControlRecord {
  kind: 'device-control';
  id: string;
  timestamp: number;
  evidenceCount: number;
  location: string;
  resources: string[];
  status: 'completed' | 'failed';
  operation: 'set';
  desiredEnabled: boolean;
  observedEnabled?: boolean;
  error?: string;
}

export type CubeUvcJournalRecord = CubeUvcCycleRecord | CubeUvcDeviceControlRecord;

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
  /** ONE instances advertised by this host. They are local context, not peers. */
  localInstances: DiscoveryDeviceSnapshot[];
  /** Remote instances eligible for discovery, setup, and pairing. */
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
  getSettingsSections: () => Promise<SettingsSectionSnapshot[]>;
  getDiscoveryRuntimeSnapshot: () => Promise<DiscoveryRuntimeSnapshot>;
  getCubeIdentity: () => Promise<CubeIdentitySnapshot>;
  invokePlan: <T = unknown>(operation: string, method: string, params?: unknown) => Promise<T>;
  onDiscoveryChanged: (listener: () => void) => () => void;
  refreshDiscoveryRuntime: () => Promise<DiscoveryRuntimeSnapshot>;
  setDiscoveryDeviceTrust: (deviceId: string, trusted: boolean) => Promise<DiscoveryRuntimeSnapshot>;
  pushDiscoverySettings: () => Promise<DiscoverySettingsPushResult>;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}
