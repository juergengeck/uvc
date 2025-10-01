/**
 * Crypto Optimization Module
 *
 * Optimizes crypto operations during app initialization by:
 * 1. Pre-initializing crypto helpers before login
 * 2. Using proper one.core crypto APIs
 * 3. Providing async wrappers for heavy operations
 */

import { init as initCryptoHelpers } from '@refinio/one.core/lib/system/expo/crypto-helpers';
import { createRandomString } from '@refinio/one.core/lib/system/crypto-helpers';

let cryptoInitialized = false;
let cryptoInitPromise: Promise<void> | null = null;

/**
 * Pre-initialize crypto helpers early in app lifecycle
 * This ensures PRNG and other crypto basics are ready before login
 */
export async function preInitializeCrypto(): Promise<void> {
  if (cryptoInitialized) {
    return;
  }

  if (cryptoInitPromise) {
    return cryptoInitPromise;
  }

  cryptoInitPromise = (async () => {
    const startTime = Date.now();
    console.log('[CryptoOptimization] Pre-initializing crypto helpers...');

    try {
      // Initialize crypto helpers (includes PRNG setup)
      await initCryptoHelpers();

      // Test that crypto is working
      const testRandom = await createRandomString(8);
      if (!testRandom || testRandom.length !== 8) {
        throw new Error('Crypto helpers test failed');
      }

      cryptoInitialized = true;
      console.log(`[CryptoOptimization] ✅ Crypto pre-initialized (${Date.now() - startTime}ms)`);
    } catch (error) {
      console.error('[CryptoOptimization] ❌ Failed to pre-initialize crypto:', error);
      cryptoInitPromise = null;
      throw error;
    }
  })();

  return cryptoInitPromise;
}

/**
 * Ensure crypto is initialized
 * Call this before any crypto operations
 */
export async function ensureCryptoReady(): Promise<void> {
  if (!cryptoInitialized) {
    await preInitializeCrypto();
  }
}

/**
 * Check if crypto is ready without blocking
 */
export function isCryptoReady(): boolean {
  return cryptoInitialized;
}

/**
 * Reset crypto state (for testing or cleanup)
 */
export function resetCryptoState(): void {
  cryptoInitialized = false;
  cryptoInitPromise = null;
}

/**
 * Optimization: Pre-warm the scrypt key derivation
 * This won't actually speed up the login, but it can warm up the CPU
 * and ensure all crypto libraries are loaded
 */
export async function prewarmCrypto(): Promise<void> {
  try {
    // Import the derivation function to ensure it's loaded
    const { deriveSymmetricKeyFromSecret, createRandomSalt } = await import(
      '@refinio/one.core/lib/crypto/encryption'
    );

    // Do a dummy derivation to warm up the CPU and load all dependencies
    // This uses minimal rounds just to load the code
    const dummySalt = createRandomSalt(16);
    const startTime = Date.now();

    // Note: We can't actually pre-compute the real key because we don't have
    // the user's password yet, but we can ensure all code is loaded
    console.log('[CryptoOptimization] Pre-warming crypto libraries...');

    // Just importing the function is enough to ensure code is loaded
    // Actually running it would be wasteful since we don't have the real password

    console.log(`[CryptoOptimization] Crypto libraries loaded (${Date.now() - startTime}ms)`);
  } catch (error) {
    console.warn('[CryptoOptimization] Could not prewarm crypto:', error);
  }
}

/**
 * Get crypto timing estimates for UI feedback
 */
export function getCryptoTimingEstimates() {
  return {
    keyDerivation: 1500, // Typical scrypt derivation time in ms
    initialization: 100,  // Crypto helper init time
    total: 1600
  };
}