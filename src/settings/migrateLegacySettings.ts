import {SettingsStore} from '@refinio/one.core/lib/system/settings-store.js';
import type {InstanceSettingsStorage} from '@refinio/settings.core';
import * as SecureStore from 'expo-secure-store';

const MIGRATION_VERSION = '1';
const DEVICE_FIELDS = [
  'discoveryEnabled',
  'discoveryPort',
  'discoveryBroadcastInterval',
  'autoConnect',
  'addOnlyConnectedDevices',
  'defaultDataPresentation',
] as const;

export interface LegacySettingsStore {
  getValue(key: string): string | Promise<string>;
}

export interface LegacySettingsMigrationDeps {
  instanceId: string;
  propertyTree: LegacySettingsStore;
  storage: InstanceSettingsStorage;
}

function parseLegacyObject(key: string, serialized: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (cause) {
    throw new Error(`Cannot migrate legacy setting '${key}': invalid JSON`, {cause});
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Cannot migrate legacy setting '${key}': expected an object`);
  }
  return value as Record<string, unknown>;
}

function parseLegacyBoolean(key: string, serialized: string): boolean {
  if (serialized === 'true') {
    return true;
  }
  if (serialized === 'false') {
    return false;
  }
  throw new Error(`Cannot migrate legacy setting '${key}': expected true or false`);
}

function hasLegacyValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function copyKnownDeviceFields(source: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = {};
  for (const key of DEVICE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      migrated[key] = source[key];
    }
  }
  return migrated;
}

/**
 * Move legacy PropertyTree values and the two pre-login boot caches into the
 * typed, instance-scoped settings objects. The marker is written only after
 * every persisted update succeeds.
 */
export async function migrateLegacySettings({
  instanceId,
  propertyTree,
  storage,
}: LegacySettingsMigrationDeps): Promise<void> {
  const markerKey = `uvc.settingsCoreMigration.${instanceId}`;
  const migratedVersion = await SettingsStore.getItem(markerKey);
  if (
    migratedVersion !== null
    && migratedVersion !== undefined
    && String(migratedVersion) === MIGRATION_VERSION
  ) {
    return;
  }
  if (migratedVersion !== null && migratedVersion !== undefined) {
    throw new Error(
      `Unsupported settings migration version '${String(migratedVersion)}' for instance ${instanceId}`,
    );
  }

  const [
    deviceSettingsJson,
    eddaDomain,
    commServerUrl,
    headlessAuthorityUrl,
    propertyTreeDarkMode,
    propertyTreeLanguage,
    cachedLanguage,
    cachedDarkMode,
  ] = await Promise.all([
    propertyTree.getValue('deviceSettings'),
    propertyTree.getValue('eddaDomain'),
    propertyTree.getValue('commServerUrl'),
    propertyTree.getValue('headlessAuthorityUrl'),
    propertyTree.getValue('darkMode'),
    propertyTree.getValue('language'),
    SettingsStore.getItem('app_language'),
    SecureStore.getItemAsync('app_darkMode'),
  ]);

  if (hasLegacyValue(deviceSettingsJson)) {
    const deviceValues = copyKnownDeviceFields(
      parseLegacyObject('deviceSettings', deviceSettingsJson),
    );
    if (Object.keys(deviceValues).length > 0) {
      await storage.updateSection('devices', deviceValues);
    }
  }

  const networkValues: Record<string, unknown> = {};
  if (hasLegacyValue(eddaDomain)) {
    networkValues.eddaDomain = eddaDomain;
  }
  if (hasLegacyValue(commServerUrl)) {
    networkValues.commServerUrl = commServerUrl;
  }
  if (hasLegacyValue(headlessAuthorityUrl)) {
    networkValues.headlessAuthorityUrl = headlessAuthorityUrl;
  }
  if (Object.keys(networkValues).length > 0) {
    await storage.updateSection('network', networkValues);
  }

  const uiValues: Record<string, unknown> = {};
  const language = hasLegacyValue(cachedLanguage)
    ? cachedLanguage
    : propertyTreeLanguage;
  if (hasLegacyValue(language)) {
    uiValues.language = language;
  }
  const darkModeValue = hasLegacyValue(cachedDarkMode)
    ? cachedDarkMode
    : propertyTreeDarkMode;
  if (hasLegacyValue(darkModeValue)) {
    uiValues.darkMode = parseLegacyBoolean('darkMode', darkModeValue);
  }
  if (Object.keys(uiValues).length > 0) {
    await storage.updateSection('ui', uiValues);
  }

  await SettingsStore.setItem(markerKey, MIGRATION_VERSION);
}
