import {
  SettingsRegistry,
  defineField,
  defineSection,
  type AllSettings,
  type SettingsSection,
} from '@settingscore/registry/SettingsRegistry.ts';
import { registerDeviceSettings } from '@settingscore/sections/device-settings.ts';

export const UVC_DISCOVERY_SECTION_ID = 'uvc.discovery';
export const UVC_IDENTITY_SECTION_ID = 'uvc.identity';
export const DEFAULT_UVC_COMM_SERVER_URL = 'wss://api.glue.one/comm';
export const LEGACY_UVC_COMM_SERVER_URL = 'wss://comm10.dev.refinio.one';

const uvcDiscoverySettingsSection = defineSection({
  id: UVC_DISCOVERY_SECTION_ID,
  name: 'Peer discovery',
  module: 'uvc.cube',
  order: 26,
  fields: [],
});

const uvcIdentitySettingsSection = defineSection({
  id: UVC_IDENTITY_SECTION_ID,
  name: 'Cube identity',
  module: 'uvc.cube',
  order: 20,
  fields: [
    defineField({
      key: 'email',
      type: 'string',
      label: 'Person email',
      description: 'The independent ONE Person who owns this Cube instance.',
      default: 'cube@uvc.local',
    }),
    defineField({
      key: 'instanceName',
      type: 'string',
      label: 'Instance name',
      description: 'A device-local name; changing identity settings takes effect after restart.',
      default: 'uvc-cube',
    }),
    defineField({
      key: 'displayName',
      type: 'string',
      label: 'Display name',
      default: 'UVC Cube',
    }),
    defineField({
      key: 'password',
      type: 'password',
      label: 'Local storage password',
      description: 'Encrypts this Cube instance storage and is never advertised.',
      default: 'uvc-cube-local',
    }),
    defineField({
      key: 'commServerUrl',
      type: 'string',
      label: 'Communication server',
      description: 'ONE pairing and CHUM transport used to share trie roots.',
      default: DEFAULT_UVC_COMM_SERVER_URL,
    }),
  ],
});

export function ensureUvcSettingsSectionsRegistered(): SettingsSection[] {
  registerDeviceSettings();

  if (!SettingsRegistry.hasSection(uvcDiscoverySettingsSection.id)) {
    SettingsRegistry.registerSection(uvcDiscoverySettingsSection);
  }
  if (!SettingsRegistry.hasSection(uvcIdentitySettingsSection.id)) {
    SettingsRegistry.registerSection(uvcIdentitySettingsSection);
  }

  return SettingsRegistry.getSections();
}

export function getSettingsDefaults(): AllSettings {
  ensureUvcSettingsSectionsRegistered();
  return SettingsRegistry.getDefaults();
}
