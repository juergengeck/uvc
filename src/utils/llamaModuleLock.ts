/**
 * Global lock for Llama module access
 * This ensures only one initialization can happen at a time at the native level
 */

// Track active initialization to prevent concurrent access to the native module
let activeInitPromise: Promise<any> | null = null;

/**
 * Wait for any active initialization to complete before proceeding
 * @returns A promise that resolves when it's safe to proceed with initialization
 */
export async function waitForActiveInitialization(): Promise<void> {
  if (activeInitPromise) {
    try {
      console.log('[LlamaModuleLock] Another initialization is already in progress, waiting for it to complete');
      await activeInitPromise;
      console.log('[LlamaModuleLock] Previous initialization completed');
    } catch (error) {
      console.log('[LlamaModuleLock] Previous initialization failed:', error);
      // Continue anyway
    }
  }
}

/**
 * Set the current initialization promise
 * @param promise The promise representing the current initialization
 */
export function setActiveInitialization(promise: Promise<any>): void {
  activeInitPromise = promise;
}

/**
 * Clear the active initialization if it matches the provided promise
 * @param promise The promise to check against the active initialization
 */
export function clearActiveInitialization(promise: Promise<any>): void {
  if (activeInitPromise === promise) {
    activeInitPromise = null;
  }
} 