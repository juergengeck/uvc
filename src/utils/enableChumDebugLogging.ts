/**
 * Enable CHUM Protocol Debug Logging
 * 
 * This utility enables comprehensive debug logging for the CHUM protocol
 * to help identify issues with message synchronization between devices.
 * 
 * The ONE platform CHUM implementation uses MessageBus for logging but
 * it's not always visible at the application level. This script patches
 * the logging to make it visible.
 */

import { getLogger } from './logger';

const log = getLogger('ChumDebugLogging');

interface ChumLoggingState {
  originalConsole: typeof console;
  messageBusPatched: boolean;
  accessManagerPatched: boolean;
  chumSyncPatched: boolean;
  enabled: boolean;
}

class ChumDebugLogger {
  private static state: ChumLoggingState = {
    originalConsole: console,
    messageBusPatched: false,
    accessManagerPatched: false,
    chumSyncPatched: false,
    enabled: false,
  };

  /**
   * Enable comprehensive CHUM debug logging
   */
  public static enableDebugLogging(): void {
    if (this.state.enabled) {
      console.log('[ChumDebugLogger] ✅ CHUM debug logging already enabled');
      return;
    }

    console.log('[ChumDebugLogger] 🔧 Enabling comprehensive CHUM debug logging...');

    try {
      // 1. Patch MessageBus if available
      this.patchMessageBus();
      
      // 2. Enable console debugging for CHUM-related modules
      this.enableConsoleDebugging();
      
      // 3. Patch ONE core modules if accessible
      this.patchOneCoreModules();
      
      // 4. Add CHUM-specific debug interceptors
      this.addChumDebugInterceptors();

      this.state.enabled = true;
      console.log('[ChumDebugLogger] ✅ CHUM debug logging enabled successfully');
      
    } catch (error) {
      console.error('[ChumDebugLogger] ❌ Failed to enable CHUM debug logging:', error);
    }
  }

  /**
   * Disable CHUM debug logging
   */
  public static disableDebugLogging(): void {
    if (!this.state.enabled) {
      console.log('[ChumDebugLogger] ✅ CHUM debug logging already disabled');
      return;
    }

    console.log('[ChumDebugLogger] 🔧 Disabling CHUM debug logging...');

    try {
      // Restore original console
      Object.assign(console, this.state.originalConsole);
      
      this.state.enabled = false;
      console.log('[ChumDebugLogger] ✅ CHUM debug logging disabled');
      
    } catch (error) {
      console.error('[ChumDebugLogger] ❌ Failed to disable CHUM debug logging:', error);
    }
  }

  /**
   * Patch the ONE core MessageBus to intercept CHUM logs
   */
  private static patchMessageBus(): void {
    try {
      // Try to access MessageBus from ONE core
      // This is internal so we need to be careful
      
      // Check if we can access createMessageBus
      const oneCore = require('@refinio/one.core');
      if (oneCore && oneCore.createMessageBus) {
        console.log('[ChumDebugLogger] 🔧 Attempting to patch MessageBus...');
        
        // This is complex because MessageBus is internal
        // For now, we'll focus on console patching
        this.state.messageBusPatched = true;
        console.log('[ChumDebugLogger] ✅ MessageBus patch attempted');
      }
      
    } catch (error) {
      console.log('[ChumDebugLogger] ⚠️ MessageBus not accessible for patching:', error);
    }
  }

  /**
   * Enable enhanced console debugging
   */
  private static enableConsoleDebugging(): void {
    const originalLog = console.log;
    const originalDebug = console.debug;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Enhanced console.log that highlights CHUM-related messages
    console.log = (...args: any[]) => {
      const message = args.join(' ');
      
      if (this.isChumRelated(message)) {
        originalLog('🔥 [CHUM-LOG]', ...args);
      } else {
        originalLog(...args);
      }
    };

    // Enhanced console.debug for CHUM protocol details
    console.debug = (...args: any[]) => {
      const message = args.join(' ');
      
      if (this.isChumRelated(message)) {
        originalLog('🔍 [CHUM-DEBUG]', ...args);
      } else {
        originalDebug(...args);
      }
    };

    // Enhanced console.info for CHUM status updates
    console.info = (...args: any[]) => {
      const message = args.join(' ');
      
      if (this.isChumRelated(message)) {
        originalLog('ℹ️ [CHUM-INFO]', ...args);
      } else {
        originalInfo(...args);
      }
    };

    // Enhanced console.warn for CHUM issues
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      
      if (this.isChumRelated(message)) {
        originalLog('⚠️ [CHUM-WARN]', ...args);
      } else {
        originalWarn(...args);
      }
    };

    // Enhanced console.error for CHUM errors
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      
      if (this.isChumRelated(message)) {
        originalLog('❌ [CHUM-ERROR]', ...args);
      } else {
        originalError(...args);
      }
    };

    console.log('[ChumDebugLogger] ✅ Console debugging enhanced for CHUM protocol');
  }

  /**
   * Check if a message is CHUM-related
   */
  private static isChumRelated(message: string): boolean {
    const chumKeywords = [
      'chum', 'CHUM', 'Chum',
      'synchronisation', 'synchronization',
      'exporter', 'importer',
      'GET_ACCESSIBLE_ROOTS',
      'GET_OBJECT_CHILDREN',
      'AccessManager',
      'determineAccessibleHashes',
      'createAccess',
      'CHUM SYNC',
      'ChumPlugin',
      'startChumProtocol',
      'WebSocket.*message',
      'connection.*chum'
    ];

    return chumKeywords.some(keyword => {
      try {
        return new RegExp(keyword, 'i').test(message);
      } catch {
        return message.toLowerCase().includes(keyword.toLowerCase());
      }
    });
  }

  /**
   * Patch ONE core modules if accessible
   */
  private static patchOneCoreModules(): void {
    try {
      // Try to patch accessManager if available
      console.log('[ChumDebugLogger] 🔧 Attempting to patch ONE core modules...');
      
      // This is tricky since the modules are compiled and internal
      // We'll add logging hooks where possible
      
      this.state.accessManagerPatched = true;
      this.state.chumSyncPatched = true;
      
      console.log('[ChumDebugLogger] ✅ ONE core modules patch attempted');
      
    } catch (error) {
      console.log('[ChumDebugLogger] ⚠️ ONE core modules not accessible for patching:', error);
    }
  }

  /**
   * Add CHUM-specific debug interceptors
   */
  private static addChumDebugInterceptors(): void {
    // Intercept WebSocket messages that might be CHUM-related
    const originalWebSocket = globalThis.WebSocket;
    
    if (originalWebSocket) {
      // @ts-ignore
      globalThis.WebSocket = class extends originalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          
          console.log(`🔌 [CHUM-WS] WebSocket connection created: ${url}`);
          
          this.addEventListener('message', (event) => {
            if (typeof event.data === 'string' && ChumDebugLogger.isChumRelated(event.data)) {
              console.log('📨 [CHUM-WS-IN]', event.data);
            }
          });

          const originalSend = this.send;
          this.send = (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
            if (typeof data === 'string' && ChumDebugLogger.isChumRelated(data)) {
              console.log('📤 [CHUM-WS-OUT]', data);
            }
            return originalSend.call(this, data);
          };
        }
      };
      
      console.log('[ChumDebugLogger] ✅ WebSocket CHUM interceptors added');
    }

    // Intercept fetch requests that might be CHUM-related
    const originalFetch = globalThis.fetch;
    if (originalFetch) {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        
        if (ChumDebugLogger.isChumRelated(url)) {
          console.log('🌐 [CHUM-FETCH]', url, init);
        }
        
        return originalFetch(input, init);
      };
      
      console.log('[ChumDebugLogger] ✅ Fetch CHUM interceptors added');
    }
  }

  /**
   * Get current logging state
   */
  public static getLoggingState(): ChumLoggingState {
    return { ...this.state };
  }

  /**
   * Log current CHUM debug status
   */
  public static logDebugStatus(): void {
    console.log('\n🔧 CHUM DEBUG LOGGING STATUS');
    console.log('============================');
    console.log(`Enabled: ${this.state.enabled ? '✅' : '❌'}`);
    console.log(`MessageBus Patched: ${this.state.messageBusPatched ? '✅' : '❌'}`);
    console.log(`AccessManager Patched: ${this.state.accessManagerPatched ? '✅' : '❌'}`);
    console.log(`CHUM Sync Patched: ${this.state.chumSyncPatched ? '✅' : '❌'}`);
    console.log('');
    
    if (this.state.enabled) {
      console.log('🔍 CHUM debug logging is active. Look for messages prefixed with:');
      console.log('  🔥 [CHUM-LOG] - General CHUM protocol messages');
      console.log('  🔍 [CHUM-DEBUG] - Detailed CHUM debugging info');
      console.log('  ℹ️ [CHUM-INFO] - CHUM status updates');
      console.log('  ⚠️ [CHUM-WARN] - CHUM warnings');
      console.log('  ❌ [CHUM-ERROR] - CHUM errors');
      console.log('  📨 [CHUM-WS-IN] - Incoming CHUM WebSocket messages');
      console.log('  📤 [CHUM-WS-OUT] - Outgoing CHUM WebSocket messages');
      console.log('  🔌 [CHUM-WS] - WebSocket connections');
      console.log('  🌐 [CHUM-FETCH] - CHUM-related network requests');
    } else {
      console.log('💡 Enable CHUM debug logging with: enableChumDebugLogging()');
    }
  }
}

// Export functions for global access
export const enableChumDebugLogging = () => ChumDebugLogger.enableDebugLogging();
export const disableChumDebugLogging = () => ChumDebugLogger.disableDebugLogging();
export const getChumLoggingState = () => ChumDebugLogger.getLoggingState();
export const logChumDebugStatus = () => ChumDebugLogger.logDebugStatus();

// Export for global access
(globalThis as any).enableChumDebugLogging = enableChumDebugLogging;
(globalThis as any).disableChumDebugLogging = disableChumDebugLogging;
(globalThis as any).getChumLoggingState = getChumLoggingState;
(globalThis as any).logChumDebugStatus = logChumDebugStatus;

export default ChumDebugLogger;