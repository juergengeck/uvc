import {
  SettingsRegistry,
  defineField,
  defineSection,
  type AllSettings,
  type SettingsSection,
} from '@settingscore/registry/SettingsRegistry.ts';
import { registerDeviceSettings } from '@settingscore/sections/device-settings.ts';

export const UVC_DISCOVERY_SECTION_ID = 'uvc.discovery';
export const UVC_DEFAULT_AUTHORITY_URL = 'http://uvc-pi.local:3000';

export interface UvcDiscoverySettings {
  authorityUrl: string;
  mdnsEnabled: boolean;
  discoveryMode: 'mdns' | 'udp' | 'hybrid';
  serviceType: string;
  serviceName: string;
  domain: string;
  discoveryIntervalMs: number;
  refreshIntervalSeconds: number;
}

export const UVC_DISCOVERY_DEFAULTS: UvcDiscoverySettings = {
  authorityUrl: UVC_DEFAULT_AUTHORITY_URL,
  mdnsEnabled: true,
  discoveryMode: 'mdns',
  serviceType: 'one-refinio',
  serviceName: 'uvc-pi',
  domain: 'local',
  discoveryIntervalMs: 5000,
  refreshIntervalSeconds: 15,
};

const uvcDiscoverySettingsSection = defineSection({
  id: UVC_DISCOVERY_SECTION_ID,
  name: 'Discovery & Authority',
  module: 'uvc.cube',
  order: 26,
  fields: [
    defineField({
      key: 'authorityUrl',
      type: 'string',
      label: 'Authority URL',
      description: 'Base URL for the Raspberry Pi headless authority that reports devices and accepts discovery config updates.',
      default: UVC_DISCOVERY_DEFAULTS.authorityUrl,
    }),
    defineField({
      key: 'mdnsEnabled',
      type: 'boolean',
      label: 'mDNS Discovery',
      description: 'Expose and query local discovery using DNS-SD / Bonjour.',
      default: UVC_DISCOVERY_DEFAULTS.mdnsEnabled,
    }),
    defineField({
      key: 'discoveryMode',
      type: 'select',
      label: 'Discovery Mode',
      description: 'Preferred discovery transport advertised to the authority.',
      default: UVC_DISCOVERY_DEFAULTS.discoveryMode,
      options: [
        { value: 'mdns', label: 'mDNS' },
        { value: 'udp', label: 'UDP' },
        { value: 'hybrid', label: 'Hybrid' },
      ],
    }),
    defineField({
      key: 'serviceType',
      type: 'string',
      label: 'Service Type',
      description: 'Bonjour service type used for local discovery.',
      default: UVC_DISCOVERY_DEFAULTS.serviceType,
    }),
    defineField({
      key: 'serviceName',
      type: 'string',
      label: 'Service Name',
      description: 'Human-friendly instance name to advertise on the network.',
      default: UVC_DISCOVERY_DEFAULTS.serviceName,
    }),
    defineField({
      key: 'domain',
      type: 'string',
      label: 'Domain',
      description: 'mDNS domain, usually local.',
      default: UVC_DISCOVERY_DEFAULTS.domain,
    }),
    defineField({
      key: 'discoveryIntervalMs',
      type: 'number',
      label: 'Discovery Interval',
      description: 'Authority discovery polling / broadcast interval in milliseconds.',
      default: UVC_DISCOVERY_DEFAULTS.discoveryIntervalMs,
      min: 1000,
      step: 1000,
    }),
    defineField({
      key: 'refreshIntervalSeconds',
      type: 'number',
      label: 'Auto Refresh',
      description: 'How often the cube refreshes device/runtime status from the authority. Set to 0 to disable polling.',
      default: UVC_DISCOVERY_DEFAULTS.refreshIntervalSeconds,
      min: 0,
      step: 1,
    }),
  ],
});

export function ensureUvcSettingsSectionsRegistered(): SettingsSection[] {
  registerDeviceSettings();

  if (!SettingsRegistry.hasSection(uvcDiscoverySettingsSection.id)) {
    SettingsRegistry.registerSection(uvcDiscoverySettingsSection);
  }

  return SettingsRegistry.getSections();
}

export function getSettingsDefaults(): AllSettings {
  ensureUvcSettingsSectionsRegistered();
  return SettingsRegistry.getDefaults();
}
