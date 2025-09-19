import { DeviceSettingsService } from './DeviceSettingsService';
import { useSettings } from '@src/providers/app/SettingsProvider';

/**
 * Create a DeviceSettingsService instance using the SettingsProvider
 * @returns DeviceSettingsService instance
 */
export function createDeviceSettingsService(): DeviceSettingsService {
  const { deviceSettings, updateDeviceSettings } = useSettings();
  
  return new DeviceSettingsService(
    deviceSettings,
    updateDeviceSettings
  );
} 