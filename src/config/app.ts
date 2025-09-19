/**
 * Application Configuration
 */

// Early debug logging - this should show up even if logger isn't initialized
const earlyDebug = (msg: string) => {
  // @ts-ignore - __DEV__ is defined by React Native
  if (global.__DEV__) {
    // Only log in development, and only as regular logs
    console.log(`[CONFIG] ${msg}`);
  }
};

earlyDebug('Loading app configuration');

export const APP_CONFIG = {
  name: 'lama',
  email: 'lama@refinio.one',
  directory: 'lama',
  secret: 'lama-secret',  // Instance secret, not user auth
  ownerName: 'Lama User',
} as const;

earlyDebug('APP_CONFIG loaded');

export const AUTH_CONFIG = {
  routes: {
    login: '/login',
    home: '/',
  },
  // Minimum requirements for secrets
  secretRequirements: {
    minLength: 8,
    requireNumbers: true,
    requireSpecialChars: true,
    requireUppercase: true,
    requireLowercase: true
  }
} as const;

earlyDebug('AUTH_CONFIG loaded');

earlyDebug(`Configuration loaded for ${process.env.NODE_ENV} environment`);

// Export configuration object (server URLs are in src/config/server.ts)
export const CONFIG = {
  ...APP_CONFIG,
} as const;

earlyDebug('Configuration complete');

export default {
  app: APP_CONFIG,
  auth: AUTH_CONFIG,
}; 