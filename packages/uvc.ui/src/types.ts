import type { ComponentType } from 'react';
import type { SettingsSection } from '@refinio/settings.core';

export interface UvcCycleRecord {
  kind?: 'cycle';
  id: string;
  timestamp: number;
  durationMinutes?: number;
  evidenceCount?: number;
  location: string;
  resources: string[];
  status: 'planned' | 'running' | 'completed' | 'failed';
}

export interface UvcDeviceControlRecord {
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

export type UvcJournalRecord = UvcCycleRecord | UvcDeviceControlRecord;

export interface UvcDiscoveryStatus {
  status?: string;
  healthy?: boolean;
  mdns?: {
    serviceType?: string;
    serviceName?: string;
    host?: string;
  };
  discovery?: {
    protocol?: string;
    peersSeen?: number;
    lastScanAt?: string;
  };
}

export interface UvcDevice {
  id: string;
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
  security?: UvcPeerSecurity;
}

export interface UvcPeerSecurity {
  authorization: 'local-owner' | 'paired' | 'signed-provisioning' | 'none';
  identityVerified: boolean;
  connectionState: 'connected' | 'starting' | 'disconnected';
  connectionEnabled: boolean;
  routes: Array<{
    id: string;
    transport: string;
    active: boolean;
    enabled: boolean;
  }>;
  explanation: string;
}

export type UvcLightDeviceKind = 'groov' | 'esp32';

export interface UvcLightState {
  enabled: boolean;
  intensity?: number;
  observedAt?: number;
}

export interface UvcDiscoveryRuntime {
  discoverySource: string;
  status: UvcDiscoveryStatus;
  localInstances: UvcDevice[];
  devices: UvcDevice[];
  config: {
    discovery?: {
      enabled?: boolean;
      mode?: string;
      intervalMs?: number;
      serviceType?: string;
      serviceName?: string;
      domain?: string;
      [key: string]: unknown;
    };
    trust?: Record<string, unknown>;
    [key: string]: unknown;
  };
  fetchedAt: string;
}

export interface UvcMemorySummary {
  id: string;
  title: string;
  summary?: string;
  timestamp: number;
  factsCount: number;
  entitiesCount: number;
}

export interface UvcMemory {
  id: string;
  title: string;
  summary?: string;
  prose: string;
  author: string;
  facts: Array<{ statement: string; confidence: number; sourceRef?: string }>;
  entities: Array<{ name: string; type: string; description?: string }>;
  sourceSubjects: string[];
}

export interface UvcPlatform {
  listMemories(): Promise<UvcMemorySummary[]>;
  getMemory(id: string): Promise<UvcMemory>;
  getSettingsSections(): Promise<SettingsSection[]>;
  listJournalRecords(): Promise<UvcJournalRecord[]>;
  getDiscoveryRuntime(): Promise<UvcDiscoveryRuntime>;
  refreshDiscoveryRuntime(): Promise<UvcDiscoveryRuntime>;
  subscribeDiscovery(listener: () => void): () => void;
  setupDevice(deviceId: string, assignedInstanceName: string): Promise<void>;
  readLight(deviceId: string, kind: UvcLightDeviceKind): Promise<UvcLightState>;
  setLight(deviceId: string, kind: UvcLightDeviceKind, enabled: boolean): Promise<UvcLightState>;
  createPairingInvitation(): Promise<unknown>;
  acceptPairingInvitation(invitation: unknown): Promise<void>;
  setPeerConnectionEnabled(deviceId: string, enabled: boolean): Promise<UvcDiscoveryRuntime>;
}

export interface UvcDevicesViewProps {
  busyDeviceIds: ReadonlySet<string>;
  isRefreshing: boolean;
  onAcceptInvitation(invitation: unknown): Promise<void>;
  onCreateInvitation(): Promise<unknown>;
  onReadLight(deviceId: string, kind: UvcLightDeviceKind): Promise<UvcLightState>;
  onRefresh(): Promise<void>;
  onSetLight(deviceId: string, kind: UvcLightDeviceKind, enabled: boolean): Promise<UvcLightState>;
  onSetupDevice(deviceId: string, assignedInstanceName: string): Promise<void>;
  onSetConnectionEnabled(deviceId: string, enabled: boolean): Promise<void>;
  runtime: UvcDiscoveryRuntime | null;
  runtimeError: string | null;
}

export type UvcDevicesViewComponent = ComponentType<UvcDevicesViewProps>;
