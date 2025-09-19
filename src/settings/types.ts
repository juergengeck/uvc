import { DeviceSettingsGroup } from '@OneObjectInterfaces';

/**
 * Network settings group
 */
export interface NetworkSettingsGroup {
  $type$: 'Settings.network';
  eddaDomain: string;
  commServerUrl?: string;
  autoConnect?: boolean;
  [key: string]: unknown;
}

/**
 * Settings types
 */
export type SettingsKey = 'device' | 'network' | 'security' | 'ui';

/**
 * Settings value types
 */
export type SettingsValue = 
  | DeviceSettingsGroup
  | NetworkSettingsGroup
  | Record<string, unknown>;

/**
 * Settings group interface
 */
export interface SettingsGroup {
  $type$: string;
  [key: string]: unknown;
}

/**
 * Settings storage interface
 */
export interface SettingsStorage {
  /**
   * Get a setting by key
   * @param key The setting key
   * @returns The setting value or undefined if not found
   */
  getItem(key: string): string | null;

  /**
   * Set a setting
   * @param key The setting key
   * @param value The setting value
   */
  setItem(key: string, value: string): void;

  /**
   * Remove a setting
   * @param key The setting key
   */
  removeItem(key: string): void;

  /**
   * Clear all settings
   */
  clear(): void;
}

/**
 * Settings change event
 */
export interface SettingsChangeEvent {
  key: string;
  value: unknown;
  previousValue: unknown;
} 