/**
 * Debug environment configuration
 * Must be imported before any one.core or one.models modules
 * 
 * NOTE: This file is imported BEFORE index.js, so it should NOT override
 * the debug settings configured in index.js. Instead, it should provide
 * minimal baseline configuration.
 */

// DO NOT disable debug output here - let index.js control it
// process.env.DEBUG = '-*';  // COMMENTED OUT - this was overriding index.js settings

// DO NOT disable one.models debugging here - let index.js control it
// process.env.ONE_MODELS_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_MODELS_CHANNEL_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_MODELS_CHANNEL_VERBOSE = 'false';  // COMMENTED OUT
// process.env.ONE_MODELS_DEBUG_LEVEL = 'none';  // COMMENTED OUT

// DO NOT disable core debug output here - let index.js control it
// process.env.ONE_CORE_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_PROMISE_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_SERIALIZE_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_LOCK_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_VERSION_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_STORAGE_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_PLATFORM_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_TRANSPORT_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_NETWORK_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_PROMISE_IMPL_DEBUG = 'false';  // COMMENTED OUT
// process.env.ONE_CORE_SERIALIZE_IMPL_DEBUG = 'false';  // COMMENTED OUT

console.log('[debug-env] Debug environment configuration loaded - debug settings controlled by index.js'); 