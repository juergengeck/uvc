/**
 * Device Type Constants
 * 
 * Defines the standard device types used in the LAMA ecosystem.
 * Device types should be explicitly declared in discovery messages.
 */

export enum DeviceType {
  // Hardware devices
  ESP32 = 'ESP32',
  
  // Software applications
  APPLICATION = 'application',
  
  // Legacy types (may be deprecated)
  MOBILE = 'mobile',
  DESKTOP = 'desktop',
  TABLET = 'tablet',
  
  // Unknown/unspecified
  UNKNOWN = 'Unknown'
}

/**
 * Check if a device type is a hardware device
 */
export function isHardwareDevice(type: string): boolean {
  return type === DeviceType.ESP32;
}

/**
 * Check if a device type is a software application
 */
export function isApplicationDevice(type: string): boolean {
  return type === DeviceType.APPLICATION || 
         type === DeviceType.MOBILE || 
         type === DeviceType.DESKTOP || 
         type === DeviceType.TABLET;
}

/**
 * Get a user-friendly display name for a device type
 */
export function getDeviceTypeDisplayName(type: string): string {
  switch (type) {
    case DeviceType.ESP32:
      return 'ESP32 Device';
    case DeviceType.APPLICATION:
      return 'LAMA App';
    case DeviceType.MOBILE:
      return 'Mobile Device';
    case DeviceType.DESKTOP:
      return 'Desktop';
    case DeviceType.TABLET:
      return 'Tablet';
    case DeviceType.UNKNOWN:
    default:
      return 'Unknown Device';
  }
}

/**
 * Get icon name for a device type (for MaterialCommunityIcons)
 */
export function getDeviceTypeIcon(type: string): string {
  switch (type) {
    case DeviceType.ESP32:
      return 'chip';
    case DeviceType.APPLICATION:
      return 'application';
    case DeviceType.MOBILE:
      return 'cellphone';
    case DeviceType.DESKTOP:
      return 'desktop-classic';
    case DeviceType.TABLET:
      return 'tablet';
    case DeviceType.UNKNOWN:
    default:
      return 'help-circle-outline';
  }
}