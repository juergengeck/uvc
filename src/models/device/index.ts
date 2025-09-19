/**
 * Device Models
 * 
 * This directory contains device management related models.
 * The proper DeviceModel maintains device state using ONE architecture patterns,
 * and integrates with the network directory's discovery functionality.
 */

// Export our main DeviceModel and related types
export { 
  default as DeviceModel, 
} from './DeviceModel';

// Re-export all device types from recipes for convenience
export {
  Device,
  DeviceSettings,
  DeviceRegistrationResult,
  ESP32DataPresentation,
  DeviceSettingsGroup,
  ESP32DeviceSettings
} from '../../recipes/device';

// Re-export network discovery models and types for backward compatibility
export {
  DeviceDiscoveryModel,
  DeviceDiscoveryConfig,
  Device as DiscoveredDevice,
  DeviceCapabilities,
  getDeviceDiscoveryModel,
  ensureDeviceDiscoveryInitialized
} from '../network'; 