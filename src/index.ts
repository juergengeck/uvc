// Debug configuration must be first
import './config/debug-env';
import './config/one-core-debug';

// Import global references first - must be loaded before anything else
import './global/references';

// Export device models
export * from './models/device';

// Export settings
export * from './settings';

// Export services
export * from './services';

// Export recipes (device recipes moved to @refinio/esp32.host; same names)
export {
  Device,
  DeviceDataFormat,
  DeviceList,
  DeviceListRecipe,
  DeviceQuicConfig,
  DeviceRecipe,
  DeviceRegistrationResult,
  DeviceSettings,
  DeviceSettingsGroup,
  DeviceSettingsRecipe,
  ESP32DataPresentation,
  ESP32DeviceSettings,
} from '@refinio/esp32.host';

// Import model extensions
import './models/extensions';