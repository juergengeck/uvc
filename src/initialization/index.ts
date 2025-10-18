// -------------------------------------------------------------------------------------
// Global polyfills for React-Native / Hermes environment
// Must be the first code executed to guard against runtime ReferenceErrors in libs
// -------------------------------------------------------------------------------------

// Platform abstraction is handled by one.core/src/system facade
// Additional platform-specific polyfills handled there

// Record app start time for metrics
global.APP_START_TIME = Date.now();

// Detect hot reload and reset singletons if needed
if (global.HOT_RELOAD_DETECTED) {
  console.log('[Initialization] Hot reload detected, resetting singletons...');
  // Reset network singletons that might have stale state
  Promise.resolve().then(async () => {
    try {
      const { DeviceDiscoveryModel } = await import('@src/models/network/DeviceDiscoveryModel');
      await DeviceDiscoveryModel.resetInstance();
      
      const { QuicModel } = await import('@src/models/network/QuicModel');
      await QuicModel.resetInstance();
      
      const { UdpModel } = await import('@src/models/network/UdpModel');
      await UdpModel.resetInstance();
      
      console.log('[Initialization] Singletons reset successfully');
    } catch (error) {
      console.error('[Initialization] Error resetting singletons:', error);
    }
  });
}
// Mark hot reload for next time
global.HOT_RELOAD_DETECTED = true;

// -------------------------------------------------------------------------------------
// Existing initialization debug and configuration follows
// -------------------------------------------------------------------------------------

// Platform detection - removed verbose debugging

// Disable verbose debugging for production
process.env.ONE_CORE_DEBUG = 'false';
process.env.ONE_CORE_TRANSPORT_DEBUG = 'false';
process.env.ONE_CORE_NETWORK_DEBUG = 'false';
process.env.ONE_MODELS_DEBUG = 'false';
process.env.ONE_NETWORK_DEBUG = 'false';
process.env.ONE_MODELS_CONNECTION_DEBUG = 'false';
process.env.ONE_MODELS_PAIRING_DEBUG = 'false';
process.env.ONE_CORE_MESSAGE_BUS_DEBUG = 'false';
process.env.MESSAGE_BUS_DEBUG = 'false';

// Disable debug namespaces
process.env.DEBUG = '';

// Specifically disable one:discovery:protocol debug logging
if (typeof localStorage !== 'undefined') {
  localStorage.removeItem('debug');
}

// Keep these disabled
process.env.ONE_CORE_PROMISE_DEBUG = 'false';
process.env.ONE_CORE_SERIALIZE_DEBUG = 'false';
process.env.ONE_CORE_LOCK_DEBUG = 'false';
process.env.ONE_CORE_VERSION_DEBUG = 'false';
process.env.ONE_CORE_STORAGE_DEBUG = 'false';
process.env.ONE_CORE_PLATFORM_DEBUG = 'false';

// Console filtering removed for performance
// If specific logs need filtering, use environment variables instead

// NOTE: Removed aggressive console.log filtering since we fixed the real source
// The [ONE_MODELS_BUS_DEBUG] noise was coming from AppModel.ts MessageBus listeners
// which have now been focused to only show errors/warnings for connection-related events

// Dynamic debugging system - only enable when creating invitations
export function enableInvitationDebugging() {
  // Enable only WebSocket-specific debugging
  process.env.ONE_CORE_TRANSPORT_DEBUG = 'true';
  process.env.ONE_CORE_NETWORK_DEBUG = 'true'; 
  process.env.ONE_MODELS_CONNECTION_DEBUG = 'true';
  process.env.DEBUG = 'one:transport*,one:network*,one:connection*,WebSocket*,chum*';
  
  // Set up focused debug override only for WebSocket events
  try {
    const debug = require('debug');
    debug.enabled = (name: string) => {
      return name.includes('transport') ||
             name.includes('network') || 
             name.includes('connection') ||
             name.includes('websocket') ||
             name.includes('chum');
    };
    
    const originalDebugLog = debug.log;
    debug.log = function(...args: any[]) {
      console.log('[ONE_CORE]', ...args);
      return originalDebugLog.apply(this, args);
    };
  } catch (e) {
    // Could not override debug package
  }
}

export function disableInvitationDebugging() {
  // Turn off debug flags
  process.env.ONE_CORE_TRANSPORT_DEBUG = 'false';
  process.env.ONE_CORE_NETWORK_DEBUG = 'false';
  process.env.ONE_MODELS_CONNECTION_DEBUG = 'false';
  process.env.DEBUG = '';
}

export function enableFocusedConnectionDebugging() {
  // Enable only connection-relevant debugging
  process.env.ONE_CORE_TRANSPORT_DEBUG = 'true';
  process.env.ONE_MODELS_CONNECTION_DEBUG = 'true';
  process.env.CONNECTION_ROUTE_DEBUG = 'true';
  process.env.PAIRING_MANAGER_DEBUG = 'true';
  
  // Keep the noisy bus debugging OFF
  process.env.ONE_MODELS_BUS_DEBUG = 'false';
  process.env.ONE_MODELS_BUS_LOG = 'false';
  process.env.ONE_CORE_SERIALIZE_IMPL_DEBUG = 'false';
}

export function disableFocusedConnectionDebugging() {
  process.env.ONE_CORE_TRANSPORT_DEBUG = 'false';
  process.env.ONE_MODELS_CONNECTION_DEBUG = 'false';
  process.env.CONNECTION_ROUTE_DEBUG = 'false';
  process.env.PAIRING_MANAGER_DEBUG = 'false';
}

/**
 * Core module initialization
 * 
 * This module handles the initialization of core system components:
 * 1. objectEvents - the event system for storage events
 * 2. LeuteModel - primary identity model
 * 3. ChannelManager - manages channels and messages
 * 4. More models like TopicModel, QuestionnaireModel, etc.
 * 5. TopicModel instrumentation to verify ChannelManager integration
 * 6. Channel event diagnostics to ensure events flow correctly
 * 7. Automatic channel event fixes when needed
 * 
 * Note: The initialization sequence is critical. Do not change the order unless you
 * fully understand the dependencies between components.
 */

// Platform loading now happens in index.js - no need to duplicate here

// Import global references first
import '../global/references';

// Debug helpers removed - load on demand if needed

// Remove direct import - will be imported lazily when needed
// import { ensurePlatformLoaded } from '@refinio/one.core/lib/system/platform';
import { createRandomString } from '@refinio/one.core/lib/system/crypto-helpers';
// import { initCryptoHelpers } from '@refinio/one.core/lib/crypto/init';
// // import { initOneCoreLogging } from '../config/debug'; // REMOVED: function doesn't exist
// Import UDP bridge to connect JSI and TurboModule implementations
// import '@src/UDPDirectModuleBridge';
// Import UDP diagnostics
// import { diagnoseUDPModule } from '@src/UDPDirectModule';
// Only import as a type
import type { Model } from '@refinio/one.models/lib/models/Model';

// UDP diagnostics removed - import on demand if needed
// Static import AppModel (bundling fixed by moving to static imports)
import { AppModel } from '../models/AppModel';
import { LLMManager } from '@src/models/ai/LLMManager';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects';
import type { Recipe, OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';
import type { OneVersionedObjectInterfaces } from '@OneObjectInterfaces';
import { closeAndDeleteCurrentInstance, getInstanceOwnerIdHash } from '@refinio/one.core/lib/instance';
import { createError } from '@refinio/one.core/lib/errors';
import { APP_CONFIG } from '@src/config/app';
import MultiUser from '@refinio/one.models/lib/models/Authenticator/MultiUser';
// Only import as a type
import type { OEvent } from '@refinio/one.models/lib/misc/OEvent';

// Global model variable
let model: AppModel | undefined;
import { onUnversionedObj } from '@refinio/one.core/lib/storage-unversioned-objects';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects';
import { hasRecipe, addRecipeToRuntime } from '@refinio/one.core/lib/object-recipes';
import { addEnabledRvMapType } from '@refinio/one.core/lib/reverse-map-updater';
import { ALL_RECIPES } from '../recipes/index';
import { getInstanceIdHash } from '@refinio/one.core/lib/instance';
import { createDeviceSettingsService } from '@src/services/createDeviceSettingsService';
import { registerServices } from '@src/services/registerServices';
import { ModelService } from '../services/ModelService';
import LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import { COMMSERVER_URL } from '@src/config/server';
import { getNetworkSettingsService } from '../services/NetworkSettingsService';
import { TransportManager } from '../models/network/TransportManager';
// Using one.leute LeuteAccessRightsManager instead of custom implementation
import GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
import type { Group } from '@refinio/one.core/lib/recipes.js';
import { createGroupIfNotExist, getGroupIdByName } from '../utils/groupUtils';
import '../utils/loadDiagnostics';

// Import crypto functions for secret key verification
import { hasDefaultKeys, createCryptoApiFromDefaultKeys, getListOfKeys, getDefaultKeys } from '@refinio/one.core/lib/keychain/keychain';
import { hasSecretKeys } from '@refinio/one.core/lib/keychain/key-storage-secret';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { Person } from '@refinio/one.core/lib/recipes.js';

// Import recipes and maps
import RecipesStable from '@refinio/one.models/lib/recipes/recipes-stable';
import RecipesExperimental from '@refinio/one.models/lib/recipes/recipes-experimental';
import RoleCertificate from '../recipes/RoleCertificate';

// Create message bus for crypto helpers
const cryptoMessageBus = createMessageBus('crypto-helpers');

// Early debug logging (keep this minimal)
const earlyDebug = (msg: string) => {
  // Disabled for noise reduction
  // console.log(`[INIT_EARLY] ${msg}`);
};

// Global authenticator instance (initialized before login)
let authInstance: MultiUser | undefined = undefined;

// Global state tracking
let isLoggedIn = false;
let handlersAttached = false;
let isLoginInProgress = false; // NEW: Prevent concurrent login attempts
let isModelInitInProgress = false; // Prevent concurrent model initialization

// Declare variables for object events and platform initialization status
let objectEventsInitialized = false;
let platformInitialized = false;

// Add a proper RECIPE_MAPS definition at the top of the file with other declarations
// Define recipe maps for reverse mapping
const RECIPE_MAPS = new Map<OneObjectTypeNames, Set<string>>();

// Import channelManager functions - static import to avoid runtime bundling
import { clearChannelManagerInstance, createChannelManager, initializeChannelManager } from './channelManagerSingleton';
import LeuteAccessRightsManager from '../models/LeuteAccessRightsManager';

// NOTE: CHUM plugin patch not needed - using one.leute approach with built-in protocol routing

// Import storage functions from the specific platform implementation
import { initStorage, closeStorage } from '@refinio/one.core/lib/system/expo/storage-base';

// Import InitStorageOptions type
import type { InitStorageOptions } from '@refinio/one.core/lib/storage-base-common';

// Import UdpModel for cleanup
import { UdpModel } from '@src/models/network/UdpModel';

// Note: Using one.core functions for key generation to ensure consistency with LLMManager

import { SettingsStore } from '@refinio/one.core/lib/system/settings-store';
import { fromByteArray } from 'base64-js';
import { setupDebugLogging } from '../config/debug';

// CRITICAL: Additional static imports to prevent bundling during login
import { subscribeToMessageBus } from '../config/debug';
import { ensurePlatformLoaded } from '@refinio/one.core/lib/system/platform';
import { objectEvents } from '@refinio/one.models/lib/misc/ObjectEventDispatcher';
import { createMessageBus } from '@refinio/one.core/lib/message-bus';
import { initializePlatform } from '../platform/init';
import { measureTime } from '../utils/performanceOptimization';
import { keyCache } from './keyCache';
import { performanceSummary } from '../utils/performanceSummary';

/**
 * Enhanced loginOrRegister that uses the basic MultiUser method
 * The MultiUser register method has a bug with encryption key handling, so we'll use basic loginOrRegister
 */
export async function loginOrRegisterWithKeys(
  auth: MultiUser,
  email: string,
  secret: string,
  instanceName: string
): Promise<void> {
  const startTime = Date.now();

  // Check if we have cached keys from this session
  if (keyCache.hasCachedKeys(email, instanceName)) {
    console.log('[PERF] Keys already loaded in this session (from cache)');
    // Keys are already loaded, just need to re-authenticate
    // Note: This optimization only helps if the user logs out and back in during the same session
  }

  // Check if instance exists to provide better feedback
  const { instanceExists } = await import('@refinio/one.core/lib/instance');
  const exists = await instanceExists(instanceName, email);

  if (!exists) {
    console.log('[PERF] First-time login - will generate keys (this takes ~1-2 seconds)');
  } else {
    console.log('[PERF] Existing user - will decrypt stored keys (fast)');
  }

  // Use the basic loginOrRegister method which handles key generation internally
  await auth.loginOrRegister(email, secret, instanceName);

  // Mark keys as loaded in cache
  keyCache.markKeysLoaded(email, instanceName);

  console.log(`[PERF] loginOrRegister took: ${Date.now() - startTime}ms (${exists ? 'existing' : 'new'} user)`);
}

/**
 * Get the global authenticator instance
 * This is safe to call before login
 */
export function getAuthenticator(): MultiUser | undefined {
  return authInstance;
}

/**
 * Get the global AppModel instance
 * Returns undefined if not logged in
 */
export function getModel(): AppModel | undefined {
  return isLoggedIn ? ModelService.getModel() : undefined;
}

/**
 * Clear the model instance
 * Called during logout
 */
export async function clearModel(): Promise<void> {
  const model = ModelService.getModel();
  if (model) {
    try {
      await model.shutdown();
      ModelService.clearModel();
    } catch (error: unknown) {
      console.error('[Initialization] Error during model shutdown:', error);
    }
  }
  isLoggedIn = false;
}

// Note: Previously had EnhancedMultiUser wrapper to fix key generation issues,
// but this has been fixed upstream in one.models, so we can use MultiUser directly

/**
 * Create a new authenticator instance
 * This happens BEFORE login - minimal setup only
 */
export async function createInstance(): Promise<MultiUser> {
  // Check if instance already exists
  if (authInstance) {
    return authInstance;
  }
  
  try {
    // Don't initialize platform here - it should happen after login
    // when we have user context and are ready to start networking
    
    // Create auth instance using standard MultiUser (fixed upstream)
    authInstance = new MultiUser({
      directory: APP_CONFIG.name,
      recipes: [
        ...RecipesStable,
        ...RecipesExperimental,
        ...ALL_RECIPES
      ],
      reverseMaps: new Map<OneObjectTypeNames, Set<string>>([
        ['Someone', new Set(['personId', 'mainProfile', 'identities'])],
        ['Profile', new Set(['personId', 'owner'])]
      ]),
      reverseMapsForIdObjects: new Map([
        ['AIMetadata', new Set(['filename'])]
      ]) as unknown as Map<keyof OneVersionedObjectInterfaces, Set<string>>
    });
    
    // Attach handlers once - only the first time we create the instance
    await attachAuthHandlers(authInstance);
    return authInstance;
  } catch (error) {
    console.error('[Initialization] Error creating authenticator instance:', error);
    throw error;
  }
}

/**
 * Attach login/logout handlers to the authenticator
 * This is separated to ensure we only attach handlers once
 */
async function attachAuthHandlers(auth: MultiUser): Promise<void> {
  // Prevent multiple handler attachments
  if (handlersAttached) {
    return;
  }

  try {
    // Check if onStateChange is available for debugging
    if (auth.authState && auth.authState.onStateChange && typeof auth.authState.onStateChange.listen === 'function') {
      auth.authState.onStateChange.listen((oldState, newState) => {
        // Only log critical state changes
        if (oldState !== newState && (newState === 'logged_in' || newState === 'logged_out')) {
          console.log(`[Initialization] AUTH STATE CHANGE: ${oldState} -> ${newState}`);
        }
      });
    }

    // Set up login/logout handlers
    const onLoginUnsubscribe = auth.onLogin.listen(async (instanceName: string, secret: string) => {
      try {
        // CRITICAL: Prevent concurrent login attempts
        if (isLoginInProgress) {
          return;
        }
        
        if (isLoggedIn) {
          return;
        }
        
        // Set login in progress flag
        isLoginInProgress = true;
        
        // MINIMAL WORK: Only store credentials and set basic state
        // Don't let credential storage failure prevent login
        try {
          await storeCredentials(instanceName, secret);
        } catch (credError) {
          console.warn('[Login] Failed to store credentials, continuing anyway:', credError);
        }
        
        // Set logged in state immediately - model initialization will happen later
        isLoggedIn = true;
        
      } catch (error: any) {
        console.error('[Initialization] ❌ CRITICAL: Login handler failed:', error);
        
        // CRITICAL: If login handler fails, we must not be in logged in state
        isLoggedIn = false;
        
        // Force auth state back to logged_out if login failed
        try {
          await auth.logout();
        } catch (logoutError) {
          console.error('[Initialization] ❌ Failed to logout after login failure:', logoutError);
        }
      } finally {
        // Always clear login progress flag
        isLoginInProgress = false;
      }
    });

    auth.onLogout(async () => {
      const wasLoggedIn = isLoggedIn; // Store previous state
      isLoggedIn = false; // Update state immediately
      isLoginInProgress = false; // Reset login progress flag
      
      // CRITICAL: Wrap everything in try-catch to ensure logout handler NEVER fails
      // If this handler throws, it could prevent MultiUser from completing logout
      // and transitioning to 'logged_out' state
      
      // A. Clear stored credentials first
      try {
        await clearStoredCredentials();
      } catch (error) {
        console.error('[Initialization] ❌ Error clearing credentials during logout:', error);
        // Continue anyway - don't let this block logout
      }
      
      // B. Shutdown the model
      try {
        const model = ModelService.getModel();
        if (model) {
          await model.shutdown();
        }
      } catch (error) {
        console.error('[Initialization] ❌ Error during model shutdown:', error);
        // Continue anyway - don't let this block logout
      } finally {
        // Always clear model reference regardless of shutdown success
        try {
          ModelService.clearModel();
        } catch (error) {
          console.error('[Initialization] ❌ Error clearing model reference:', error);
        }
      }
      
      // C. Clear app journal context to prevent errors during shutdown
      try {
        const { clearAppJournalContext } = await import('../utils/appJournal');
        clearAppJournalContext();
      } catch (error) {
        console.error('[Initialization] ❌ Error clearing app journal context:', error);
        // Continue anyway - don't let this block logout
      }

      // C2. Clear key cache
      keyCache.clearCache();
      
      // D. Clear ChannelManager instance to reset registry cache
      try {
        clearChannelManagerInstance();
      } catch (error) {
        console.error('[Initialization] ❌ Error clearing ChannelManager instance:', error);
        // Continue anyway - don't let this block logout
      }

      // E. Close storage only if the user was actually logged in before
      if (wasLoggedIn) {
        try {
          closeStorage(); // Call closeStorage
        } catch (error) {
          console.error('[Initialization] ❌ Error closing storage:', error);
          // Continue anyway - don't let this block logout
        }
      }
      
      // F. Clear authInstance to force recreation on next login
      // This is critical to avoid recipe registry conflicts
      authInstance = undefined;
    });
    
    handlersAttached = true;
  } catch (error) {
    console.error('[Initialization] Error attaching auth handlers:', error);
    throw error;
  }
}

/**
 * Initialize the message bus
 * Only called AFTER successful login
 */
const initializeMessageBus = async () => {
  try {
    // Subscribe to MessageBus to capture one.models debug output
    await subscribeToMessageBus();
    
    return true;
  } catch (error) {
    console.error('[Initialization] Failed to initialize message bus:', error);
    return false;
  }
};

/**
 * Main model initialization after successful login
 * Should only be called ONCE per login
 */
export async function initModel(auth?: MultiUser, secret?: string): Promise<AppModel> {
  const initStartTime = Date.now();
  console.log('[PERF] Starting initModel...');

  // If model already exists, return it
  const existingModel = getModel();
  if (existingModel) {
    return existingModel;
  }

  // Use provided auth or get from global state
  const authenticator = auth || getAuthenticator();
  if (!authenticator) {
    throw new Error('No authenticator available for model initialization');
  }

  const instanceId = getInstanceIdHash();
  if (!instanceId) {
    throw new Error('Instance ID hash not available after login');
  }

  // Recipes are already registered via MultiUser constructor - no need to duplicate

  const storageOptions: InitStorageOptions = {
    instanceIdHash: instanceId,
    name: APP_CONFIG.name,
    encryptStorage: false,
    secretForStorageKey: secret || null
  };
  
  await measureTime('initStorage', async () => {
    const result = await initStorage(storageOptions);
    performanceSummary.record('initStorage', Date.now() - Date.now());
    return result;
  });

  // CRITICAL: Initialize ObjectEventDispatcher BEFORE any components that depend on it
  if (!objectEventsInitialized) {
    await measureTime('objectEvents.init', async () => {
      await objectEvents.init();
      objectEventsInitialized = true;
    });
  }

  const commServerUrl = getNetworkSettingsService().getCommServerUrl();
  const leuteModel = await measureTime('LeuteModel.init', async () => {
    const startTime = Date.now();
    const model = new LeuteModel(commServerUrl, true);
    await model.init();
    performanceSummary.record('LeuteModel.init', Date.now() - startTime);
    return model;
  });

  // Use the singleton to ensure only one instance (using static imports)
  const channelManager = await measureTime('ChannelManager init', async () => {
    const manager = createChannelManager(leuteModel);
    await initializeChannelManager();
    return manager;
  });
  
  const transportManager = await measureTime('TransportManager.init', async () => {
    const manager = new TransportManager(leuteModel, channelManager, commServerUrl);
    await manager.init();
    return manager;
  });
  
  const getGroupIdByName = async (name: string) => {
    const group = await leuteModel.createGroup(name);
    return group.groupIdHash;
  };

  // Parallelize group creation
  const [iomGroupId, leuteReplicantGroupId, glueReplicantGroupId, everyoneGroupId] = await measureTime(
    'Group creation (parallel)',
    () => Promise.all([
      getGroupIdByName('iom'),
      getGroupIdByName('leute-replicant'),
      getGroupIdByName('glue-replicant'),
      getGroupIdByName('everyone')
    ])
  );

  // Use statically imported LeuteAccessRightsManager
  const leuteAccessRightsManager = new LeuteAccessRightsManager(
    channelManager,
    transportManager.getConnectionsModel(),
    leuteModel
  );
  
  try {
    // Pass groups configuration like one.leute does
    const groups = {
      iom: iomGroupId,
      leuteReplicant: leuteReplicantGroupId,
      glueReplicant: glueReplicantGroupId,
      everyone: everyoneGroupId
    };
    await leuteAccessRightsManager.init(groups);
  } catch (error) {
    console.error('[initModel] ❌ CRITICAL: LeuteAccessRightsManager initialization failed:', error);
    console.error('[initModel] ❌ This will prevent CHUM sync from working!');
    throw error; // Don't continue with broken access rights
  }

  // ChannelManager was already initialized earlier, before creating LeuteAccessRightsManager

  // Initialize platform services (UDP, BTLE, QUIC) now that we have user context
  if (!platformInitialized) {
    await measureTime('initializePlatform', async () => {
      await initializePlatform();
      platformInitialized = true;
    });
  }

  // Start networking AFTER all core components are properly integrated
  // But defer this to not block UI
  const networkingPromise = transportManager.startNetworking().catch(netErr => {
    console.error('[initModel] ❌ Failed to start networking layer:', netErr);
    // Continue initialization – the user can still use local features; networking can be retried later
  });

  // Create AppModel
  const appModel = await measureTime('AppModel.init', async () => {
    const model = new AppModel({
      leuteModel,
      channelManager,
      transportManager,
      authenticator,
      leuteAccessRightsManager,
      llmManager: undefined // Will be created after AppModel.init()
    });
    await model.init();
    return model;
  });

  // Wait for networking to complete (non-blocking for UI)
  await networkingPromise;
  
  // Defer DeviceDiscoveryModel journal configuration - not critical for UI
  const personId = getInstanceOwnerIdHash();
  if (personId) {
    // Import and defer the journal setup
    const { deferUntilAfterRender } = await import('../utils/startupOptimization');

    deferUntilAfterRender(async () => {
      console.log('[initModel] 📱 Setting up DeviceDiscoveryModel journal channel (deferred)...');
      const deviceDiscoveryModel = appModel.deviceDiscoveryModel;
      if (!deviceDiscoveryModel) {
        console.error('[initModel] ❌ DeviceDiscoveryModel not available on AppModel for journal setup');
        return;
      }

      try {
        await deviceDiscoveryModel.setChannelManager(channelManager);
        console.log('[initModel] ✅ DeviceDiscoveryModel journal channel configured');
      } catch (error) {
        console.error('[initModel] ❌ Failed to setup DeviceDiscoveryModel journal channel:', error);
      }
    });

      // Initialize app journal immediately (but don't block on channel history loading)
      console.log('[initModel] 📱 Initializing app journal...');
      const { initializeAppJournal, logAppStart } = await import('../utils/appJournal');
      const journalChannelId = `app-lifecycle-journal-${personId}`;

      try {
        // Create or get the app journal channel
        await channelManager.createChannel(journalChannelId, personId);
      } catch (error) {
        if (!error.message?.includes('already exists')) {
          console.error('[initModel] Error creating app journal channel:', error);
        }
      }

      // Initialize immediately so screen tracking works
      initializeAppJournal(channelManager, journalChannelId, personId);
      console.log('[initModel] ✅ App journal initialized');

      // Defer app start logging to avoid blocking
      deferUntilAfterRender(async () => {
        try {
          const startupTime = Date.now() - (global.APP_START_TIME || Date.now());
          await logAppStart(startupTime);
          console.log('[initModel] ✅ App start logged (deferred)');
        } catch (error) {
          console.error('[initModel] Error logging app start:', error);
        }
      });
      
      // Initialize DeviceDiscoveryModel core dependencies immediately
      // This ensures it's ready to handle discovery packets when they arrive
      console.log('[initModel] 📱 Setting up DeviceDiscoveryModel prerequisites...');
      try {
        const { TrustModel } = await import('../models/TrustModel');
        const { QuicModel } = await import('../models/network/QuicModel');

        // Get identity from TrustModel
        const trustModel = new TrustModel(leuteModel);
        await trustModel.init();
        const identity = trustModel.getDeviceCredentials();

        if (identity) {
          // Get QuicModel instance and initialize with discovery port
          const quicModel = QuicModel.getInstance();
          if (!quicModel.isInitialized()) {
            console.log('[initModel] Initializing QuicModel with discovery port 49497');
            await quicModel.init({ port: 49497, host: '0.0.0.0' });
          }

          // Use the DeviceDiscoveryModel instance from AppModel
          const deviceDiscoveryModel = appModel.deviceDiscoveryModel;
          if (!deviceDiscoveryModel) {
            console.error('[initModel] ❌ DeviceDiscoveryModel not available on AppModel');
            return;
          }

          // Set up DeviceDiscoveryModel
          deviceDiscoveryModel.setQuicModel(quicModel);
          await deviceDiscoveryModel.setOwnIdentity(
            identity.deviceId.toString(),
            identity.secretKey,
            identity.publicKey
          );
          
          // Create VCManager BEFORE initializing DeviceDiscoveryModel
          const { VCManager } = await import('../models/network/vc/VCManager');
          const vcConfig = {
            transport: quicModel.getTransport(),
            ownPersonId: personId,
            getIssuerPublicKey: async (issuerPersonId: any) => {
              try {
                const someoneElse = await leuteModel.getSomeoneElse(issuerPersonId);
                if (someoneElse && someoneElse.person) {
                  const signKeyHex = await leuteModel.getHexSignKey(someoneElse.person);
                  return signKeyHex || null;
                }
                return null;
              } catch (error) {
                console.error('[initModel] Error getting issuer public key:', error);
                return null;
              }
            },
            verifyVCSignature: async (vc, issuerPublicKeyHex) => {
              console.log('[initModel] VC signature verification not yet implemented');
              return true;
            }
          };
          
          const vcManager = new VCManager(vcConfig);
          await vcManager.init();
          deviceDiscoveryModel.setVCManager(vcManager);
          console.log('[initModel] ✅ VCManager created and set on DeviceDiscoveryModel');
          
          // Initialize DeviceDiscoveryModel immediately with VCManager in place
          // This ensures it's ready to handle discovery packets right away
          const discoveryInitialized = await deviceDiscoveryModel.init();
          if (discoveryInitialized) {
            console.log('[initModel] ✅ DeviceDiscoveryModel initialized successfully');

            // DeviceDiscoveryModel is already attached to AppModel during AppModel.init()

            // Connect DeviceSettingsService if available
            const { createDeviceSettingsService } = await import('../services/createDeviceSettingsService');
            const settingsService = await createDeviceSettingsService(appModel);
            deviceDiscoveryModel.setSettingsService(settingsService);
            console.log('[initModel] ✅ DeviceSettingsService connected to DeviceDiscoveryModel');

            // DeviceDiscoveryModel initialized successfully
          } else {
            console.error('[initModel] ❌ Failed to initialize DeviceDiscoveryModel');
          }
        } else {
          console.error('[initModel] ❌ No device identity available for DeviceDiscoveryModel');
        }
      } catch (initError) {
        console.error('[initModel] ❌ Error initializing DeviceDiscoveryModel:', initError);
        // Don't fail the entire initialization if device discovery fails
      }
  } else {
    console.warn('[initModel] ⚠️ PersonId not available for DeviceDiscoveryModel journal setup');
  }

  // Initialize AI models in parallel - they don't block the UI since they're async
  // Starting them immediately ensures they're ready when the user needs them
  (async () => {
    console.log('[initModel] 🤖 Creating LLMManager (parallel)...');
    try {
      const llmManager = await LLMManager.getInstance({
        channelManager: channelManager,
        fs: { type: 'StorageStreams' } as any,
        leuteModel: leuteModel
      });
      (appModel as any)._llmManager = llmManager;
      console.log('[initModel] ✅ LLMManager created successfully');

      // Create MCPManager
      console.log('[initModel] 🔧 Creating MCPManager...');
      const { MCPManager } = await import('../models/mcp/MCPManager');
      const mainIdentity = await leuteModel.myMainIdentity();

      if (mainIdentity) {
        const mcpManager = new MCPManager(mainIdentity);
        mcpManager.setDependencies(transportManager, transportManager.quicModel, leuteModel);
        await mcpManager.init();
        (appModel as any).mcpManager = mcpManager;
        (llmManager as any).setMCPManager(mcpManager);
        console.log('[initModel] ✅ MCPManager created successfully');

        // Create and start MCP Server for external communication
        console.log('[initModel] 🌐 Creating MCP Server...');
        const { MCPServer } = await import('../models/mcp/MCPServer');
        const mcpServer = new MCPServer({
          port: 3000,
          appModel: appModel
        });
        (appModel as any).mcpServer = mcpServer;
        console.log('[initModel] ✅ MCP Server created (WebSocket server implementation needed)');
      }

      // Create AIAssistantModel
      console.log('[initModel] 🤖 Creating AIAssistantModel...');
      const { default: AIAssistantModel } = await import('../models/ai/assistant/AIAssistantModel');
      const me = await leuteModel.me();
      const mainProfile = await me.mainProfile();

      if (mainIdentity && mainProfile) {
        const aiAssistantModel = new AIAssistantModel(mainIdentity, mainProfile.idHash);
        aiAssistantModel.setAppModel(appModel as any);
        await aiAssistantModel.init();
        (appModel as any).aiAssistantModel = aiAssistantModel;
        console.log('[initModel] ✅ AIAssistantModel created successfully');
      }
    } catch (error) {
      console.error('[initModel] ❌ Failed to create LLMManager/AIAssistantModel/MCPManager:', error);
    }
  })()


  // Single lazy-loaded debug helper
  if (__DEV__) {
    (global as any).loadDebugTools = async () => {
      console.log('[Debug] Loading debug tools...');
      try {
        const tools: any = {};

        // Load only essential debug tools on demand
        const { diagnoseMessageExchange } = await import('../utils/messageExchangeDiagnostic');
        tools.diagnoseMessageExchange = diagnoseMessageExchange;

        // Assign to global
        Object.assign(global, tools);
        console.log('[Debug] ✅ Debug tools loaded:', Object.keys(tools));
        return tools;
      } catch (err) {
        console.error('[Debug] Failed to load debug tools:', err);
        return {};
      }
    };
    console.log('[initModel] Debug tools available - use loadDebugTools() when needed');
  }

  const totalTime = Date.now() - initStartTime;
  console.log(`[PERF] Total initModel time: ${totalTime}ms`);
  performanceSummary.record('Total initModel', totalTime);
  console.log('[initModel] 🎉 Model initialization completed successfully!');
  
  // Store the model in ModelService for global access
  ModelService.setModel(appModel);
  
  // UDP diagnostics removed - load on demand if needed
  
  
  
  // Now that AppModel is created and stored, set up the pairing success listener to use it
  const connectionsModelForTopics = transportManager.getConnectionsModel();
  if (connectionsModelForTopics?.pairing?.onPairingSuccess) {
    // Remove any existing listeners first
    if ((connectionsModelForTopics.pairing.onPairingSuccess as any).removeAllListeners) {
      (connectionsModelForTopics.pairing.onPairingSuccess as any).removeAllListeners();
    }
    
    const { ContactCreationService } = await import('../services/ContactCreationService');
    const contactService = new ContactCreationService(leuteModel);
    
    connectionsModelForTopics.pairing.onPairingSuccess.listen(async (
      isOutgoing: boolean,
      localPersonId: SHA256IdHash<Person>,
      localInstanceId: string,
      remotePersonId: SHA256IdHash<Person>,
      remoteInstanceId: string,
      token: string
    ) => {
      console.log('[initModel] 🎉 Pairing success detected! Creating contact and topic...', {
        isOutgoing,
        localPersonId: localPersonId?.toString().substring(0, 8) + '...',
        remotePersonId: remotePersonId?.toString().substring(0, 8) + '...'
      });
      
      try {
        // Create contact and 1-to-1 topic
        const success = await contactService.createContactFromPairing(
          remotePersonId,
          remoteInstanceId,
          token
        );
        
        if (success) {
          console.log('[initModel] ✅ Contact and topic created successfully after pairing');
        } else {
          console.error('[initModel] ❌ Failed to create contact/topic after pairing');
        }
      } catch (error) {
        console.error('[initModel] ❌ Error creating contact/topic after pairing:', error);
      }
    });
  }
  
  // Notify that model is ready
  onModelReady.emit();
  
  return appModel;
}

/**
 * Initialize the model after login is complete
 * This is now called by UI providers when they detect auth state is logged_in
 */
export async function initModelAfterLogin(): Promise<AppModel> {
  const authenticator = getAuthenticator();
  if (!authenticator) {
    throw new Error('No authenticator available for model initialization');
  }

  // Verify we're actually logged in
  if (authenticator.authState.currentState !== 'logged_in') {
    throw new Error('Cannot initialize model: user not logged in');
  }

  // Initialize the model
  const model = await initModel(authenticator);
  
  // Notify that model is ready
  onModelReady.emit();
  
  return model;
}

/**
 * Store user credentials securely for future sessions
 */
export async function storeCredentials(instanceName: string, secret: string): Promise<void> {
  try {
    // Use simple, static keys for storage
    const emailKey = 'lama_email';
    const secretKey = 'lama_secret';
    
    // Store instance name (email)
    await SettingsStore.setItem(emailKey, instanceName);
    
    // Store secret securely
    await SettingsStore.setItem(secretKey, secret);
  } catch (error: any) {
    console.error('[Initialization] ❌ Failed to store credentials:', error);
    // Don't throw - allow the app to continue without stored credentials
    // This way new user creation won't fail even if credential storage fails
  }
}

/**
 * Clear stored credentials (used on logout or when credentials are invalid)
 */
export async function clearStoredCredentials(): Promise<void> {
  try {
    // Use simple, valid keys for SecureStore
    const emailKey = 'lama_email';
    const secretKey = 'lama_secret';
    
    await SettingsStore.removeItem(emailKey);
    await SettingsStore.removeItem(secretKey);
  } catch (error) {
    console.error('[Initialization] Error clearing stored credentials:', error);
  }
}

/**
 * Check if user has stored credentials (without attempting login)
 */
export async function hasStoredCredentials(): Promise<boolean> {
  try {
    // Use simple, valid keys for SecureStore
    const emailKey = 'lama_email';
    const secretKey = 'lama_secret';
    
    const storedEmail = await SettingsStore.getItem(emailKey) as string | undefined;
    const storedSecret = await SettingsStore.getItem(secretKey) as string | undefined;
    return !!(storedEmail && storedSecret);
  } catch (error) {
    console.error('[Initialization] Error checking stored credentials:', error);
    return false;
  }
}

/**
 * Verify secret keys are accessible after login and storage initialization
 */
async function verifySecretKeysAfterLogin(
    person: SHA256IdHash<Person>
): Promise<void> {
  try {
        // Check if default keys exist before attempting to create crypto API
        const keysExist = await hasDefaultKeys(person);
        if (!keysExist) {
            return;
        }
        
        // Get detailed key information for diagnostics
        const listOfKeys = await getListOfKeys(person);
        
        // Try to get the default keys hash
        const defaultKeysHash = await getDefaultKeys(person);
      
        // Check if secret key files exist at the storage level
        const secretKeysExist = await hasSecretKeys(defaultKeysHash);
        
        if (!secretKeysExist) {
            // This is a known mobile environment issue - app will continue with limited pairing functionality
            return;
        }
        
        // Attempt to create crypto API - this is where CYENC-SYMDEC typically occurs
        try {
            const cryptoApi = await createCryptoApiFromDefaultKeys(person);
            
            // Test basic crypto operations if available
            try {
                // Simple test to verify crypto functionality
                const testData = new Uint8Array([1, 2, 3, 4, 5]);
                
                // Test if we can access encryption functions
                if (cryptoApi && typeof cryptoApi.encrypt === 'function') {
                    // Crypto API functions are accessible
                }
            } catch (cryptoTestError) {
                // Crypto operation test failed
            }
            
        } catch (cryptoError) {
            // Known mobile environment issue - app will continue with limited pairing functionality
            // Run comprehensive diagnostic to identify the exact issue
            await diagnosticCryptoKeyCreation(person);
    }
        
    } catch (error: any) {
        console.error(`[Initialization] INITIALIZATION FAILED:`, error);
        
        // Don't throw - allow app to continue with limited functionality
  }
}

/**
 * Debug function to check current auth state
 * Useful for diagnosing auth state machine issues
 */
export function debugAuthState(): void {
  const auth = getAuthenticator();
  if (auth) {
    console.log(`[Debug] Current auth state: ${auth.authState?.currentState}`);
    console.log(`[Debug] isLoggedIn flag: ${isLoggedIn}`);
    console.log(`[Debug] Model exists: ${!!ModelService.getModel()}`);
  } else {
    console.log('[Debug] No authenticator available');
  }
}

/**
 * Logout the current user and clear all stored data
 */
export async function logout(): Promise<void> {
  try {
    const auth = getAuthenticator();
    if (!auth) {
      console.warn('[Initialization] No authenticator available for logout');
      return;
    }
    
    // Clear stored credentials first
    await clearStoredCredentials();
    
    // Trigger logout through the authenticator
    // This will trigger the onLogout handler which clears the model and storage
    await auth.logout();
  } catch (error) {
    console.error('[Initialization] Error during logout:', error);
    throw error;
  }
}

/**
 * Complete app data deletion - removes all user data and resets the app
 * This is a destructive operation that cannot be undone
 */
export async function deleteAllAppData(): Promise<void> {
  try {
    console.log('[Initialization] 🗑️ Starting complete app data deletion...');
    
    // Import RNFS for direct file system access
    const RNFS = require('react-native-fs');
    
    // First logout to properly close connections
    try {
      await logout();
    } catch (logoutError) {
      console.warn('[Initialization] ⚠️ Logout error during reset:', logoutError);
    }
    
    // Delete ALL app storage directly
    try {
      const documentsPath = RNFS.DocumentDirectoryPath;
      console.log('[Initialization] Deleting all files in:', documentsPath);
      
      // List all files and directories
      const items = await RNFS.readDir(documentsPath);
      
      // Delete everything
      for (const item of items) {
        try {
          if (item.isDirectory()) {
            await RNFS.unlink(item.path);
            console.log('[Initialization] Deleted directory:', item.name);
          } else {
            await RNFS.unlink(item.path);
            console.log('[Initialization] Deleted file:', item.name);
          }
        } catch (itemError) {
          console.warn('[Initialization] Could not delete:', item.path, itemError);
        }
      }
      
      console.log('[Initialization] ✅ All storage files deleted');
    } catch (storageError) {
      console.error('[Initialization] Storage deletion error:', storageError);
    }
    
    // Clear AsyncStorage as well
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.clear();
      console.log('[Initialization] ✅ AsyncStorage cleared');
    } catch (asyncError) {
      console.warn('[Initialization] Could not clear AsyncStorage:', asyncError);
    }
    
    // Clear all state flags
    isLoggedIn = false;
    isLoginInProgress = false;
    isModelInitInProgress = false;
    objectEventsInitialized = false;
    platformInitialized = false;
    handlersAttached = false;
    
    // Clear authenticator reference to force recreation
    authInstance = undefined;
    
    // Clear model reference
    try {
      await clearModel();
    } catch (clearError) {
      console.warn('[Initialization] ⚠️ Model clear error:', clearError);
    }
    
    console.log('[Initialization] ✅ App data deletion completed successfully');
    
  } catch (error) {
    console.error('[Initialization] ❌ Error during complete app data deletion:', error);
    // Don't throw - we want the app to navigate to login even if there were errors
    console.log('[Initialization] Continuing to login screen despite errors...');
  }
}

// Remove the incomplete function - debug logging will be called from initModel instead

// Add cleanup function
export async function cleanupApp(): Promise<void> {
  console.log('[SingletonInitializer] Starting app cleanup...');
  
  // Log app stop event before cleanup
  try {
    const { logAppStop } = await import('../utils/appJournal');
    await logAppStop('app_termination');
    console.log('[SingletonInitializer] Logged app stop event');
  } catch (error) {
    console.error('[SingletonInitializer] Error logging app stop:', error);
  }
  
  const model = getModel();
  if (model) {
    try {
      console.log('[SingletonInitializer] Shutting down AppModel...');
      await model.shutdown();
      console.log('[SingletonInitializer] AppModel shutdown complete');
    } catch (error) {
      console.error('[SingletonInitializer] Error during AppModel shutdown:', error);
    }
  }
  
  // Cleanup UDP sockets
  const udpModel = UdpModel.getInstance();
  if (udpModel.isInitialized()) {
    try {
      console.log('[SingletonInitializer] Shutting down UdpModel...');
      await udpModel.shutdown();
      console.log('[SingletonInitializer] UdpModel shutdown complete');
    } catch (error) {
      console.error('[SingletonInitializer] Error during UdpModel shutdown:', error);
    }
  }
  
  console.log('[SingletonInitializer] App cleanup complete');
}

export default {
  createInstance,
  getModel,
  getAuthenticator,
  clearModel,
  initModel,
  cleanupApp
};

/**
 * Test AppModel initialization to see where it fails
 */
export async function testAppModelInit(): Promise<void> {
  try {
    // Get existing AppModel instance (should be created by initModel)
    const appModel = getModel();
    if (!appModel) {
      console.log('[TEST] No AppModel instance available - initModel() may not have completed');
      return;
    }
    
    console.log('[TEST] AppModel instance obtained, current state:', appModel.state.currentState);
    
    // Test connections access
    try {
      const connections = appModel.connections;
      console.log('[TEST] Connections available:', !!connections);
      console.log('[TEST] Pairing available:', !!connections?.pairing);
    } catch (connectionsError) {
      console.error('[TEST] Connections access failed:', connectionsError instanceof Error ? connectionsError.message : String(connectionsError));
    }
    
  } catch (error) {
    console.error('[TEST] AppModel initialization test failed:', error);
  }
}

// Test function available for manual debugging - not called automatically
// Call testAppModelInit() manually in console if needed for debugging 

// ✅ NEW: Simple event emitter for model initialization state
class ModelReadyEmitter {
  private listeners: (() => void)[] = [];
  on(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  emit() {
    this.listeners.forEach(l => l());
  }
}
export const onModelReady = new ModelReadyEmitter(); 

// CommServer URL configuration is handled internally

// Add crypto diagnostic function after the verifySecretKeysAfterLogin function
export async function diagnosticCryptoKeyCreation(personId: SHA256IdHash<Person>): Promise<void> {
    try {
        // Import the master key manager directly
        const { MasterKeyManager } = await import('@refinio/one.core/lib/keychain/master-key-manager');
        const { readPrivateBinaryRaw, writePrivateBinaryRaw } = await import('@refinio/one.core/lib/system/storage-base');
        const { deleteFile } = await import('@refinio/one.core/lib/system/storage-base-delete-file');
        const { STORAGE } = await import('@refinio/one.core/lib/storage-base-common');
        
        // 1. Test secret generation consistency
        const testSecret = 'demo123'; // The demo password
        
        // 2. Test key derivation consistency
        const { deriveSymmetricKeyFromSecret, createRandomSalt } = await import('@refinio/one.core/lib/crypto/encryption');
        
        const testSalt = createRandomSalt(16);
        
        // Derive key multiple times to test consistency
        const key1 = await deriveSymmetricKeyFromSecret(testSecret, testSalt);
        const key2 = await deriveSymmetricKeyFromSecret(testSecret, testSalt);
        const keysMatch = Array.from(key1).every((byte, index) => byte === key2[index]);
        
        if (!keysMatch) {
            console.error(`[CRYPTO_DIAGNOSTIC] Key derivation is not consistent! This is the root cause.`);
            return;
        }
        
        // 3. Test master key manager with test files
        const testMasterKeyFile = `test_master_key_${Date.now()}`;
        const testSaltFile = `test_salt_${Date.now()}`;
        
        try {
            const masterKeyManager = new MasterKeyManager(testMasterKeyFile, testSaltFile);
            
            // Load or create master key
            await masterKeyManager.loadOrCreateMasterKey(testSecret);
            
            // Test encryption/decryption
            const testData = new Uint8Array([1, 2, 3, 4, 5]);
            const encrypted = masterKeyManager.encryptDataWithMasterKey(testData);
            
            const decrypted = masterKeyManager.decryptDataWithMasterKey(encrypted);
            const dataMatches = Array.from(testData).every((byte, index) => byte === decrypted[index]);
            
            // Unload and reload to test persistence
            masterKeyManager.unloadMasterKey();
            await masterKeyManager.loadOrCreateMasterKey(testSecret);
            
            const decrypted2 = masterKeyManager.decryptDataWithMasterKey(encrypted);
            const persistenceTest = Array.from(testData).every((byte, index) => byte === decrypted2[index]);
            
            // Clean up test files
            masterKeyManager.unloadMasterKey();
            await deleteFile(testMasterKeyFile, STORAGE.PRIVATE);
            await deleteFile(testSaltFile, STORAGE.PRIVATE);
            
            if (dataMatches && persistenceTest) {
                // MasterKeyManager test PASSED - crypto system is working
                // The issue is likely with the actual secret or existing key files
                await diagnosticExistingKeys(personId, testSecret);
            } else {
                console.error(`[CRYPTO_DIAGNOSTIC] MasterKeyManager test FAILED - crypto system has issues`);
            }
            
        } catch (testError) {
            console.error(`[CRYPTO_DIAGNOSTIC] MasterKeyManager test failed:`, (testError as Error).message);
        }
        
    } catch (error) {
        console.error(`[CRYPTO_DIAGNOSTIC] Diagnostic failed:`, error);
    }
}

async function diagnosticExistingKeys(personId: SHA256IdHash<Person>, testSecret: string): Promise<void> {
    try {
        const { getDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain');
        const { readPrivateBinaryRaw } = await import('@refinio/one.core/lib/system/storage-base');
        
        // Get the default keys
        const defaultKeys = await getDefaultKeys(personId);
        if (!defaultKeys) {
            return;
        }
        
        // Try to read the actual key files
        const encryptionKeyFile = `encryption_key_${defaultKeys}`;
        const signKeyFile = `sign_key_${defaultKeys}`;
        const masterKeyFile = `master_key_${defaultKeys}`;
        const saltFile = `salt_${defaultKeys}`;
        
        // Check if files exist
        const exists = await Promise.all([
            readPrivateBinaryRaw(encryptionKeyFile),
            readPrivateBinaryRaw(signKeyFile),
            readPrivateBinaryRaw(masterKeyFile),
            readPrivateBinaryRaw(saltFile)
        ]).then(results => results.every(r => r !== null));

        if (!exists) {
            // One or more key files missing - this indicates:
            // 1. Keychain unlock failed or master key not loaded
            // 2. Secret key files were created with a different keychain unlock
            // 3. Storage corruption or file deletion
            // 4. Master key derivation inconsistency
            // WORKAROUND: Clear app storage and re-create keys
            console.error(`[CRYPTO_DIAGNOSTIC] One or more key files missing for person ${personId}`);
        }
        
    } catch (error) {
        console.error(`[CRYPTO_DIAGNOSTIC] ❌ Error analyzing existing key files:`, error);
    }
}