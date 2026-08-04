import type { SettingsSection } from '@refinio/settings.core';
import type {
  UvcJournalRecord,
  UvcDiscoveryRuntime,
  UvcLightDeviceKind,
  UvcLightState,
  UvcPlatform,
} from '@uvc/uvc.ui';

import type { ElectronApi } from '@shared/contracts';

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

  getDiscoveryRuntime(): Promise<UvcDiscoveryRuntime> {
    return this.api.getDiscoveryRuntimeSnapshot();
  }

  refreshDiscoveryRuntime(): Promise<UvcDiscoveryRuntime> {
    return this.api.refreshDiscoveryRuntime();
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
