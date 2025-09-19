/**
 * Platform Types
 * 
 * Type definitions for platform configuration and state management.
 */

// Platform configuration interface
export interface PlatformConfig {
    name: string;
    email: string;
    secret: string;
    encryptStorage: boolean;
    commServerUrl: string;
    version?: number;
}

// Platform state type
export type PlatformState = 'init' | 'ready' | 'error';

// Export empty object as default for type files
export default {};