// Import one.core expo platform and feature detection - includes comprehensive SharedArrayBuffer polyfills
console.log('🚀 Loading one.core expo platform with feature detection...');

// Set PRNG on tweetnacl before any code uses it
import tweetnacl from 'tweetnacl';
import { getRandomValues } from 'expo-crypto';

tweetnacl.setPRNG((x, n) => {
  // Handle both standard (x, n) and tweetnacl.randomBytes(array) calling patterns
  if (typeof n === 'number') {
    // Standard pattern: x is output array, n is length
    const randomBytes = new Uint8Array(n);
    getRandomValues(randomBytes);
    x.set(randomBytes);
  } else {
    // tweetnacl.randomBytes pattern: x is both input and output
    getRandomValues(x);
  }
});

console.log('✅ PRNG initialized on tweetnacl');

// Load feature detection first (includes comprehensive polyfills with logging)
import '@refinio/one.core/lib/util/feature-detection';

// Load expo platform (includes additional expo-specific polyfills)
import '@refinio/one.core/lib/system/load-expo';

// Force crypto initialization to ensure PRNG is set up before any crypto operations
import { init as initCrypto } from '@refinio/one.core/lib/system/expo/crypto-helpers';

// Create an initialization promise
const cryptoInitPromise = initCrypto().then(() => {
  console.log('✅ Crypto helpers initialized with PRNG');
}).catch(error => {
  console.error('❌ Failed to initialize crypto helpers:', error);
  // Don't throw - let the app continue but crypto operations might fail
});

// Export the promise so other modules can wait for it if needed
global.__cryptoInitPromise = cryptoInitPromise;

console.log('✅ one.core platform and feature detection loaded successfully');

// Import expo-router entry point
console.log('📦 Loading expo-router...');
import 'expo-router/entry';