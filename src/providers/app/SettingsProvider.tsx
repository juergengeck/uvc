import React, {createContext, useCallback, useContext, useMemo} from 'react';
import {
  SettingsProvider as CoreSettingsProvider,
  useSettingsContext,
} from '@refinio/settings.core';
import type {AllSettings, SectionValues} from '@refinio/settings.core';
import type {DeviceConfig, DeviceSettingsGroup} from '@src/types/device';
import i18n, {setStoredLanguage} from '@src/i18n/config';
import {setStoredDarkMode} from './AppTheme';
import {useInstance} from './useInstance';
import {
  getUvcDeviceSettingsDefaults,
  type UvcSupportedLanguage,
} from '@src/settings/uvcSettingsSections';

interface SettingsContextType {
  language: UvcSupportedLanguage;
  setLanguage: (language: UvcSupportedLanguage) => Promise<void>;
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => Promise<void>;
  deviceConfig: DeviceConfig;
  deviceSettings: DeviceSettingsGroup;
  updateDeviceConfig: (config: Partial<DeviceConfig>) => Promise<void>;
  updateDeviceSettings: (settings: Partial<DeviceSettingsGroup>) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  importSettings: (settings: unknown) => Promise<void>;
  exportSettings: () => Promise<string>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

const DEVICE_SETTING_KEYS = [
  'discoveryEnabled',
  'discoveryPort',
  'discoveryBroadcastInterval',
  'autoConnect',
  'addOnlyConnectedDevices',
  'defaultDataPresentation',
] as const;

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

function selectDeviceSettings(
  settings: Partial<DeviceSettingsGroup> | Partial<DeviceConfig>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const key of DEVICE_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      values[key] = settings[key];
    }
  }
  return values;
}

function SettingsContextAdapter({children}: {children: React.ReactNode}) {
  const {
    settings,
    loading,
    error,
    updateSection,
    updateField,
  } = useSettingsContext();

  if (error) {
    throw error;
  }
  if (loading || !settings) {
    return null;
  }

  return (
    <LoadedSettingsContext
      settings={settings}
      updateSection={updateSection}
      updateField={updateField}
    >
      {children}
    </LoadedSettingsContext>
  );
}

interface LoadedSettingsContextProps {
  settings: AllSettings;
  updateSection(moduleId: string, values: Partial<SectionValues>): Promise<AllSettings>;
  updateField(moduleId: string, key: string, value: unknown): Promise<AllSettings>;
  children: React.ReactNode;
}

function LoadedSettingsContext({
  settings,
  updateSection,
  updateField,
  children,
}: LoadedSettingsContextProps) {

  const ui = settings.ui;
  const devices = settings.devices;
  if (!ui || !devices) {
    throw new Error('Required UVC settings sections were not materialized');
  }

  const language = ui.language as UvcSupportedLanguage;
  const darkMode = ui.darkMode as boolean;
  const deviceSettings: DeviceSettingsGroup = {
    $type$: 'Settings.device',
    devices: {},
    ...getUvcDeviceSettingsDefaults(),
    ...devices,
  } as DeviceSettingsGroup;

  const setLanguage = useCallback(async (nextLanguage: UvcSupportedLanguage) => {
    await updateField('ui', 'language', nextLanguage);
    await setStoredLanguage(nextLanguage);
    await i18n.changeLanguage(nextLanguage);
  }, [updateField]);

  const setDarkMode = useCallback(async (enabled: boolean) => {
    await updateField('ui', 'darkMode', enabled);
    await setStoredDarkMode(enabled);
  }, [updateField]);

  const updateDeviceSettings = useCallback(async (
    nextSettings: Partial<DeviceSettingsGroup>,
  ) => {
    if (nextSettings.devices && Object.keys(nextSettings.devices).length > 0) {
      throw new Error('Devices are stored by DeviceModel, not in application settings');
    }
    const values = selectDeviceSettings(nextSettings);
    if (Object.keys(values).length > 0) {
      await updateSection('devices', values);
    }
  }, [updateSection]);

  const updateDeviceConfig = useCallback(async (config: Partial<DeviceConfig>) => {
    const values = selectDeviceSettings(config);
    if (Object.keys(values).length > 0) {
      await updateSection('devices', values);
    }
  }, [updateSection]);

  const importSettings = useCallback(async (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Imported settings must be an object');
    }
    const imported = value as Record<string, unknown>;
    if (imported.ui) {
      await updateSection('ui', imported.ui as Record<string, unknown>);
    }
    if (imported.devices) {
      await updateSection('devices', imported.devices as Record<string, unknown>);
    }
    if (imported.network) {
      await updateSection('network', imported.network as Record<string, unknown>);
    }
  }, [updateSection]);

  const exportSettings = useCallback(async () => JSON.stringify(settings, null, 2), [settings]);

  const deviceConfig = useMemo<DeviceConfig>(() => ({
    $type$: 'DeviceConfig',
    id: 'default',
    name: 'Device Settings',
    discoveryEnabled: deviceSettings.discoveryEnabled,
    discoveryPort: deviceSettings.discoveryPort,
    autoConnect: deviceSettings.autoConnect,
    addOnlyConnectedDevices: deviceSettings.addOnlyConnectedDevices,
    defaultDataPresentation: deviceSettings.defaultDataPresentation,
    lastUpdated: 0,
  }), [deviceSettings]);

  const value = useMemo<SettingsContextType>(() => ({
    language,
    setLanguage,
    darkMode,
    setDarkMode,
    deviceConfig,
    deviceSettings,
    updateDeviceConfig,
    updateDeviceSettings,
    isLoading: false,
    error: null,
    importSettings,
    exportSettings,
  }), [
    language,
    setLanguage,
    darkMode,
    setDarkMode,
    deviceConfig,
    deviceSettings,
    updateDeviceConfig,
    updateDeviceSettings,
    importSettings,
    exportSettings,
  ]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function SettingsProvider({children}: {children: React.ReactNode}) {
  const {instance} = useInstance();
  if (!instance.settingsStorage) {
    throw new Error('AppModel settings storage is not initialized');
  }

  return (
    <CoreSettingsProvider storage={instance.settingsStorage}>
      <SettingsContextAdapter>{children}</SettingsContextAdapter>
    </CoreSettingsProvider>
  );
}
