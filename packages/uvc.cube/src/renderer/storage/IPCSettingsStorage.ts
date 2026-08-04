import {
  type AllSettings,
  type SectionValues,
  type SettingsPlanStorage,
  type TargetKind,
  type TargetRef,
} from '@refinio/settings.core';

import type { ElectronApi } from '@shared/contracts';

type SettingsListener = (settings: AllSettings) => void;

export class IPCSettingsStorage implements SettingsPlanStorage {
  private readonly listeners = new Set<SettingsListener>();
  private cachedSettings: AllSettings | null = null;

  constructor(private readonly api: ElectronApi) {}

  async get(): Promise<AllSettings> {
    const { settings } = await this.api.invokePlan<{ settings: AllSettings }>('settings', 'getAll');
    this.cachedSettings = settings;
    return this.cachedSettings;
  }

  async getSection(moduleId: string): Promise<SectionValues> {
    const { values } = await this.api.invokePlan<{ values: SectionValues }>('settings', 'getSection', { moduleId });
    return values;
  }

  async updateSection(moduleId: string, values: Partial<SectionValues>): Promise<AllSettings> {
    const { settings } = await this.api.invokePlan<{ settings: AllSettings }>('settings', 'updateSection', {
      moduleId,
      values,
    });
    this.commit(settings);
    return settings;
  }

  async updateField(moduleId: string, key: string, value: unknown): Promise<AllSettings> {
    const { settings } = await this.api.invokePlan<{ settings: AllSettings }>('settings', 'updateField', {
      moduleId,
      key,
      value,
    });
    this.commit(settings);
    return settings;
  }

  async resetSection(moduleId: string): Promise<AllSettings> {
    const { settings } = await this.api.invokePlan<{ settings: AllSettings }>('settings', 'resetSection', { moduleId });
    this.commit(settings);
    return settings;
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  invalidateCache(): void {
    this.cachedSettings = null;
    void this.api.invokePlan('settings', 'invalidateCache');
  }

  getTargetRef(): TargetRef {
    throw new Error('[IPCSettingsStorage] Target metadata is owned by the main-process SettingsPlan');
  }

  getTargetKind(): TargetKind {
    throw new Error('[IPCSettingsStorage] Target metadata is owned by the main-process SettingsPlan');
  }

  private commit(settings: AllSettings): void {
    this.cachedSettings = settings;
    for (const listener of this.listeners) listener(settings);
  }
}
