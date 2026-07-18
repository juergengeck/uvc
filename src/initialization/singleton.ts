/**
 * Singleton Initializer
 * 
 * This module ensures that the core application initialization logic runs exactly once,
 * regardless of how many times it's imported or how React components re-render.
 */

// Debug the import to ensure it works
console.log('[SingletonInitializer] Starting import from ./index');

import { getAuthenticator, createInstance } from './index';
import { preInitializeCrypto, prewarmCrypto } from './cryptoOptimization';
import { appRuntimeState } from './runtimeState';

console.log('[SingletonInitializer] Import successful - functions available:', {
  getAuthenticator: typeof getAuthenticator,
  createInstance: typeof createInstance
});

export function initializeApp(): Promise<void> {
  const existing = appRuntimeState.initializationPromise;
  if (existing) {
    console.log('[SingletonInitializer] Initialization already in progress/complete. Returning process-owned promise.');
    return existing;
  }

  console.log('[SingletonInitializer] Starting one-time system initialization...');
  const initializationPromise = (async () => {
    // Pre-initialize crypto early to speed up login
    console.log('[SingletonInitializer] Pre-initializing crypto...');
    await preInitializeCrypto();

    // Prewarm crypto libraries (non-blocking)
    prewarmCrypto().catch(err =>
      console.warn('[SingletonInitializer] Crypto prewarm failed (non-critical):', err)
    );

    // Network models are process-owned and initialize as part of the authenticated
    // model graph. Re-entering this module during Fast Refresh must not reset them.
    let auth = getAuthenticator();
    if (!auth) {
      console.log('[SingletonInitializer] No existing authenticator, creating new instance.');
      auth = await createInstance();
    } else {
      console.log('[SingletonInitializer] Reusing existing authenticator instance.');
    }
    console.log('[SingletonInitializer] ✅ System initialization complete.');
  })();
  appRuntimeState.initializationPromise = initializationPromise;
  void initializationPromise.catch(error => {
    console.error('❌ CRITICAL: Singleton initialization failed.', error);
    if (appRuntimeState.initializationPromise === initializationPromise) {
      appRuntimeState.initializationPromise = undefined;
    }
  });
  return initializationPromise;
}
