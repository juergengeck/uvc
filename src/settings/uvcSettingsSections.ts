import {
  SettingsRegistry,
  defineField,
  defineSection,
  type SettingsSection,
} from '@refinio/settings.core';
import type {ESP32DataPresentation} from '@src/types/device';

export const UVC_SUPPORTED_LANGUAGES = ['de', 'en', 'fr'] as const;
export type UvcSupportedLanguage = (typeof UVC_SUPPORTED_LANGUAGES)[number];

export const DEFAULT_UVC_COMM_SERVER_URL = 'wss://api.glue.one/comm';
export const LEGACY_UVC_COMM_SERVER_URL = 'wss://comm10.dev.refinio.one';

export interface UvcDeviceSettingsValues {
  discoveryEnabled: boolean;
  discoveryPort: number;
  discoveryBroadcastInterval: number;
  autoConnect: boolean;
  addOnlyConnectedDevices: boolean;
  defaultDataPresentation: ESP32DataPresentation;
}

export interface UvcNetworkSettingsValues {
  commServerUrl: string;
  eddaDomain: string;
  headlessAuthorityUrl: string;
  autoConnect: boolean;
}

export interface UvcUiSettingsValues {
  darkMode: boolean;
  language: UvcSupportedLanguage;
}

export const DEFAULT_UVC_DEVICE_SETTINGS: UvcDeviceSettingsValues = {
  discoveryEnabled: false,
  discoveryPort: 49497,
  discoveryBroadcastInterval: 30000,
  autoConnect: false,
  addOnlyConnectedDevices: false,
  defaultDataPresentation: {
    $type$: 'ESP32DataPresentation',
    format: 'json',
  },
};

export const DEFAULT_UVC_NETWORK_SETTINGS: UvcNetworkSettingsValues = {
  commServerUrl: DEFAULT_UVC_COMM_SERVER_URL,
  eddaDomain: 'edda.dev.refinio.one',
  headlessAuthorityUrl: 'http://uvc-pi.local:3000',
  autoConnect: false,
};

export const DEFAULT_UVC_UI_SETTINGS: UvcUiSettingsValues = {
  darkMode: false,
  language: 'en',
};

function validatePort(value: number): string | null {
  return Number.isInteger(value) && value >= 1 && value <= 65535
    ? null
    : 'Port must be an integer between 1 and 65535';
}

function validatePositiveInterval(value: number): string | null {
  return Number.isFinite(value) && value > 0
    ? null
    : 'Interval must be greater than zero';
}

function validateUrl(value: string, protocols: readonly string[]): string | null {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    return 'A URL is required';
  }
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol)
      ? null
      : `URL must use ${protocols.join(' or ')}`;
  } catch {
    return 'A valid URL is required';
  }
}

function validateDomain(value: string): string | null {
  return typeof value === 'string'
    && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu.test(value)
    ? null
    : 'A valid domain name is required';
}

function validateDataPresentation(value: ESP32DataPresentation): string | null {
  return value?.$type$ === 'ESP32DataPresentation'
    && ['json', 'binary', 'text'].includes(value.format)
    ? null
    : 'Data presentation must be json, binary, or text';
}

export const UvcDeviceSettingsSection = defineSection({
  id: 'devices',
  name: 'Devices',
  module: 'uvc',
  order: 20,
  fields: [
    defineField({
      key: 'discoveryEnabled',
      type: 'boolean',
      label: 'Device Discovery',
      description: 'Opt in to local device discovery. Disabled by default for privacy, security, and battery conservation.',
      default: DEFAULT_UVC_DEVICE_SETTINGS.discoveryEnabled,
    }),
    defineField({
      key: 'discoveryPort',
      type: 'number',
      label: 'Discovery Port',
      default: DEFAULT_UVC_DEVICE_SETTINGS.discoveryPort,
      min: 1,
      max: 65535,
      validate: validatePort,
    }),
    defineField({
      key: 'discoveryBroadcastInterval',
      type: 'number',
      label: 'Broadcast Interval',
      description: 'Milliseconds between discovery advertisements.',
      default: DEFAULT_UVC_DEVICE_SETTINGS.discoveryBroadcastInterval,
      min: 1,
      validate: validatePositiveInterval,
    }),
    defineField({
      key: 'autoConnect',
      type: 'boolean',
      label: 'Auto-Connect Devices',
      default: DEFAULT_UVC_DEVICE_SETTINGS.autoConnect,
    }),
    defineField({
      key: 'addOnlyConnectedDevices',
      type: 'boolean',
      label: 'Add Connected Devices Only',
      default: DEFAULT_UVC_DEVICE_SETTINGS.addOnlyConnectedDevices,
    }),
    defineField({
      key: 'defaultDataPresentation',
      type: 'custom',
      label: 'Default ESP32 Data Presentation',
      default: DEFAULT_UVC_DEVICE_SETTINGS.defaultDataPresentation,
      validate: validateDataPresentation,
    }),
  ],
});

export const UvcNetworkSettingsSection = defineSection({
  id: 'network',
  name: 'Network',
  module: 'uvc',
  order: 30,
  fields: [
    defineField({
      key: 'commServerUrl',
      type: 'string',
      label: 'Communication Server',
      default: DEFAULT_UVC_NETWORK_SETTINGS.commServerUrl,
      validate: value => validateUrl(value, ['ws:', 'wss:']),
    }),
    defineField({
      key: 'eddaDomain',
      type: 'string',
      label: 'Edda Domain',
      default: DEFAULT_UVC_NETWORK_SETTINGS.eddaDomain,
      validate: validateDomain,
    }),
    defineField({
      key: 'headlessAuthorityUrl',
      type: 'string',
      label: 'Headless Authority',
      default: DEFAULT_UVC_NETWORK_SETTINGS.headlessAuthorityUrl,
      validate: value => validateUrl(value, ['http:', 'https:']),
    }),
    defineField({
      key: 'autoConnect',
      type: 'boolean',
      label: 'Auto-Connect Network',
      default: DEFAULT_UVC_NETWORK_SETTINGS.autoConnect,
    }),
  ],
});

export const UvcUiSettingsSection = defineSection({
  id: 'ui',
  name: 'Appearance and Language',
  module: 'uvc',
  order: 10,
  fields: [
    defineField({
      key: 'darkMode',
      type: 'boolean',
      label: 'Dark Mode',
      default: DEFAULT_UVC_UI_SETTINGS.darkMode,
    }),
    defineField({
      key: 'language',
      type: 'select',
      label: 'Language',
      default: DEFAULT_UVC_UI_SETTINGS.language,
      options: [
        {value: 'de', label: 'Deutsch'},
        {value: 'en', label: 'English'},
        {value: 'fr', label: 'Français'},
      ],
      validate: value => UVC_SUPPORTED_LANGUAGES.some(language => language === value)
        ? null
        : 'Language must be de, en, or fr',
    }),
  ],
});

function registerSection(section: SettingsSection): void {
  const existing = SettingsRegistry.getSection(section.id);
  if (existing && existing !== section) {
    throw new Error(`Settings section '${section.id}' is already owned by ${existing.module}`);
  }
  if (!existing) {
    SettingsRegistry.registerSection(section);
  }
}

export function registerUvcDeviceSettings(): void {
  registerSection(UvcDeviceSettingsSection);
}

export function registerUvcNetworkSettings(): void {
  registerSection(UvcNetworkSettingsSection);
}

export function registerUvcUiSettings(): void {
  registerSection(UvcUiSettingsSection);
}

export function registerUvcSettingsSections(): void {
  registerUvcUiSettings();
  registerUvcDeviceSettings();
  registerUvcNetworkSettings();
}

export function getUvcDeviceSettingsDefaults(): UvcDeviceSettingsValues {
  return {
    ...DEFAULT_UVC_DEVICE_SETTINGS,
    defaultDataPresentation: {...DEFAULT_UVC_DEVICE_SETTINGS.defaultDataPresentation},
  };
}

export function getUvcNetworkSettingsDefaults(): UvcNetworkSettingsValues {
  return {...DEFAULT_UVC_NETWORK_SETTINGS};
}

export function getUvcUiSettingsDefaults(): UvcUiSettingsValues {
  return {...DEFAULT_UVC_UI_SETTINGS};
}
