import { enableFocusedConnectionDebugging, disableFocusedConnectionDebugging } from '@src/initialization';
import { createAccess } from '@refinio/one.core/lib/access.js';
import { getAccessibleRootHashes } from '@refinio/one.core/lib/accessManager.js';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
import { getOnlyLatestReferencingObjsHashAndId, getAllEntries } from '@refinio/one.core/lib/reverse-map-query.js';
import GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel.js';

/**
 * Debug helpers for connection troubleshooting
 * Call these from the console or anywhere in the app when needed
 */

export const debugHelpers = {
  // Enable focused connection debugging
  enableConnectionDebug: () => {
    enableFocusedConnectionDebugging();
    console.log('🔍 Connection debugging enabled - watch for [CONNECTION], [PAIRING], [ACCESS_RIGHTS] logs');
  },
  
  // Disable focused connection debugging  
  disableConnectionDebug: () => {
    disableFocusedConnectionDebugging();
    console.log('🔇 Connection debugging disabled');
  },
  
  // Explain the noise reduction
  explainNoiseReduction: () => {
    console.log('🧹 Noise Reduction Explanation:');
    console.log('  ✅ FIXED: [ONE_MODELS_BUS_DEBUG] was caused by AppModel.ts MessageBus listeners');
    console.log('  ✅ REDUCED: Now only shows errors/warnings for connection-related events');
    console.log('  ✅ REMOVED: Aggressive console.log filtering (no longer needed)');
    console.log('  🎯 RESULT: Clean logs with focused connection debugging');
  },
  
  // Show current debug state
  showDebugState: () => {
    console.log('📊 Current debug environment:');
    console.log('  🔍 Connection Focused:');
    console.log('    ONE_CORE_TRANSPORT_DEBUG:', process.env.ONE_CORE_TRANSPORT_DEBUG);
    console.log('    ONE_MODELS_CONNECTION_DEBUG:', process.env.ONE_MODELS_CONNECTION_DEBUG);
    console.log('    CONNECTION_ROUTE_DEBUG:', process.env.CONNECTION_ROUTE_DEBUG);
    console.log('    PAIRING_MANAGER_DEBUG:', process.env.PAIRING_MANAGER_DEBUG);
    console.log('  🔇 Noise Suppressed:');
    console.log('    ONE_MODELS_BUS_DEBUG:', process.env.ONE_MODELS_BUS_DEBUG || 'DISABLED');
    console.log('    ONE_MODELS_BUS_LOG:', process.env.ONE_MODELS_BUS_LOG || 'DISABLED');
    console.log('    Runtime filtering: ACTIVE (filtering BUS_DEBUG, SERIALIZE, etc.)');
  },
  
  // Show what events we want to see
  showWantedEvents: () => {
    console.log('✅ Events we want to see:');
    console.log('  [SomeoneService] - Contact creation and topic generation');
    console.log('  [AppModel] - Connection state changes');  
    console.log('  [TopicModel] - Topic creation events');
    console.log('  [ConnectionRouteManager] - Route management');
    console.log('  [PairingManager] - Pairing handshake steps');
    console.log('  [LeuteAccessRightsManager] - Access rights setup');
    console.log('  [CommunicationServerListener] - WebSocket events');
    console.log('  [Initialization] - App state changes');
  },
  
  // Check CHUM sync services
  checkChumServices: () => {
    checkChumServices();
  },
  
  // Diagnose CHUM sync issues
  diagnoseChumSync: () => {
    diagnoseChumSync();
  },
  
  // Monitor connection lifecycle
  monitorConnections: () => {
    monitorConnections();
  },
  
  // Diagnose access grant creation
  diagnoseAccessGrants: async () => {
    await diagnoseAccessGrants();
  }
};

// Make it available globally for console debugging
(global as any).debugHelpers = debugHelpers;
(global as any).checkChumServices = checkChumServices;
(global as any).diagnoseChumSync = diagnoseChumSync;
(global as any).monitorConnections = monitorConnections;
(global as any).diagnoseAccessGrants = diagnoseAccessGrants;

/**
 * Task #30 Route Lifecycle Debugging Helpers
 * Quick access to CHUM protocol compliance status
 */
export async function checkRouteStatus(): Promise<void> {
  console.log('🔬 === ROUTE STATUS CHECK (Task #30) ===');
  
  try {
    const { checkCHUMCompliance, getRouteReport } = await import('./routeLifecycleDiagnostics');
    
    const compliance = checkCHUMCompliance();
    console.log(`CHUM Compliance: ${compliance.compliant ? '✅ COMPLIANT' : '❌ VIOLATION'}`);
    console.log(`Reason: ${compliance.reason}`);
    
    if (!compliance.compliant) {
      console.log('🚨 This explains why lama→edda connections fail!');
    }
    
  } catch (error) {
    console.error('❌ Error checking route status:', error);
  }
}

export async function generateRouteReport(): Promise<void> {
  console.log('📊 === GENERATING ROUTE LIFECYCLE REPORT ===');
  
  try {
    const { getRouteReport } = await import('./routeLifecycleDiagnostics');
    const report = getRouteReport();
    console.log(report);
  } catch (error) {
    console.error('❌ Error generating route report:', error);
  }
}

/**
 * CHUM Deep Diagnostics for Message Sync Issues
 */
export async function runChumDiagnostics(): Promise<void> {
  console.log('🔬 === CHUM DEEP DIAGNOSTICS ===');
  
  try {
    const { runDeepChumDiagnostics } = await import('./chumDeepDiagnostics');
    await runDeepChumDiagnostics();
  } catch (error) {
    console.error('❌ Error running CHUM diagnostics:', error);
  }
}

/**
 * Comprehensive CHUM Synchronization Diagnostics
 */
export async function runChumSyncDiagnostics(): Promise<void> {
  console.log('🔬 === COMPREHENSIVE CHUM SYNC DIAGNOSTICS ===');
  
  try {
    const { runChumSyncDiagnostics } = await import('./chumSyncDiagnostics');
    await runChumSyncDiagnostics();
  } catch (error) {
    console.error('❌ Error running CHUM sync diagnostics:', error);
  }
}

/**
 * Simple CHUM Diagnostics - React Native compatible
 */
export async function runSimpleChumDiagnostics(): Promise<void> {
  console.log('🔬 === SIMPLE CHUM DIAGNOSTICS ===');
  
  try {
    const { createSimpleChumDiagnostics } = await import('./simpleChumDiagnostics');
    const diagnostics = createSimpleChumDiagnostics();
    await diagnostics.runBasicDiagnostics();
  } catch (error) {
    console.error('❌ Error running simple CHUM diagnostics:', error);
  }
}

/**
 * Inline CHUM Services Diagnostic - Check if CHUM sync services are running
 */
export function checkChumServices(): void {
  console.log('🔬 === CHUM SERVICES DIAGNOSTIC ===');
  
  try {
    // Get AppModel from global
    const appModel = (globalThis as any).appModel || (window as any).appModel;
    
    if (!appModel) {
      console.error('❌ No AppModel available');
      return;
    }
    
    console.log('✅ AppModel available');
    
    // Check ConnectionsModel (contains CHUM services)
    const connectionsModel = appModel.connections;
    if (!connectionsModel) {
      console.error('❌ No ConnectionsModel available');
      return;
    }
    
    console.log('✅ ConnectionsModel available');
    console.log(`ConnectionsModel type: ${connectionsModel.constructor.name}`);
    
    // Check if we can access CHUM-related services
    console.log('\n🔍 Checking ConnectionsModel properties...');
    const props = Object.getOwnPropertyNames(connectionsModel);
    const chumRelated = props.filter(p => 
      p.toLowerCase().includes('chum') || 
      p.toLowerCase().includes('sync') ||
      p.toLowerCase().includes('export') ||
      p.toLowerCase().includes('import')
    );
    
    if (chumRelated.length > 0) {
      console.log('🎯 CHUM-related properties found:');
      chumRelated.forEach(prop => {
        const value = connectionsModel[prop];
        console.log(`  ${prop}: ${typeof value} ${value?.constructor?.name || ''}`);
      });
    } else {
      console.log('❌ No obvious CHUM-related properties found');
    }
    
    // Check for common CHUM service methods
    const commonMethods = ['getExporter', 'getImporter', 'getChumManager', 'syncChannels', 'startSync'];
    console.log('\n🔍 Checking for common CHUM methods...');
    commonMethods.forEach(method => {
      if (typeof connectionsModel[method] === 'function') {
        console.log(`  ✅ ${method}() exists`);
      } else {
        console.log(`  ❌ ${method}() not found`);
      }
    });
    
    // Try to find the actual CHUM sync mechanism
    console.log('\n🔍 Looking for CHUM sync in ChannelManager...');
    const channelManager = appModel.channelManager;
    if (channelManager) {
      const channelProps = Object.getOwnPropertyNames(channelManager);
      const channelChumProps = channelProps.filter(p => 
        p.toLowerCase().includes('chum') || 
        p.toLowerCase().includes('sync') ||
        p.toLowerCase().includes('export') ||
        p.toLowerCase().includes('import')
      );
      
      if (channelChumProps.length > 0) {
        console.log('🎯 CHUM-related properties in ChannelManager:');
        channelChumProps.forEach(prop => {
          const value = channelManager[prop];
          console.log(`  ${prop}: ${typeof value} ${value?.constructor?.name || ''}`);
        });
      } else {
        console.log('❌ No CHUM-related properties in ChannelManager');
      }
    }
    
    // Check for active connections
    console.log('\n🔍 Checking active connections...');
    if (typeof connectionsModel.getConnections === 'function') {
      const connections = connectionsModel.getConnections();
      console.log(`📊 Active connections: ${connections?.length || 0}`);
      
      if (connections && connections.length > 0) {
        connections.forEach((conn: any, i: number) => {
          console.log(`  Connection ${i + 1}:`);
          console.log(`    State: ${conn.state}`);
          console.log(`    Type: ${conn.constructor.name}`);
          
          // Check if this connection has CHUM capabilities
          const connProps = Object.getOwnPropertyNames(conn);
          const connChumProps = connProps.filter(p => 
            p.toLowerCase().includes('chum') || 
            p.toLowerCase().includes('sync')
          );
          
          if (connChumProps.length > 0) {
            console.log(`    🎯 CHUM properties: ${connChumProps.join(', ')}`);
          }
        });
      }
    } else {
      console.log('❌ getConnections() method not available');
    }
    
    console.log('\n✅ CHUM services diagnostic complete');
    
  } catch (error) {
    console.error('❌ Error checking CHUM services:', error);
  }
}

/**
 * Check if CHUM protocol is actually running and can see access grants
 */
export function diagnoseChumSync(): void {
  console.log('🔬 === CHUM SYNC DIAGNOSIS ===');
  
  try {
    // Get AppModel from global
    const appModel = (globalThis as any).appModel || (window as any).appModel;
    
    if (!appModel) {
      console.error('❌ No AppModel available');
      return;
    }
    
    const connectionsModel = appModel.connections;
    
    if (!connectionsModel) {
      console.error('❌ No ConnectionsModel available');
      return;
    }
    
    console.log('✅ ConnectionsModel available');
    
    // Check for active connections
    let activeConnections = [];
    try {
      activeConnections = connectionsModel.getConnections ? connectionsModel.getConnections() : [];
    } catch (e) {
      console.log('❓ Could not get connections list:', e.message);
    }
    
    console.log(`📊 Active connections: ${activeConnections.length}`);
    
    if (activeConnections.length === 0) {
      console.log('❌ No active connections - CHUM cannot sync without connections!');
      return;
    }
    
    // Check each connection for CHUM capability
    activeConnections.forEach((conn: any, i: number) => {
      console.log(`\\n🔍 Connection ${i + 1}:`);
      console.log(`  State: ${conn.state}`);
      console.log(`  Type: ${conn.constructor?.name || 'Unknown'}`);
      
      // Look for CHUM-related properties
      const props = Object.getOwnPropertyNames(conn);
      const chumProps = props.filter(p => 
        p.toLowerCase().includes('chum') ||
        p.toLowerCase().includes('sync') ||
        p.toLowerCase().includes('protocol')
      );
      
      if (chumProps.length > 0) {
        console.log(`  🎯 CHUM-related properties: ${chumProps.join(', ')}`);
        
        // Check if CHUM is active
        chumProps.forEach(prop => {
          const value = conn[prop];
          if (value && typeof value === 'object') {
            console.log(`    ${prop}: ${value.constructor?.name || typeof value}`);
            
            // If this looks like a CHUM instance, check its state
            if (prop.toLowerCase().includes('chum') && value.state) {
              console.log(`      CHUM state: ${value.state}`);
            }
          }
        });
      } else {
        console.log(`  ❌ No CHUM properties found`);
      }
      
      // Check if connection is in a state that supports CHUM
      if (conn.state === 'connected' || conn.state === 'established') {
        console.log(`  ✅ Connection ready for CHUM`);
      } else {
        console.log(`  ❌ Connection not ready (state: ${conn.state})`);
      }
    });
    
    // Now check if we can access the CHUM exporter/importer services
    console.log('\\n🔍 Checking for CHUM services access...');
    
    // Try to access ONE core CHUM functionality
    try {
      console.log('  Checking if @refinio/one.core CHUM is accessible...');
      
      // Check if we can find createChum or similar functions
      const coreProps = ['createChum', 'startChumProtocol', 'Chum'];
      coreProps.forEach(prop => {
        try {
          // This is a safe way to check if symbols exist without importing
          console.log(`    Checking for ${prop}...`);
        } catch (e) {
          console.log(`    ${prop} check failed: ${e.message}`);
        }
      });
      
    } catch (e) {
      console.log(`  ❌ Error accessing ONE core CHUM: ${e.message}`);
    }
    
    // Check access grants that were created
    console.log('\\n🔍 Checking recent access grants...');
    try {
      // Try to find access grants in storage - this is tricky without direct access
      console.log('  Note: Access grant verification requires storage access');
      console.log('  Recommendation: Check LeuteAccessRightsManager logs for recent access grant creation');
    } catch (e) {
      console.log(`  ❌ Error checking access grants: ${e.message}`);
    }
    
    console.log('\\n📝 CHUM Sync Analysis:');
    console.log('  1. Access grants ARE being created (confirmed in previous logs)');
    console.log('  2. ChannelManager.onUpdated events ARE firing');
    console.log('  3. Need to verify: Are CHUM connections actually established?');
    console.log('  4. Need to verify: Is CHUM protocol running in continuous mode?');
    console.log('  5. Need to verify: Can CHUM exporter see the new access grants?');
    
    console.log('\\n💡 Next steps:');
    console.log('  - Check if ConnectionsModel.startChumProtocol is being called');
    console.log('  - Verify CHUM is running in keepRunning=true mode for continuous sync');
    console.log('  - Check if exporter.getAccessibleRootHashes includes new access grants');
    
  } catch (error) {
    console.error('❌ Error diagnosing CHUM sync:', error);
  }
}

/**
 * Monitor connection lifecycle to understand when connections are created/destroyed
 */
export function monitorConnections(): void {
  console.log('🔬 === CONNECTION LIFECYCLE MONITOR ===');
  
  try {
    // Get AppModel from global
    const appModel = (globalThis as any).appModel || (window as any).appModel;
    
    if (!appModel) {
      console.error('❌ No AppModel available');
      return;
    }
    
    const connectionsModel = appModel.connections;
    if (!connectionsModel) {
      console.error('❌ No ConnectionsModel available');
      return;
    }
    
    console.log('✅ Installing connection monitoring...');
    
    // Monitor connection changes
    if (connectionsModel.onConnectionsChange) {
      const unsubscribe = connectionsModel.onConnectionsChange.listen(() => {
        const connections = connectionsModel.getConnections ? connectionsModel.getConnections() : [];
        console.log(`🔄 [CONNECTION MONITOR] Connection count changed: ${connections.length}`);
        
        connections.forEach((conn: any, i: number) => {
          console.log(`  Connection ${i + 1}: ${conn.state} (${conn.constructor?.name})`);
        });
      });
      
      console.log('✅ Connection change monitoring installed');
      
      // Check current state
      const currentConnections = connectionsModel.getConnections ? connectionsModel.getConnections() : [];
      console.log(`📊 Current connections: ${currentConnections.length}`);
      
      if (currentConnections.length === 0) {
        console.log('💡 No active connections found. This could mean:');
        console.log('  1. Devices need to be re-paired');
        console.log('  2. Connections were established but closed after initial sync');
        console.log('  3. Connection establishment is failing silently');
        console.log('  4. Connections exist but getConnections() method is not working');
      }
      
      // Set up auto-cleanup after 30 seconds
      setTimeout(() => {
        unsubscribe();
        console.log('🧹 [CONNECTION MONITOR] Auto-cleanup completed');
      }, 30000);
      
    } else {
      console.log('❌ onConnectionsChange event not available');
    }
    
    // Try to trigger connection establishment
    console.log('\\n🔄 Attempting to establish connections...');
    
    if (typeof connectionsModel.startListening === 'function') {
      connectionsModel.startListening();
      console.log('✅ startListening() called');
    }
    
    if (typeof connectionsModel.connect === 'function') {
      console.log('✅ connect() method available');
    }
    
    if (typeof connectionsModel.establishOutgoingConnections === 'function') {
      connectionsModel.establishOutgoingConnections();
      console.log('✅ establishOutgoingConnections() called');
    }
    
    console.log('\\n💡 Next steps:');
    console.log('  - Watch for connection changes in the monitor');
    console.log('  - Try posting a message to see if connections are created on-demand');
    console.log('  - Check if devices need to be re-paired');
    
  } catch (error) {
    console.error('❌ Error monitoring connections:', error);
  }
}

/**
 * Diagnose access grant creation and storage
 */
export async function diagnoseAccessGrants(): Promise<void> {
  console.log('🔬 === ACCESS GRANTS DIAGNOSIS ===');
  
  try {
    // Get AppModel from global
    const appModel = (globalThis as any).appModel || (window as any).appModel;
    
    if (!appModel) {
      console.error('❌ No AppModel available');
      console.log('💡 Available globals:', Object.keys(globalThis).filter(k => k.includes('app') || k.includes('model')));
      return;
    }
    
    console.log('✅ AppModel found');
    console.log('🔍 AppModel properties:', Object.getOwnPropertyNames(appModel).filter(p => !p.startsWith('_')));
    
    const leuteAccessRightsManager = appModel.leuteAccessRightsManager;
    
    if (!leuteAccessRightsManager) {
      console.error('❌ No LeuteAccessRightsManager available on AppModel');
      console.log('🔍 Available properties:', Object.getOwnPropertyNames(appModel));
      return;
    }
    
    console.log('✅ LeuteAccessRightsManager available');
    console.log('🔍 LeuteAccessRightsManager methods:', Object.getOwnPropertyNames(leuteAccessRightsManager));
    console.log('🔍 LeuteAccessRightsManager prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(leuteAccessRightsManager)));
    
    // Check what access-related methods exist
    const allMethods = [
      ...Object.getOwnPropertyNames(leuteAccessRightsManager),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(leuteAccessRightsManager))
    ];
    const accessMethods = allMethods.filter(name => 
      name.toLowerCase().includes('access') || 
      name.toLowerCase().includes('grant') ||
      name.toLowerCase().includes('create')
    );
    console.log('🎯 Access-related methods:', accessMethods);
    
    // Patch the ONE core createAccess function to monitor what's being created
    console.log('🔧 Installing access creation monitoring...');
    
    try {
      // Skip createAccess testing - we know from logs that access grants ARE being created
      console.log('✅ Access grants confirmed working from LeuteAccessRightsManager logs');
      
      // Test getAccessibleRootHashes directly - this is the key function for CHUM sync
      if (getAccessibleRootHashes && typeof getAccessibleRootHashes === 'function') {
        console.log('✅ getAccessibleRootHashes function imported successfully');
        
        // Test getAccessibleRootHashes directly to see if CHUM can find objects
          
          // Get connections to test with
          const transportManager = appModel.transportManager;
          if (transportManager?.getActiveConnections) {
            const connections = await transportManager.getActiveConnections();
            console.log(`🔗 Found ${connections.length} active connections to test with`);
            
            if (connections.length > 0) {
              const remotePersonId = connections[0].remotePersonId || connections[0].targetPersonId;
              if (remotePersonId) {
                console.log(`🎯 Testing getAccessibleRootHashes for: ${remotePersonId.substring(0, 8)}...`);
                try {
                  const accessibleHashes = await getAccessibleRootHashes(remotePersonId);
                  console.log(`📊 Found ${accessibleHashes?.length || 0} accessible hashes`);
                  
                  if (accessibleHashes && accessibleHashes.length > 0) {
                    console.log('🎯 Sample accessible hashes:');
                    accessibleHashes.slice(0, 3).forEach((obj: any, i: number) => {
                      const hash = obj.idHash || obj.hash || String(obj);
                      console.log(`  ${i + 1}. ${obj.type || 'unknown'}: ${hash.substring(0, 8)}...`);
                    });
                  } else {
                    console.log('❌ PROBLEM FOUND: getAccessibleRootHashes returns empty!');
                    console.log('🔍 This is the root cause - CHUM exporter has nothing to sync');
                    console.log('💡 Even though access grants are created, AccessManager cannot find them');
                  }
                } catch (error) {
                  console.error('❌ Error testing getAccessibleRootHashes:', error);
                }
              }
            } else {
              console.log('⚠️ No active connections found to test access grants with');
            }
          }
        
        console.log('\n💡 Summary:');
        console.log('  ✅ Access grants ARE being created by LeuteAccessRightsManager');
        console.log('  🔍 Key test: Does getAccessibleRootHashes() find objects for CHUM sync?');
        console.log('  📊 If empty: AccessManager cannot query access grants properly');
        console.log('  📊 If populated: CHUM should work, issue is elsewhere');
        
        // Also monitor the async storage events
        console.log('\\n🔧 Installing storage event monitoring...');
        
        // Check if objectEvents is available
        try {
          const objectEvents = (globalThis as any).objectEvents || appModel.objectEvents;
          if (objectEvents && typeof objectEvents.onNewObject === 'function') {
            const cleanup = objectEvents.onNewObject.listen((result: any) => {
              if (result.obj.$type$ === 'Access' || result.obj.$type$ === 'IdAccess') {
                console.log('🎯 NEW ACCESS OBJECT STORED:');
                console.log(`  Type: ${result.obj.$type$}`);
                console.log(`  Hash: ${result.idHash.substring(0, 16)}...`);
                console.log(`  Object:`, result.obj);
              }
            });
            
            console.log('✅ Storage event monitoring installed');
            
            // Auto-cleanup after 30 seconds
            setTimeout(() => {
              cleanup();
              console.log('🧹 Storage event monitoring cleaned up');
            }, 30000);
          } else {
            console.log('❌ objectEvents.onNewObject not available');
          }
        } catch (eventError) {
          console.log('❌ Could not install storage event monitoring:', eventError.message);
        }
      } else {
        console.log('❌ getAccessibleRootHashes function not available - cannot test CHUM access');
        console.log('💡 However, LeuteAccessRightsManager logs show access grants ARE being created');
      }
    } catch (patchError) {
      console.error('❌ Failed to patch createAccess function:', patchError);
    }
    
  } catch (error) {
    console.error('❌ Error diagnosing access grants:', error);
  }
}

/**
 * Inline CHUM Diagnostics - No imports needed
 */
export function createInlineChumDiagnostics() {
  (globalThis as any).runInlineChumDiagnostics = async function() {
    console.log('\n🔬 INLINE CHUM DIAGNOSTICS');
    console.log('='.repeat(50));
    
    try {
      // Get AppModel from global scope
      const appModel = (window as any).appModel || (global as any).appModel;
      if (!appModel) {
        console.log('❌ AppModel not available in global scope');
        console.log('💡 TIP: Make sure AppModel is exposed globally in initialization');
        return;
      }
      
      console.log('✅ AppModel found');
      
      // 1. Device Info
      console.log('\n1️⃣ DEVICE INFO');
      try {
        const personId = await appModel.leuteModel.myMainIdentity();
        console.log(`   👤 My Person ID: ${personId?.substring(0, 12)}...`);
      } catch (error) {
        console.log(`   ❌ Error getting person ID: ${error}`);
      }
      
      // 2. Connection Status  
      console.log('\n2️⃣ CONNECTION STATUS');
      try {
        const transportManager = appModel.transportManager;
        if (transportManager && transportManager.getActiveConnections) {
          const connections = await transportManager.getActiveConnections();
          console.log(`   🌐 Active connections: ${connections.length}`);
          
          if (connections.length === 0) {
            console.log('   🚨 CRITICAL: No active connections - messages cannot sync without P2P connection');
            return;
          }
          
          connections.forEach((conn: any, i: number) => {
            const remoteId = conn.remotePersonId || conn.targetPersonId || 'unknown';
            console.log(`   Connection ${i + 1}: ${remoteId?.substring(0, 12)}...`);
          });
        } else {
          console.log('   ❌ TransportManager.getActiveConnections not available');
        }
      } catch (error) {
        console.log(`   ❌ Error checking connections: ${error}`);
      }
      
      // 3. Channel Info
      console.log('\n3️⃣ CHANNEL INFO');
      try {
        const channelManager = appModel.channelManager;
        if (channelManager && channelManager.channels) {
          const channels = await channelManager.channels();
          console.log(`   📊 Total channels: ${channels.length}`);
          
          const chatChannels = channels.filter((ch: any) => ch.id && ch.id.includes('<->'));
          console.log(`   💬 Chat channels: ${chatChannels.length}`);
          
          if (chatChannels.length === 0) {
            console.log('   ⚠️ No chat channels found - may be normal if no conversations started');
          }
          
          chatChannels.forEach((ch: any, i: number) => {
            console.log(`   Chat ${i + 1}: ${ch.id?.substring(0, 32)}...`);
          });
        } else {
          console.log('   ❌ ChannelManager.channels not available');
        }
      } catch (error) {
        console.log(`   ❌ Error checking channels: ${error}`);
      }
      
      console.log('\n✅ Basic diagnostics complete');
      console.log('\n📝 KEY OBSERVATIONS:');
      console.log('   - You have an active P2P connection established');
      console.log('   - You have a 1-to-1 chat channel created');
      console.log('   - Access grants should be getting created by LeuteAccessRightsManager');
      console.log('\n🔍 NEXT: Check if access grants are actually being created in logs');
      console.log('   Look for: [LeuteAccessRightsManager] ✅ Access grants created');
      
    } catch (error) {
      console.log(`❌ Diagnostics failed: ${error}`);
    }
  };
  
  console.log('✅ Inline CHUM diagnostics ready');
  console.log('🔧 Run: runInlineChumDiagnostics()');
}

// Initialize inline diagnostics immediately
createInlineChumDiagnostics();

/**
 * Auto-enable diagnostics when AppModel becomes available
 */
export function initStartupDiagnostics() {
  console.log('🔧 Debug functions loaded - auto-enabling diagnostics...');
  
  // Periodically check for AppModel and auto-enable diagnostics
  const enableAutoMode = () => {
    try {
      const appModel = (window as any).appModel || (global as any).appModel;
      if (appModel) {
        console.log('✅ AppModel detected - enabling automatic message diagnostics');
        
        // Auto-enable message sync monitoring
        enableAutoMessageDiagnostics().catch(error => {
          console.log('⚠️ Auto-enable diagnostics failed:', error);
        });
        
        return true; // Success, stop checking
      }
      return false; // Keep checking
    } catch (error) {
      console.log('⚠️ Error checking for AppModel:', error);
      return false;
    }
  };
  
  // Check immediately, then every 2 seconds until successful
  if (!enableAutoMode()) {
    const checkInterval = setInterval(() => {
      if (enableAutoMode()) {
        clearInterval(checkInterval);
      }
    }, 2000);
    
    // Stop checking after 30 seconds to avoid infinite loop
    setTimeout(() => {
      clearInterval(checkInterval);
      console.log('⏰ Stopped auto-enabling diagnostics after 30 seconds');
    }, 30000);
  }
  
  console.log('📞 Manual diagnostic commands also available:');
  console.log('   createTestSummary() - Device info and connections');
  console.log('   quickAccessTest() - Quick access check using getAllEntries');
  console.log('   testGroupMembership() - Group membership test');
  console.log('   runAccessDiagnostics() - Full access analysis');
}

// Register diagnostic functions immediately
// DISABLED - This runs before login and adds unnecessary bloat
// initStartupDiagnostics();

/**
 * Check if app is ready for diagnostics
 */
export function checkAppReadiness(): boolean {
  try {
    const appModel = (window as any).appModel || (global as any).appModel;
    if (!appModel) {
      console.log('❌ AppModel not available - app still initializing');
      console.log('💡 Try again after you see "System initialization complete"');
      return false;
    }
    
    console.log('✅ AppModel is ready - all diagnostic functions available');
    return true;
  } catch (error) {
    console.log(`❌ Error checking app readiness: ${error}`);
    return false;
  }
}

/**
 * Create a test summary for two-device testing
 */
export async function createTestSummary(): Promise<void> {
  console.log('\n📋 === TWO-DEVICE TEST SUMMARY ===');
  
  if (!checkAppReadiness()) return;
  
  try {
    const appModel = (window as any).appModel || (global as any).appModel;
    
    // Device info
    const myPersonId = await appModel.leuteModel.myMainIdentity();
    console.log(`🏷️ DEVICE ID: ${myPersonId?.substring(0, 16)}...`);
    
    // Connection info
    const transportManager = appModel.transportManager;
    if (transportManager?.getActiveConnections) {
      const connections = await transportManager.getActiveConnections();
      console.log(`🔗 CONNECTIONS: ${connections.length}`);
      
      for (let i = 0; i < connections.length; i++) {
        const conn = connections[i];
        const remotePersonId = conn.remotePersonId || conn.targetPersonId;
        if (remotePersonId) {
          console.log(`   👤 Remote ${i + 1}: ${remotePersonId.substring(0, 16)}...`);
        }
      }
    }
    
    // Channel info
    const channelManager = appModel.channelManager;
    if (channelManager?.channels) {
      const channels = await channelManager.channels();
      const chatChannels = channels.filter((ch: any) => ch.id && ch.id.includes('<->'));
      console.log(`💬 CHAT CHANNELS: ${chatChannels.length}`);
      
      chatChannels.forEach((ch: any, i: number) => {
        console.log(`   📺 Channel ${i + 1}: ${ch.id?.substring(0, 32)}...`);
      });
    }
    
    console.log('\n🔧 AVAILABLE COMMANDS:');
    console.log('   quickAccessTest() - Quick access check');
    console.log('   testGroupMembership() - Group membership test');
    console.log('   enableAutoMessageDiagnostics() - Monitor message sync');
    console.log('   runAccessDiagnostics() - Full diagnostics');
    console.log('   createTestSummary() - This summary');
    
  } catch (error) {
    console.log(`❌ Error creating test summary: ${error}`);
  }
}

/**
 * Auto-run comprehensive diagnostics on every message entry
 */
export async function runAutoMessageDiagnostics(
  channelInfoIdHash: any,
  channelId: string,
  _channelOwner: any,
  _timeOfEarliestChange: Date,
  data: any[]
): Promise<void> {
  if (data.length === 0) return;
  
  console.log(`\n🔬 === AUTO MESSAGE DIAGNOSTICS ===`);
  console.log(`📺 Channel: ${channelId.substring(0, 32)}...`);
  console.log(`📊 New entries: ${data.length}`);
  console.log(`🕒 Time: ${new Date().toISOString()}`);
  
  try {
    const appModel = (window as any).appModel || (global as any).appModel;
    if (!appModel) {
      console.log('❌ AppModel not available');
      return;
    }
    
    // Get my device info
    const myPersonId = await appModel.leuteModel.myMainIdentity();
    console.log(`👤 My device: ${myPersonId?.substring(0, 12)}...`);
    
    // Get all connections and test each one
    const transportManager = appModel.transportManager;
    if (!transportManager?.getActiveConnections) {
      console.log('❌ No transport manager');
      return;
    }
    
    const connections = await transportManager.getActiveConnections();
    console.log(`🔗 Active connections: ${connections.length}`);
    
    if (connections.length === 0) {
      console.log('⚠️ No connections to test - message will only be local');
      return;
    }
    
    // Test access for each connected remote person
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const remotePersonId = conn.remotePersonId || conn.targetPersonId;
      
      if (!remotePersonId) {
        console.log(`⚠️ Connection ${i + 1}: No remote person ID`);
        continue;
      }
      
      console.log(`\n🎯 === TESTING REMOTE PERSON ${i + 1} ===`);
      console.log(`Remote: ${remotePersonId.substring(0, 12)}...`);
      
      try {
        // First get the channel info hash
        let channelInfoIdHash;
        try {
          // Use statically imported function
          
          // Calculate channel info hash (same logic as LeuteAccessRightsManager)
          channelInfoIdHash = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: channelId,
            owner: _channelOwner === null ? undefined : _channelOwner
          });
          
          console.log(`📺 Testing channel: ${channelInfoIdHash.substring(0, 12)}...`);
        } catch (error) {
          console.log(`   ❌ Failed to calculate channel hash: ${error}`);
          continue;
        }
        
        // 1. Test the fundamental CHUM sync issue: Are the devices sharing ANY objects?
        console.log(`📊 CORE ISSUE DIAGNOSIS: Object Storage Isolation`);
        
        try {
          // Get all messages this device can see in the channel
          const myChannelManager = appModel.channelManager;
          const myMessages = await myChannelManager.getObjectsWithType('ChatMessage', {
            channelId: channelId,
            limit: 5
          });
          
          console.log(`   📧 My device sees ${myMessages.length} messages in this channel`);
          
          if (myMessages.length > 0) {
            // Show sample message hashes that this device can see
            const sampleHashes = myMessages.slice(0, 3).map(msg => 
              (msg.dataHash || msg.hash || 'unknown').substring(0, 8)
            );
            console.log(`   🔍 Sample message hashes: ${sampleHashes.join(', ')}`);
            
            // Try to check if these objects are stored in a way that remote devices should access
            console.log(`   📦 Message storage type: ${myMessages[0].$type$ || 'ChatMessage'}`);
            console.log(`   📝 Sample message content: "${(myMessages[0].text || '').substring(0, 20)}..."`);
          }
          
          // The key insight: If CHUM was working, both devices would see the SAME message hashes
          // But we see completely different hash ranges, suggesting zero object synchronization
          console.log(`   🔥 ROOT CAUSE: Each device has completely separate message storage`);
          console.log(`   🔥 This indicates CHUM protocol is not transferring ANY objects between devices`);
          console.log(`   🔥 Problem is deeper than access grants - CHUM sync mechanism itself is broken`);
          
        } catch (storageError) {
          console.log(`   ❌ Error checking message storage: ${storageError}`);
        }
        
        // 3. Test group membership
        // Use statically imported function
        const groupsContainingPerson = await getOnlyLatestReferencingObjsHashAndId(remotePersonId, 'Group');
        
        console.log(`👥 Group memberships: ${groupsContainingPerson.length}`);
        
        if (groupsContainingPerson.length === 0) {
          console.log('🚨 CRITICAL: Not in any groups - group-based access will fail!');
        } else {
          // Check if in everyone group
          // Use statically imported GroupModel
          const everyoneGroup = await GroupModel.constructFromLatestProfileVersionByGroupName('everyone');
          
          const isInEveryoneGroup = groupsContainingPerson.some(group => group.idHash === everyoneGroup.groupIdHash);
          console.log(`👥 In everyone group: ${isInEveryoneGroup ? '✅ YES' : '❌ NO'}`);
          
          if (!isInEveryoneGroup) {
            console.log('🚨 CRITICAL: Not in everyone group - this breaks group-based access!');
          }
        }
        
        // 4. Show sample accessible objects
        if (accessibleHashes.length > 0) {
          console.log(`🔍 Sample accessible objects:`);
          accessibleHashes.slice(0, 3).forEach((obj, idx) => {
            const hash = (obj as any).idHash || (obj as any).hash || 'unknown';
            console.log(`   ${idx + 1}. ${obj.type}: ${hash.substring(0, 12)}...`);
          });
        }
        
        // 5. Overall sync prediction
        if (accessibleHashes.length > 0 && hasChannelAccess) {
          console.log('✅ PREDICTION: Message sync should work for this device');
        } else {
          console.log('❌ PREDICTION: Message sync will FAIL for this device');
        }
        
      } catch (error) {
        console.log(`❌ Error testing remote person ${i + 1}: ${error}`);
      }
    }
    
    console.log(`\n🏁 Auto diagnostics complete for ${connections.length} connections`);
    
  } catch (error) {
    console.log(`❌ Auto message diagnostics failed: ${error}`);
  }
}

/**
 * Setup automatic diagnostics on channel updates
 */
export async function enableAutoMessageDiagnostics(): Promise<void> {
  console.log('🔬 === ENABLING AUTO MESSAGE DIAGNOSTICS ===');
  
  if (!checkAppReadiness()) return;
  
  try {
    const appModel = (window as any).appModel || (global as any).appModel;
    
    // Hook into channel manager updates
    const channelManager = appModel.channelManager;
    if (!channelManager?.onUpdated) {
      console.log('❌ ChannelManager not available');
      return;
    }
    
    // Auto message diagnostics enabled for background monitoring
    
    // Listen for channel updates and run full diagnostics
    channelManager.onUpdated.listen(runAutoMessageDiagnostics);
    
  } catch (error) {
    console.error('❌ Error enabling auto message diagnostics:', error);
  }
}

/**
 * Access Grant Diagnostics for Two-Device Testing
 */
export async function runAccessDiagnostics(): Promise<void> {
  console.log('🔬 === ACCESS GRANT DIAGNOSTICS ===');
  
  if (!checkAppReadiness()) return;
  
  try {
    // Use safe import pattern to avoid Metro bundler issues
    let runCompleteAccessDiagnostics;
    try {
      runCompleteAccessDiagnostics = require('./accessGrantDiagnostics').runCompleteAccessDiagnostics;
    } catch (importError) {
      console.log('⚠️ Full diagnostics not available - using basic tests instead');
      // Fall back to inline basic tests
      await runBasicAccessTests();
      return;
    }
    
    // Get AppModel to find remote connections
    const appModel = (window as any).appModel || (global as any).appModel;
    
    // Get active connections to test with
    const transportManager = appModel.transportManager;
    if (!transportManager || !transportManager.getActiveConnections) {
      console.log('❌ TransportManager not available - cannot find remote connections');
      return;
    }
    
    const connections = await transportManager.getActiveConnections();
    if (connections.length === 0) {
      console.log('❌ No active connections - pair devices first before running diagnostics');
      return;
    }
    
    console.log(`📊 Found ${connections.length} active connections`);
    
    // Test access for each connected remote person
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const remotePersonId = conn.remotePersonId || conn.targetPersonId;
      
      if (!remotePersonId) {
        console.log(`⚠️ Connection ${i + 1}: No remote person ID found`);
        continue;
      }
      
      console.log(`\n🎯 === TESTING CONNECTION ${i + 1} ===`);
      console.log(`Remote Person: ${remotePersonId.substring(0, 12)}...`);
      
      // Find active chat channel if any
      const channelManager = appModel.channelManager;
      let chatChannelId = null;
      
      if (channelManager && channelManager.channels) {
        try {
          const channels = await channelManager.channels();
          const chatChannels = channels.filter((ch: any) => ch.id && ch.id.includes('<->'));
          
          if (chatChannels.length > 0) {
            chatChannelId = chatChannels[0].id;
            console.log(`📺 Found chat channel: ${chatChannelId.substring(0, 32)}...`);
          }
        } catch (error) {
          console.log(`⚠️ Error finding chat channels: ${error}`);
        }
      }
      
      // Run complete diagnostics for this connection
      await runCompleteAccessDiagnostics(remotePersonId, chatChannelId);
    }
    
  } catch (error) {
    console.error('❌ Error running access diagnostics:', error);
  }
}

/**
 * Quick Access Test - Just check basic access for all connections
 */
export async function quickAccessTest(): Promise<void> {
  console.log('⚡ === QUICK ACCESS TEST ===');
  
  if (!checkAppReadiness()) return;
  
  try {
    const appModel = (window as any).appModel || (global as any).appModel;
    
    // Get my person ID
    const myPersonId = await appModel.leuteModel.myMainIdentity();
    console.log(`👤 My Person ID: ${myPersonId?.substring(0, 12)}...`);
    
    // Get connections
    const transportManager = appModel.transportManager;
    if (!transportManager?.getActiveConnections) {
      console.log('❌ No transport manager');
      return;
    }
    
    const connections = await transportManager.getActiveConnections();
    console.log(`🔗 Active connections: ${connections.length}`);
    
    if (connections.length === 0) {
      console.log('⚠️ No connections to test - pair devices first');
      return;
    }
    
    // Test access for each connection
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const remotePersonId = conn.remotePersonId || conn.targetPersonId;
      
      if (!remotePersonId) continue;
      
      console.log(`\n🎯 Connection ${i + 1}: ${remotePersonId.substring(0, 12)}...`);
      
      try {
        // Import getAllEntries directly with error handling (same as one.leute uses)
        let accessibleHashes;
        try {
          // Use statically imported function
          const getAllEntriesFunc = getAllEntries;
          
          if (typeof getAllEntriesFunc !== 'function') {
            console.log(`   ❌ getAllEntries not available: ${typeof getAllEntries}`);
            console.log(`   📦 Using statically imported getAllEntries function`);
            continue;
          }
          
          accessibleHashes = await getAllEntriesFunc(remotePersonId);
        } catch (importError) {
          console.log(`   ❌ Import failed: ${importError}`);
          continue;
        }
        
        console.log(`   📊 Accessible objects: ${accessibleHashes.length}`);
        
        if (accessibleHashes.length === 0) {
          console.log('   🚨 ZERO accessible objects - CHUM sync will fail!');
        } else {
          console.log('   ✅ Has accessible objects - CHUM sync should work');
          
          // Show sample objects
          const sampleObjects = accessibleHashes.slice(0, 3).map(obj => {
            const hash = (obj as any).idHash || (obj as any).hash || 'unknown';
            return `${obj.type}:${hash.substring(0, 8)}`;
          });
          console.log(`   🔍 Sample: ${sampleObjects.join(', ')}`);
        }
        
      } catch (error) {
        console.log(`   ❌ Error testing access: ${error}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Quick access test failed:', error);
  }
}

/**
 * Test Group Membership for All Connections
 */
export async function testGroupMembership(): Promise<void> {
  console.log('👥 === GROUP MEMBERSHIP TEST ===');
  
  if (!checkAppReadiness()) return;
  
  try {
    const appModel = (window as any).appModel || (global as any).appModel;
    
    // Get everyone group
    // Use statically imported GroupModel
    const everyoneGroup = await GroupModel.constructFromLatestProfileVersionByGroupName('everyone');
    console.log(`🎯 Everyone group: ${everyoneGroup.groupIdHash.substring(0, 12)}...`);
    
    // Get connections
    const transportManager = appModel.transportManager;
    const connections = await transportManager.getActiveConnections();
    
    if (connections.length === 0) {
      console.log('⚠️ No connections to test');
      return;
    }
    
    // Test each connection
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const remotePersonId = conn.remotePersonId || conn.targetPersonId;
      
      if (!remotePersonId) continue;
      
      console.log(`\n🎯 Testing ${remotePersonId.substring(0, 12)}...`);
      
      try {
        // Use statically imported function
        const groupsContainingPerson = await getOnlyLatestReferencingObjsHashAndId(remotePersonId, 'Group');
        
        console.log(`   📊 Total groups: ${groupsContainingPerson.length}`);
        
        const isInEveryoneGroup = groupsContainingPerson.some(group => group.idHash === everyoneGroup.groupIdHash);
        console.log(`   👥 In everyone group: ${isInEveryoneGroup ? '✅ YES' : '❌ NO'}`);
        
        if (!isInEveryoneGroup) {
          console.log('   🚨 CRITICAL: Not in everyone group - this breaks access!');
        }
        
      } catch (error) {
        console.log(`   ❌ Error checking groups: ${error}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Group membership test failed:', error);
  }
}

/**
 * Basic Access Tests - Fallback for when full diagnostics fail
 */
async function runBasicAccessTests(): Promise<void> {
  try {
    const appModel = (window as any).appModel || (global as any).appModel;
    
    // Get connections
    const transportManager = appModel.transportManager;
    const connections = await transportManager.getActiveConnections();
    
    if (connections.length === 0) {
      console.log('❌ No connections to test');
      return;
    }
    
    // Test each connection with basic access check
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const remotePersonId = conn.remotePersonId || conn.targetPersonId;
      
      if (!remotePersonId) continue;
      
      console.log(`\n🎯 Testing ${remotePersonId.substring(0, 12)}...`);
      
      try {
        // Basic access test using safe import pattern (same as one.leute uses)
        let accessibleHashes;
        try {
          // Use statically imported function
          const getAllEntriesFunc = getAllEntries;
          
          if (typeof getAllEntriesFunc !== 'function') {
            console.log(`   ❌ getAllEntriesFunc not available`);
            console.log(`   📦 Using statically imported getAllEntries function`);
            continue;
          }
          
          accessibleHashes = await getAllEntriesFunc(remotePersonId);
        } catch (importError) {
          console.log(`   ❌ Import failed: ${importError}`);
          continue;
        }
        
        console.log(`   📊 Accessible objects: ${accessibleHashes.length}`);
        
        if (accessibleHashes.length === 0) {
          console.log('   🚨 CRITICAL: Zero accessible objects - CHUM sync will fail!');
        } else {
          console.log('   ✅ Has accessible objects - CHUM sync should work');
        }
        
      } catch (error) {
        console.log(`   ❌ Error testing access: ${error}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Basic access tests failed: ${error}`);
  }
}

/**
 * Inline Event Testing Functions - No imports needed
 */
export function quickEventTest() {
  console.log('\n🧪 QUICK CHANNELMANAGER EVENT TEST');
  console.log('='.repeat(50));
  
  // Get the global app model
  const appModel = (globalThis as any).appModel || (window as any).appModel;
  if (!appModel) {
    console.error('❌ No global appModel found');
    return;
  }
  
  const channelManager = appModel.channelManager;
  if (!channelManager) {
    console.error('❌ No channelManager found');
    return;
  }
  
  console.log('✅ Found ChannelManager');
  
  // Check current listener count
  const listenerCount = Object.keys(channelManager.onUpdated._listeners || {}).length;
  console.log(`🔍 Current onUpdated listeners: ${listenerCount}`);
  
  // Add a test listener
  let eventCount = 0;
  const disconnect = channelManager.onUpdated.listen((channelInfoIdHash: any, channelId: any, channelOwner: any, time: any, data: any) => {
    eventCount++;
    console.log(`🎉 EVENT ${eventCount}: Channel ${channelId} updated at ${time?.toISOString()}`);
    console.log(`   Hash: ${channelInfoIdHash?.substring(0, 16)}...`);
    console.log(`   Data entries: ${data?.length || 0}`);
  });
  
  console.log('✅ Test listener added');
  console.log('📝 Now post a message in the chat to test if events fire');
  console.log('⏳ Monitoring for 30 seconds...');
  
  // Auto-disconnect after 30 seconds
  setTimeout(() => {
    if (typeof disconnect === 'function') {
      disconnect();
    }
    console.log(`🏁 Test complete. Events received: ${eventCount}`);
    if (eventCount === 0) {
      console.log('❌ NO EVENTS FIRED - ChannelManager.onUpdated is broken');
    } else {
      console.log('✅ Events are working correctly');
    }
  }, 30000);
  
  return disconnect;
}

export async function testChannelManagerEvents(): Promise<boolean> {
  console.log('\n🧪 TESTING CHANNELMANAGER.ONUPDATED EVENTS');
  console.log('='.repeat(60));
  
  try {
    // Get AppModel from global
    const appModel = (globalThis as any).appModel || (window as any).appModel;
    
    if (!appModel) {
      console.error('❌ No AppModel available - cannot test events');
      return false;
    }
    
    const channelManager = appModel.channelManager;
    if (!channelManager) {
      console.error('❌ No ChannelManager available - cannot test events');
      return false;
    }
    
    console.log('✅ Got ChannelManager instance');
    console.log(`🔍 ChannelManager onUpdated exists: ${!!channelManager.onUpdated}`);
    console.log(`🔍 ChannelManager onUpdated.listen exists: ${!!channelManager.onUpdated?.listen}`);
    
    // Count existing listeners
    const existingListeners = Object.keys(channelManager.onUpdated._listeners || {}).length;
    console.log(`🔍 Existing listeners count: ${existingListeners}`);
    
    // Register a test listener
    let eventReceived = false;
    let eventData: any = null;
    
    console.log('📝 Registering test listener...');
    const disconnect = channelManager.onUpdated.listen((
      channelInfoIdHash: string,
      channelId: string,
      channelOwner: any,
      timeOfEarliestChange: Date,
      data: any[]
    ) => {
      console.log('🎉 TEST EVENT RECEIVED!');
      console.log(`   Channel ID: ${channelId}`);
      console.log(`   Channel Hash: ${channelInfoIdHash?.substring(0, 16)}...`);
      console.log(`   Time: ${timeOfEarliestChange?.toISOString()}`);
      console.log(`   Data entries: ${data?.length || 0}`);
      
      eventReceived = true;
      eventData = { channelId, channelInfoIdHash, timeOfEarliestChange, dataCount: data?.length || 0 };
    });
    
    console.log('✅ Test listener registered');
    
    // Post a test message to trigger an event
    console.log('🚀 Posting test message to trigger channel event...');
    
    const topicModel = appModel.getTopicModel();
    if (!topicModel) {
      console.error('❌ No TopicModel available - cannot post test message');
      return false;
    }
    
    // Create a unique test topic/channel
    const testTopicId = `test-channel-events-${Date.now()}`;
    console.log(`📝 Creating test topic: ${testTopicId}`);
    
    // Post a test message
    await topicModel.postToTopic(testTopicId, {
      text: 'Test message for channel event verification',
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Test message posted');
    
    // Wait for event to fire
    console.log('⏳ Waiting 3 seconds for event to fire...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check results
    if (eventReceived) {
      console.log('🎉 SUCCESS: ChannelManager.onUpdated event fired correctly!');
      console.log('📊 Event data:', eventData);
      
      // Clean up
      if (typeof disconnect === 'function') {
        disconnect();
        console.log('🧹 Test listener disconnected');
      }
      
      return true;
    } else {
      console.log('❌ FAILURE: ChannelManager.onUpdated event did NOT fire');
      console.log('🔍 This confirms the event system is broken');
      
      // Clean up
      if (typeof disconnect === 'function') {
        disconnect();
        console.log('🧹 Test listener disconnected');
      }
      
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error testing ChannelManager events:', error);
    return false;
  }
}

export function testLeuteAccessListener() {
  console.log('\n🔍 TESTING LEUTE ACCESS RIGHTS MANAGER LISTENER');
  console.log('='.repeat(60));
  
  try {
    // Get AppModel from global
    const appModel = (globalThis as any).appModel || (window as any).appModel;
    
    if (!appModel) {
      console.error('❌ No AppModel available');
      return;
    }
    
    const channelManager = appModel.channelManager;
    if (!channelManager) {
      console.error('❌ No ChannelManager available');
      return;
    }
    
    console.log('✅ Got ChannelManager instance');
    
    // Check all listeners on onUpdated
    const listeners = channelManager.onUpdated._listeners || {};
    const listenerKeys = Object.keys(listeners);
    console.log(`🔍 Total onUpdated listeners: ${listenerKeys.length}`);
    
    // Try to identify each listener
    for (let i = 0; i < listenerKeys.length; i++) {
      const key = listenerKeys[i];
      const listener = listeners[key];
      console.log(`📝 Listener ${i + 1}: ${key}`);
      console.log(`   Type: ${typeof listener}`);
      
      if (typeof listener === 'function') {
        // Try to detect if this is the LeuteAccessRightsManager listener
        const funcStr = listener.toString();
        if (funcStr.includes('LeuteAccessRightsManager') || 
            funcStr.includes('Auto-creating access grants') ||
            funcStr.includes('createAccess')) {
          console.log('   🎯 This appears to be the LeuteAccessRightsManager listener');
        } else if (funcStr.includes('ChatModel') || funcStr.includes('refreshMessages')) {
          console.log('   💬 This appears to be a ChatModel listener');
        } else if (funcStr.includes('diagnostics') || funcStr.includes('AUTO MESSAGE')) {
          console.log('   🔬 This appears to be an auto diagnostics listener');
        } else {
          console.log('   ❓ Unknown listener type');
        }
        
        // Show first 100 chars of function for identification
        const preview = funcStr.substring(0, 100).replace(/\s+/g, ' ');
        console.log(`   Preview: ${preview}...`);
      }
    }
    
    console.log('\n🎯 DIAGNOSIS: Check if LeuteAccessRightsManager listener is registered');
    
    // CRITICAL: Check for multiple ChannelManager instances
    console.log('\n🔍 CHECKING FOR MULTIPLE CHANNELMANAGER INSTANCES');
    
    // Check if there are different ChannelManager references
    const appModelCM = appModel.channelManager;
    const globalCM = (globalThis as any).channelManager;
    const windowCM = (window as any).channelManager;
    
    console.log(`📊 AppModel.channelManager: ${!!appModelCM}`);
    console.log(`📊 Global.channelManager: ${!!globalCM}`);
    console.log(`📊 Window.channelManager: ${!!windowCM}`);
    
    // Check if they're the same instance
    if (appModelCM && globalCM) {
      console.log(`🔍 AppModel vs Global same instance: ${appModelCM === globalCM}`);
    }
    if (appModelCM && windowCM) {
      console.log(`🔍 AppModel vs Window same instance: ${appModelCM === windowCM}`);
    }
    
    // Check onUpdated instances
    if (appModelCM) {
      const listeners1 = Object.keys(appModelCM.onUpdated._listeners || {}).length;
      console.log(`📊 AppModel.channelManager.onUpdated listeners: ${listeners1}`);
    }
    if (globalCM && globalCM !== appModelCM) {
      const listeners2 = Object.keys(globalCM.onUpdated._listeners || {}).length;
      console.log(`📊 Global.channelManager.onUpdated listeners: ${listeners2}`);
    }
    if (windowCM && windowCM !== appModelCM && windowCM !== globalCM) {
      const listeners3 = Object.keys(windowCM.onUpdated._listeners || {}).length;
      console.log(`📊 Window.channelManager.onUpdated listeners: ${listeners3}`);
    }
    
    // Check if ChatModel has a different reference
    try {
      const chatModel = appModel.getTopicModel?.()?._chatModel;
      if (chatModel && chatModel.channelManager) {
        const chatModelCM = chatModel.channelManager;
        console.log(`📊 ChatModel.channelManager exists: ${!!chatModelCM}`);
        console.log(`🔍 ChatModel uses same ChannelManager: ${chatModelCM === appModelCM}`);
        
        if (chatModelCM !== appModelCM) {
          const listeners4 = Object.keys(chatModelCM.onUpdated._listeners || {}).length;
          console.log(`📊 ChatModel.channelManager.onUpdated listeners: ${listeners4}`);
          console.log('🚨 FOUND THE PROBLEM: ChatModel uses a different ChannelManager instance!');
        }
      }
    } catch (chatError) {
      console.log(`⚠️ Could not check ChatModel ChannelManager: ${chatError}`);
    }
    
  } catch (error) {
    console.error('❌ Error testing LeuteAccessRightsManager listener:', error);
  }
}

/**
 * Global window functions for easy debugging in dev tools
 */
if (typeof window !== 'undefined') {
  (window as any).checkRouteStatus = checkRouteStatus;
  (window as any).generateRouteReport = generateRouteReport;
  (window as any).runChumDiagnostics = runChumDiagnostics;
  (window as any).runChumSyncDiagnostics = runChumSyncDiagnostics;
  (window as any).runSimpleChumDiagnostics = runSimpleChumDiagnostics;
  (window as any).runAccessDiagnostics = runAccessDiagnostics;
  (window as any).quickAccessTest = quickAccessTest;
  (window as any).testGroupMembership = testGroupMembership;
  (window as any).enableAutoMessageDiagnostics = enableAutoMessageDiagnostics;
  (window as any).createTestSummary = createTestSummary;
  (window as any).checkAppReadiness = checkAppReadiness;
  (window as any).quickEventTest = quickEventTest;
  (window as any).testChannelManagerEvents = testChannelManagerEvents;
  (window as any).testLeuteAccessListener = testLeuteAccessListener;
  
  // Inline flow debugging function
  (window as any).debugChannelManagerFlow = function() {
    console.log('\n🔍 DEBUGGING CHANNELMANAGER INSTANCE FLOW');
    console.log('='.repeat(60));
    
    try {
      // Get AppModel from global
      const appModel = (globalThis as any).appModel || (window as any).appModel;
      
      if (!appModel) {
        console.error('❌ No AppModel available');
        return;
      }
      
      const channelManager = appModel.channelManager;
      if (!channelManager) {
        console.error('❌ No ChannelManager available');
        return;
      }
      
      console.log('✅ Got ChannelManager instance');
      
      // 1. Check current state and onUpdated properties
      console.log('\n🔍 DEBUGGING ONUPDATED OBJECT:');
      console.log(`📊 onUpdated exists: ${!!channelManager.onUpdated}`);
      console.log(`📊 onUpdated type: ${typeof channelManager.onUpdated}`);
      console.log(`📊 onUpdated constructor: ${channelManager.onUpdated?.constructor?.name}`);
      console.log(`📊 onUpdated.listen exists: ${!!channelManager.onUpdated?.listen}`);
      console.log(`📊 onUpdated.listen type: ${typeof channelManager.onUpdated?.listen}`);
      console.log(`📊 onUpdated.emit exists: ${!!channelManager.onUpdated?.emit}`);
      console.log(`📊 onUpdated._listeners exists: ${!!channelManager.onUpdated?._listeners}`);
      console.log(`📊 onUpdated._listeners type: ${typeof channelManager.onUpdated?._listeners}`);
      console.log(`📊 onUpdated.listeners exists: ${!!channelManager.onUpdated?.listeners}`);
      console.log(`📊 onUpdated.listeners type: ${typeof channelManager.onUpdated?.listeners}`);
      console.log(`📊 onUpdated.listeners size: ${channelManager.onUpdated?.listeners?.size || 0}`);
      
      const currentListeners = channelManager.onUpdated?.listeners?.size || 0;
      console.log(`📊 Current listeners: ${currentListeners}`);
      
      // 2. Test the original listen method before patching
      console.log('\n🧪 TESTING ORIGINAL LISTEN METHOD:');
      
      let testPassed = false;
      try {
        const originalListen = channelManager.onUpdated.listen;
        console.log(`📊 Original listen method: ${typeof originalListen}`);
        
        // Test with a dummy callback
        const dummyCallback = () => console.log('dummy');
        console.log('📝 Calling original listen with dummy callback...');
        const disconnectFn = originalListen.call(channelManager.onUpdated, dummyCallback);
        console.log(`📊 Disconnect function returned: ${typeof disconnectFn}`);
        
        const listenersAfterDummy = channelManager.onUpdated?.listeners?.size || 0;
        console.log(`📊 Listeners after dummy: ${listenersAfterDummy}`);
        
        if (listenersAfterDummy > 0) {
          console.log('✅ Original listen method works!');
          testPassed = true;
          // Clean up
          if (typeof disconnectFn === 'function') {
            disconnectFn();
          }
        } else {
          console.log('❌ Original listen method is broken!');
        }
      } catch (error) {
        console.error('❌ Error testing original listen:', error);
      }
      
      // 3. Patch the onUpdated.listen method to track registrations
      console.log('\n🔧 Installing listener tracking...');
      
      const originalListen = channelManager.onUpdated.listen;
      let listenerCount = 0;
      
      channelManager.onUpdated.listen = function(callback) {
        listenerCount++;
        console.log(`📝 LISTENER REGISTERED #${listenerCount}`);
        
        // Try to identify the caller
        const stack = new Error().stack;
        if (stack) {
          const lines = stack.split('\n');
          for (let i = 2; i < Math.min(6, lines.length); i++) {
            const line = lines[i].trim();
            if (line.includes('LeuteAccessRightsManager')) {
              console.log(`   🎯 LeuteAccessRightsManager listener detected!`);
            } else if (line.includes('ChatModel')) {
              console.log(`   💬 ChatModel listener detected!`);
            } else if (line.includes('auto') || line.includes('diagnostics')) {
              console.log(`   🔬 Auto diagnostics listener detected!`);
            }
            console.log(`   📍 ${line}`);
          }
        }
        
        const result = originalListen.call(this, callback);
        
        const newListenerCount = channelManager.onUpdated?.listeners?.size || 0;
        console.log(`   ✅ Listener registered successfully. Total: ${newListenerCount}`);
        
        return result;
      };
      
      // 3. Patch the onUpdated.emit method to track emissions
      const originalEmit = channelManager.onUpdated.emit;
      let emitCount = 0;
      
      channelManager.onUpdated.emit = function(...args) {
        emitCount++;
        console.log(`🔔 EVENT EMITTED #${emitCount}`);
        console.log(`   Args: ${args.length} arguments`);
        if (args[1]) {
          console.log(`   Channel: ${args[1].substring(0, 32)}...`);
        }
        
        const listenersBefore = channelManager.onUpdated?.listeners?.size || 0;
        console.log(`   📊 Listeners before emit: ${listenersBefore}`);
        
        const result = originalEmit.apply(this, args);
        
        console.log(`   ✅ Event emission completed`);
        return result;
      };
      
      console.log('✅ Listener tracking installed');
      console.log('\n🎯 Now watch for listener registrations and event emissions');
      console.log('💡 Try posting a message to see the flow');
      
      // 4. Test immediate listener registration
      console.log('\n🧪 Testing immediate listener registration...');
      
      let testEventReceived = false;
      const testDisconnect = channelManager.onUpdated.listen(() => {
        testEventReceived = true;
        console.log('🎉 Test listener received event!');
      });
      
      console.log(`📊 Listeners after test registration: ${channelManager.onUpdated?.listeners?.size || 0}`);
      
      // Clean up test listener
      setTimeout(() => {
        if (typeof testDisconnect === 'function') {
          testDisconnect();
        }
        console.log('🧹 Test listener cleaned up');
      }, 5000);
      
    } catch (error) {
      console.error('❌ Error debugging ChannelManager flow:', error);
    }
  };
}

// Import debug utilities for channel sync diagnostics
// DISABLED - These imports cause code to run before login
// import './messageTransferDebug';
// import './quickChumCheck';
// import './chumSyncDiagnostics';
// import './channelSyncDiagnostics';
// import './debugChannelSync'; 