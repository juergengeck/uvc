import type { SettingsSection } from '@refinio/settings.core';
import type {
  UvcJournalRecord,
  UvcMemory,
  UvcMemorySummary,
  UvcDiscoveryRuntime,
  UvcLightDeviceKind,
  UvcLightState,
  UvcPlatform,
} from '@uvc/uvc.ui';

import type { ElectronApi, UvcPeerManagementSnapshot } from '@shared/contracts';

interface UvcControlObservationProjection {
  status: 'observed' | 'failed';
  enabled?: boolean;
  intensity?: number;
  observedAt?: number;
  error?: string;
}

export class ElectronUvcPlatform implements UvcPlatform {
  constructor(private readonly api: ElectronApi) {}

  async getSettingsSections(): Promise<SettingsSection[]> {
    const sections = await this.api.getSettingsSections();
    return sections.map(section => ({
      id: section.id,
      name: section.name,
      module: section.module,
      order: section.order,
      fields: section.fields.map(field => ({
        key: field.key,
        type: field.type,
        label: field.label,
        description: field.description,
        default: field.defaultValue,
        options: field.options,
        min: field.min,
        max: field.max,
        step: field.step,
      })),
    }));
  }

  listJournalRecords(): Promise<UvcJournalRecord[]> {
    return this.api.invokePlan<UvcJournalRecord[]>('journal', 'listRecords');
  }

  listMemories(): Promise<UvcMemorySummary[]> {
    return this.api.invokePlan<UvcMemorySummary[]>('memory', 'list');
  }

  getMemory(id: string): Promise<UvcMemory> {
    return this.api.invokePlan<UvcMemory>('memory', 'get', { id });
  }

  async getDiscoveryRuntime(): Promise<UvcDiscoveryRuntime> {
    return this.withPeerSecurity(await this.api.getDiscoveryRuntimeSnapshot());
  }

  private async withPeerSecurity(runtime: UvcDiscoveryRuntime): Promise<UvcDiscoveryRuntime> {
    const peers = await this.api.invokePlan<UvcPeerManagementSnapshot[]>('peerManagement', 'list');
    const securityByDevice = new Map(peers.map(peer => [peer.deviceId, peer.security]));
    return { ...runtime, devices: runtime.devices.map(device => ({ ...device, security: securityByDevice.get(device.id) })) };
  }

  async setPeerConnectionEnabled(deviceId: string, enabled: boolean): Promise<UvcDiscoveryRuntime> {
    await this.api.invokePlan('peerManagement', 'setConnectionEnabled', { deviceId, enabled });
    return this.getDiscoveryRuntime();
  }

  async refreshDiscoveryRuntime(): Promise<UvcDiscoveryRuntime> {
    return this.withPeerSecurity(await this.api.refreshDiscoveryRuntime());
  }

  subscribeDiscovery(listener: () => void): () => void {
    return this.api.onDiscoveryChanged(listener);
  }

  async setupDevice(deviceId: string, assignedInstanceName: string): Promise<void> {
    await this.api.invokePlan('headlessProvisioning', 'provision', {
      deviceId,
      assignedInstanceName,
    });
  }

  async readLight(deviceId: string, kind: UvcLightDeviceKind): Promise<UvcLightState> {
    return this.requireObservedLight(await this.api.invokePlan<UvcControlObservationProjection>(
      'deviceControl',
      'readLight',
      {deviceId, kind},
    ));
  }

  async setLight(
    deviceId: string,
    kind: UvcLightDeviceKind,
    enabled: boolean,
  ): Promise<UvcLightState> {
    return this.requireObservedLight(await this.api.invokePlan<UvcControlObservationProjection>(
      'deviceControl',
      'setLight',
      {deviceId, kind, enabled},
    ));
  }

  createPairingInvitation(): Promise<unknown> {
    return this.api.invokePlan('pairing', 'createInvitation');
  }

  async acceptPairingInvitation(invitation: unknown): Promise<void> {
    await this.api.invokePlan('pairing', 'connectUsingInvitation', invitation);
  }

  private requireObservedLight(observation: UvcControlObservationProjection): UvcLightState {
    if (observation.status !== 'observed' || typeof observation.enabled !== 'boolean') {
      throw new Error(observation.error ?? 'The device did not return an observed LED state.');
    }
    return {
      enabled: observation.enabled,
      ...(observation.intensity !== undefined ? {intensity: observation.intensity} : {}),
      ...(observation.observedAt !== undefined ? {observedAt: observation.observedAt} : {}),
    };
  }
}
