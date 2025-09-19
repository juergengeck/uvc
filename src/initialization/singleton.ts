/**
 * Singleton Initializer
 * 
 * This module ensures that the core application initialization logic runs exactly once,
 * regardless of how many times it's imported or how React components re-render.
 */

// Debug the import to ensure it works
console.log('[SingletonInitializer] Starting import from ./index');

import { getAuthenticator, createInstance } from './index';
import { QuicModel } from '@src/models/network/QuicModel';
import { UdpModel } from '@src/models/network/UdpModel';

console.log('[SingletonInitializer] Import successful - functions available:', {
  getAuthenticator: typeof getAuthenticator,
  createInstance: typeof createInstance
});

class SingletonInitializer {
  private initializationPromise: Promise<void> | null = null;

  public initialize(): Promise<void> {
    if (this.initializationPromise) {
      console.log('[SingletonInitializer] Initialization already in progress/complete. Returning existing promise.');
      return this.initializationPromise;
    }

    console.log('[SingletonInitializer] Starting one-time system initialization...');
    this.initializationPromise = (async () => {
      try {
        // Reset network layer to ensure clean state after reload
        console.log('[SingletonInitializer] Resetting network layer...');
        await UdpModel.resetInstance();
        await QuicModel.resetInstance();
        
        let auth = getAuthenticator();
        if (!auth) {
          console.log('[SingletonInitializer] No existing authenticator, creating new instance.');
          auth = await createInstance();
        } else {
          console.log('[SingletonInitializer] Reusing existing authenticator instance.');
        }
        console.log('[SingletonInitializer] ✅ System initialization complete.');
      } catch (error) {
        console.error('❌ CRITICAL: Singleton initialization failed.', error);
        // Reset promise on failure to allow a retry if the app logic supports it.
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }
}

const initializer = new SingletonInitializer();
export const initializeApp = () => initializer.initialize(); 