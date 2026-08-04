import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {Instance} from '@refinio/one.core/lib/recipes.js';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';

import {
  SettingsRegistry,
  createInstanceTargetRef,
  type AllSettings,
  type SectionValues,
  type SettingsPlanStorage,
  type TargetKind,
  type TargetRef,
} from '@refinio/settings.core';

import type { SettingsFieldSnapshot, SettingsSectionSnapshot, SettingsSnapshot, SettingsValues } from '@shared/contracts';
import {
  DEFAULT_UVC_COMM_SERVER_URL,
  LEGACY_UVC_COMM_SERVER_URL,
  ensureUvcSettingsSectionsRegistered,
  getSettingsDefaults,
} from '@shared/settings/registry';

function cloneSettings<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

class CubeSettingsService implements SettingsPlanStorage {
  private cachedSettings: SettingsSnapshot | null = null;
  private instanceId: SHA256IdHash<Instance> | null = null;
  private readonly listeners = new Set<(settings: AllSettings) => void>();

  constructor() {
    ensureUvcSettingsSectionsRegistered();
  }

  public setInstanceId(instanceId: string): void {
    this.instanceId = instanceId as SHA256IdHash<Instance>;
  }

  private get settingsPath(): string {
    return path.join(app.getPath('userData'), 'uvc-cube-settings.json');
  }

  public async getSettings(): Promise<SettingsSnapshot> {
    if (this.cachedSettings) {
      return cloneSettings(this.cachedSettings);
    }

    const defaults = getSettingsDefaults();

    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      const parsed = JSON.parse(raw) as SettingsSnapshot;
      const merged = this.mergeWithDefaults(parsed, defaults);
      const identitySettings = merged['uvc.identity'];
      if (identitySettings?.commServerUrl === LEGACY_UVC_COMM_SERVER_URL) {
        identitySettings.commServerUrl = DEFAULT_UVC_COMM_SERVER_URL;
        await this.persist(merged);
        return cloneSettings(merged);
      }
      this.cachedSettings = merged;
      return cloneSettings(merged);
    } catch (cause) {
      if (!isMissingFileError(cause)) {
        throw cause;
      }
      const defaultsClone = cloneSettings(defaults);
      await this.persist(defaultsClone);
      return defaultsClone;
    }
  }

  public async updateSection(sectionId: string, values: SettingsValues): Promise<SettingsSnapshot> {
    const current = await this.getSettings();
    const section = SettingsRegistry.getSection(sectionId);
    if (!section) {
      throw new Error(`Unknown settings section: ${sectionId}`);
    }

    const nextSection = { ...(current[sectionId] ?? {}), ...values };
    const validationErrors = SettingsRegistry.validateSection(sectionId, nextSection);
    if (validationErrors.size > 0) {
      throw new Error(Array.from(validationErrors.values()).join('\n'));
    }

    const next = {
      ...current,
      [sectionId]: nextSection,
    };

    await this.persist(next);
    return cloneSettings(next);
  }

  public getSections(): SettingsSectionSnapshot[] {
    ensureUvcSettingsSectionsRegistered();
    return SettingsRegistry.getSections().map((section) => ({
      id: section.id,
      name: section.name,
      module: section.module,
      order: section.order,
      fields: section.fields.map<SettingsFieldSnapshot>((field) => ({
        key: field.key,
        type: field.type,
        label: field.label,
        description: field.description,
        defaultValue: field.default,
        options: field.options,
        min: field.min,
        max: field.max,
        step: field.step,
      })),
    }));
  }

  public get(): Promise<AllSettings> {
    return this.getSettings();
  }

  public async getSection(moduleId: string): Promise<SectionValues> {
    const settings = await this.getSettings();
    return settings[moduleId] ?? {};
  }

  public updateField(moduleId: string, key: string, value: unknown): Promise<AllSettings> {
    return this.updateSection(moduleId, { [key]: value });
  }

  public async resetSection(moduleId: string): Promise<AllSettings> {
    const section = SettingsRegistry.getSection(moduleId);
    if (!section) {
      throw new Error(`Unknown settings section: ${moduleId}`);
    }
    return this.updateSection(moduleId, SettingsRegistry.getSectionDefaults(section));
  }

  public subscribe(listener: (settings: AllSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public invalidateCache(): void {
    this.cachedSettings = null;
  }

  public getTargetRef(): TargetRef {
    if (!this.instanceId) {
      throw new Error('[CubeSettingsService] ONE instance id is not available yet');
    }
    return createInstanceTargetRef(this.instanceId);
  }

  public getTargetKind(): TargetKind {
    return 'instance';
  }

  public getInstanceIdHash(): SHA256IdHash<Instance> {
    if (!this.instanceId) {
      throw new Error('[CubeSettingsService] ONE instance id is not available yet');
    }
    return this.instanceId;
  }

  private mergeWithDefaults(settings: SettingsSnapshot, defaults: AllSettings): SettingsSnapshot {
    const merged: SettingsSnapshot = {};

    for (const [sectionId, defaultValues] of Object.entries(defaults)) {
      merged[sectionId] = {
        ...cloneSettings(defaultValues),
        ...(settings[sectionId] ?? {}),
      };
    }

    for (const [sectionId, values] of Object.entries(settings)) {
      if (!merged[sectionId]) {
        merged[sectionId] = values;
      }
    }

    return merged;
  }

  private async persist(settings: SettingsSnapshot): Promise<void> {
    this.cachedSettings = cloneSettings(settings);
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    for (const listener of this.listeners) {
      listener(cloneSettings(settings));
    }
  }
}

function isMissingFileError(cause: unknown): cause is NodeJS.ErrnoException {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

let cubeSettingsService: CubeSettingsService | null = null;

export function getCubeSettingsService(): CubeSettingsService {
  cubeSettingsService ??= new CubeSettingsService();
  return cubeSettingsService;
}
