/**
 * Server Configuration
 * 
 * Configuration settings for connecting to leute.one and other services
 */

// Server URLs for different environments
// All environments now use comm10.dev.refinio.one
export const SERVERS = {
  DEVELOPMENT: {
    COMM_SERVER: 'wss://comm10.dev.refinio.one',
    GLUE_CHANNEL: 'wss://comm10.dev.refinio.one/glue',
    API_SERVER: 'https://api.refinio.one',
  },
  PRODUCTION: {
    COMM_SERVER: 'wss://comm10.dev.refinio.one',
    GLUE_CHANNEL: 'wss://comm10.dev.refinio.one/glue',
    API_SERVER: 'https://api.refinio.one',
  },
  STAGING: {
    COMM_SERVER: 'wss://comm10.dev.refinio.one',
    GLUE_CHANNEL: 'wss://comm10.dev.refinio.one/glue',
    API_SERVER: 'https://api.refinio.one',
  }
};

// Get the current environment
// @ts-ignore - __DEV__ is defined by React Native
const isDevelopment = typeof global !== 'undefined' && global.__DEV__;
const isProduction = !isDevelopment && process.env.NODE_ENV === 'production';
const isStaging = process.env.REACT_APP_ENV === 'staging';

// Default server URLs based on environment
export const COMMSERVER_URL = isDevelopment
  ? SERVERS.DEVELOPMENT.COMM_SERVER
  : (isStaging ? SERVERS.STAGING.COMM_SERVER : SERVERS.PRODUCTION.COMM_SERVER);

export const GLUE_CHANNEL = isDevelopment
  ? SERVERS.DEVELOPMENT.GLUE_CHANNEL
  : (isStaging ? SERVERS.STAGING.GLUE_CHANNEL : SERVERS.PRODUCTION.GLUE_CHANNEL);

export const API_SERVER = isDevelopment
  ? SERVERS.DEVELOPMENT.API_SERVER
  : (isStaging ? SERVERS.STAGING.API_SERVER : SERVERS.PRODUCTION.API_SERVER);

/**
 * Get all server URLs for the current environment
 */
export function getServerUrls() {
  if (isDevelopment) {
    return SERVERS.DEVELOPMENT;
  }
  return isStaging ? SERVERS.STAGING : SERVERS.PRODUCTION;
}

/**
 * Check if a URL is for the development environment
 */
export function isDevelopmentUrl(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

/**
 * Check if a URL is for the staging environment
 */
export function isStagingUrl(url: string): boolean {
  return url.includes('staging');
}

/**
 * Validate that a comm server URL is properly formatted
 */
export function isValidCommServerUrl(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://');
} 