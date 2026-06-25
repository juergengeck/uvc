import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import { SettingsRegistry, type AllSettings } from '@settingscore/registry/SettingsRegistry.ts';

import type { SettingsFieldSnapshot, SettingsSectionSnapshot, SettingsSnapshot, SettingsValues } from '@shared/contracts';
import { ensureUvcSettingsSectionsRegistered, getSettingsDefaults } from '@shared/settings/registry';

function cloneSettings<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

class CubeSettingsService {
  private cachedSettings: SettingsSnapshot | null = null;

  constructor() {
    ensureUvcSettingsSectionsRegistered();
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
      this.cachedSettings = merged;
      return cloneSettings(merged);
    } catch {
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
  }
}

let cubeSettingsService: CubeSettingsService | null = null;

export function getCubeSettingsService(): CubeSettingsService {
  cubeSettingsService ??= new CubeSettingsService();
  return cubeSettingsService;
}
