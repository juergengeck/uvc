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

// Synchronously initialize crypto - this must complete before any ONE.core functions are called
initCrypto();

console.log('✅ one.core platform and feature detection loaded successfully');

// Import expo-router entry point
console.log('📦 Loading expo-router...');
import 'expo-router/entry';