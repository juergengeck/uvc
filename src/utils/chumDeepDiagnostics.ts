/**
 * Deep CHUM Synchronization Diagnostics
 * 
 * This utility traces the complete CHUM message passing flow from access grant
 * creation through to remote device synchronization to identify exactly where
 * the synchronization chain is breaking.
 */

declare global {
  interface Window {
    runDeepChumDiagnostics: () => Promise<void>;
  }
}

/**
 * Main diagnostic function that traces the complete CHUM sync flow
 */
export async function runDeepChumDiagnostics(): Promise<void> {
  console.log('\n🔬 DEEP CHUM SYNCHRONIZATION DIAGNOSTICS');
  console.log('='.repeat(80));

  try {
    // Get the AppModel instance
    const appModel = getAppModelInstance();
    if (!appModel) {
      console.error('❌ AppModel not found - cannot run diagnostics');
      return;
    }

    console.log('\n1️⃣ CHUM CONNECTION STATE ANALYSIS');
    await analyzeChumConnectionState(appModel);

    console.log('\n2️⃣ ACCESS MANAGER STATE ANALYSIS');
    await analyzeAccessManagerState(appModel);

    console.log('\n3️⃣ CHUM EXPORTER/IMPORTER ANALYSIS');
    await analyzeChumExporterImporter(appModel);

    console.log('\n4️⃣ ACCESS GRANTS VISIBILITY TEST');
    await testAccessGrantsVisibility(appModel);

    console.log('\n5️⃣ CHUM PROTOCOL ACTIVITY ANALYSIS');
    await analyzeChumProtocolActivity(appModel);

    console.log('\n='.repeat(80));
    console.log('🔬 DEEP CHUM DIAGNOSTICS COMPLETE\n');

  } catch (error) {
    console.error('❌ Deep CHUM diagnostics failed:', error);
  }
}

/**
 * Get the AppModel instance from global scope
 */
function getAppModelInstance(): any {
  if (typeof window !== 'undefined' && (window as any).appModel) {
    return (window as any).appModel;
  }
  if (typeof global !== 'undefined' && (global as any).appModel) {
    return (global as any).appModel;
  }
  return null;
}

/**
 * Analyze CHUM connection state between devices
 */
async function analyzeChumConnectionState(appModel: any): Promise<void> {
  console.log('📡 Analyzing CHUM connection state...');

  try {
    const connectionsModel = appModel.transportManager?.commServerManager?.connectionsModel;
    if (!connectionsModel) {
      console.error('❌ ConnectionsModel not found');
      return;
    }

    // Check connection info
    const connectionInfos = connectionsModel.connectionsInfo ? connectionsModel.connectionsInfo() : [];
    console.log(`📊 Total connections: ${connectionInfos.length}`);

    for (const [index, info] of connectionInfos.entries()) {
      console.log(`🔌 Connection ${index + 1}:`);
      console.log(`   - Remote Person: ${info.remotePersonId?.substring(0, 8)}...`);
      console.log(`   - Protocol: ${info.protocol || 'unknown'}`);
      console.log(`   - Status: ${info.isActive ? '✅ Active' : '❌ Inactive'}`);
      console.log(`   - Keep Running: ${info.keepRunning || false}`);
    }

    // Check CHUM-specific connections
    const chumConnections = connectionInfos.filter((info: any) => 
      info.protocol === 'chum' || info.connectionRoutesGroupName === 'chum'
    );
    console.log(`🚀 CHUM connections: ${chumConnections.length}`);

    if (chumConnections.length === 0) {
      console.warn('⚠️ No CHUM connections found - this could be the issue');
    }

  } catch (error) {
    console.error('❌ Error analyzing CHUM connection state:', error);
  }
}

/**
 * Analyze AccessManager state and initialization
 */
async function analyzeAccessManagerState(appModel: any): Promise<void> {
  console.log('🔐 Analyzing AccessManager state...');

  try {
    // Try to import AccessManager functions
    const { isIdAccessibleBy } = await import('@refinio/one.core/lib/accessManager.js');
    const { getAllEntries } = await import('@refinio/one.core/lib/reverse-map-query.js');
    
    console.log('✅ AccessManager functions imported successfully');
    
    // Test if AccessManager is properly initialized
    const myPersonId = await appModel.leuteModel.myMainIdentity();
    console.log(`👤 My Person ID: ${myPersonId?.substring(0, 8)}...`);

    // Get accessible roots for myself (should include all my data)
    try {
      const accessibleRoots = await getAllEntries(myPersonId);
      console.log(`📦 Accessible roots for myself: ${accessibleRoots.length}`);
      
      if (accessibleRoots.length > 0) {
        console.log(`   - Sample roots: ${accessibleRoots.slice(0, 3).map((r: string) => r.substring(0, 8)).join(', ')}...`);
      } else {
        console.warn('⚠️ No accessible roots found - AccessManager may not be initialized');
      }
    } catch (error) {
      console.error('❌ Error getting accessible roots:', error);
    }

    // Check if we can get accessible roots for connected peers
    const connectionInfos = appModel.transportManager?.commServerManager?.connectionsModel?.connectionsInfo?.() || [];
    for (const info of connectionInfos) {
      if (info.remotePersonId && info.remotePersonId !== myPersonId) {
        try {
          const peerRoots = await getAllEntries(info.remotePersonId);
          console.log(`🔗 Accessible roots from peer ${info.remotePersonId.substring(0, 8)}...: ${peerRoots.length}`);
        } catch (error) {
          console.log(`❌ Cannot get accessible roots from peer ${info.remotePersonId.substring(0, 8)}...: ${error.message}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error analyzing AccessManager state:', error);
  }
}

/**
 * Analyze CHUM exporter/importer activity
 */
async function analyzeChumExporterImporter(appModel: any): Promise<void> {
  console.log('🔄 Analyzing CHUM exporter/importer activity...');

  try {
    const connectionsModel = appModel.transportManager?.commServerManager?.connectionsModel;
    if (!connectionsModel) {
      console.error('❌ ConnectionsModel not found');
      return;
    }

    // Look for CHUM exporter/importer instances
    console.log('🔍 Searching for CHUM service instances...');

    // Check if there are active CHUM sessions
    const leuteConnectionsModule = connectionsModel.leuteConnectionsModule;
    if (leuteConnectionsModule) {
      console.log('✅ LeuteConnectionsModule found');
      
      // Try to access CHUM session information
      if (leuteConnectionsModule.chumSessions) {
        const sessions = leuteConnectionsModule.chumSessions;
        console.log(`📊 CHUM sessions: ${Object.keys(sessions).length}`);
        
        for (const [sessionId, session] of Object.entries(sessions)) {
          console.log(`🔗 Session ${sessionId}:`);
          console.log(`   - Remote Person: ${(session as any).remotePersonId?.substring(0, 8)}...`);
          console.log(`   - Keep Running: ${(session as any).keepRunning}`);
          console.log(`   - Status: ${(session as any).isRunning ? '🟢 Running' : '🔴 Stopped'}`);
        }
      }
    }

    // Check for polling activity indicators
    console.log('🔍 Checking for polling activity indicators...');
    
    // This would require inspecting internal state or monkey-patching
    // to see actual polling requests being made

  } catch (error) {
    console.error('❌ Error analyzing CHUM exporter/importer:', error);
  }
}

/**
 * Test access grants visibility to CHUM exporters
 */
async function testAccessGrantsVisibility(appModel: any): Promise<void> {
  console.log('🧪 Testing access grants visibility...');

  try {
    const channelManager = appModel.channelManager;
    const myPersonId = await appModel.leuteModel.myMainIdentity();
    
    // Get recent channel info
    const channels = await channelManager.channels();
    console.log(`📊 Total channels: ${channels.length}`);

    // Find chat channels
    const chatChannels = channels.filter((ch: any) => ch.id && ch.id.includes('<->'));
    console.log(`💬 Chat channels: ${chatChannels.length}`);

    for (const channel of chatChannels.slice(0, 2)) { // Test first 2 chat channels
      console.log(`🔍 Testing channel: ${channel.id.substring(0, 32)}...`);
      
      try {
        // Get channel info
        const channelInfos = await channelManager.getMatchingChannelInfos({channelId: channel.id});
        
        for (const channelInfo of channelInfos) {
          if (channelInfo.idHash) {
            // Test if this channel is accessible
            const { isIdAccessibleBy } = await import('@refinio/one.core/lib/accessManager.js');
            const isAccessible = await isIdAccessibleBy(myPersonId, channelInfo.idHash);
            console.log(`   - Channel ${channelInfo.idHash.substring(0, 8)}... accessible: ${isAccessible ? '✅' : '❌'}`);
            
            // Get recent messages in this channel
            const messages = await channelManager.getObjectsWithType('ChatMessage', {
              channelId: channel.id,
              limit: 3
            });
            console.log(`   - Recent messages: ${messages.length}`);
            
            // Test if messages are accessible
            for (const message of messages) {
              if (message.dataHash) {
                const messageAccessible = await isIdAccessibleBy(myPersonId, message.dataHash);
                console.log(`     - Message ${message.dataHash.substring(0, 8)}... accessible: ${messageAccessible ? '✅' : '❌'}`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error testing channel ${channel.id.substring(0, 16)}...: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Error testing access grants visibility:', error);
  }
}

/**
 * Analyze CHUM protocol activity and debug logs
 */
async function analyzeChumProtocolActivity(appModel: any): Promise<void> {
  console.log('📊 Analyzing CHUM protocol activity...');

  try {
    // Set up enhanced console monitoring for CHUM activity
    console.log('🔍 Setting up CHUM activity monitoring...');
    
    // Hook into console to catch CHUM-related logs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    let chumActivityCount = 0;
    
    const chumLogInterceptor = (...args: any[]) => {
      const message = args.join(' ');
      if (message.includes('chum') || message.includes('CHUM') || 
          message.includes('synchronisation') || message.includes('GET_ACCESSIBLE')) {
        chumActivityCount++;
        originalLog('🔥 [CHUM-ACTIVITY]', ...args);
      }
    };

    // Install interceptors temporarily
    console.log = chumLogInterceptor;
    console.error = (...args: any[]) => {
      chumLogInterceptor(...args);
      originalError(...args);
    };
    console.warn = (...args: any[]) => {
      chumLogInterceptor(...args);
      originalWarn(...args);
    };

    // Wait a bit to see if there's any CHUM activity
    console.log('⏳ Monitoring CHUM activity for 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Restore original console
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;

    console.log(`📊 CHUM activity detected: ${chumActivityCount} events`);
    
    if (chumActivityCount === 0) {
      console.warn('⚠️ No CHUM activity detected - this suggests CHUM sync is not running');
    }

  } catch (error) {
    console.error('❌ Error analyzing CHUM protocol activity:', error);
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.runDeepChumDiagnostics = runDeepChumDiagnostics;
}