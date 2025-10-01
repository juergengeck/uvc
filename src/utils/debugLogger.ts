/**
 * Debug logger utility to control logging levels
 * Only logs in development or when debug flag is enabled
 */

const isDevelopment = __DEV__ || process.env.NODE_ENV === 'development';
const isDebugEnabled = process.env.DEBUG_LOGGING === 'true';

export const debugLog = {
  info: (component: string, message: string, ...args: any[]) => {
    if (isDevelopment || isDebugEnabled) {
      console.log(`[${component}] ${message}`, ...args);
    }
  },

  warn: (component: string, message: string, ...args: any[]) => {
    console.warn(`[${component}] ${message}`, ...args);
  },

  error: (component: string, message: string, ...args: any[]) => {
    console.error(`[${component}] ${message}`, ...args);
  },

  // Always log these regardless of environment
  important: (component: string, message: string, ...args: any[]) => {
    console.log(`[${component}] ${message}`, ...args);
  }
};