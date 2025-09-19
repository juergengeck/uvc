/**
 * Path configuration for app modules
 * This allows us to easily switch between different app implementations
 */

export const APP_MODULE_PATH = 'src/lama';

// Helper function to get a path within the app module
export function getAppPath(relativePath: string): string {
  return `${APP_MODULE_PATH}/${relativePath}`;
} 