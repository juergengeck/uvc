/**
 * CHUM Message Exchange Diagnostics
 * 
 * Comprehensive diagnostic tool to identify why messages aren't being exchanged
 * between devices via the CHUM protocol.
 */

import type { AppModel } from '../models/AppModel';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

export async function diagnoseChumMessageExchange(appModel: AppModel): Promise<void> {
  console.log('\n=== CHUM MESSAGE EXCHANGE DIAGNOSTICS ===\n');
  
  try {
    // 1. Check ConnectionsModel configuration
    console.log('1. CHECKING CONNECTIONSMODEL CONFIGURATION:');
    const connectionsModel = appModel.transportManager.getConnectionsModel();
    
    if (!connectionsModel) {
      console.log('❌ ConnectionsModel not found!');
      return;
    }
    
    console.log('✅ ConnectionsModel found');
    console.log(`   - Online state: ${connectionsModel.onlineState}`);
    console.log(`   - Connections count: ${connectionsModel.connectionsInfo().length}`);
    
    // Check if leuteConnectionsModule exists
    const hasLeuteModule = !!(connectionsModel as any).leuteConnectionsModule;
    console.log(`   - LeuteConnectionsModule: ${hasLeuteModule ? '✅ Present' : '❌ Missing'}`);
    
    // 2. Check CHUM route configuration
    console.log('\n2. CHECKING CHUM ROUTE CONFIGURATION:');
    const routes = (connectionsModel as any).routes || {};
    const chumRoute = routes['chum'] || routes['CHUM'];
    
    if (chumRoute) {
      console.log('✅ CHUM route found:');
      console.log(`   - Type: ${chumRoute.type || 'unknown'}`);
      console.log(`   - Enabled: ${chumRoute.enabled !== false}`);
    } else {
      console.log('❌ CHUM route not found in routes:', Object.keys(routes));
    }
    
    // 3. Check active connections
    console.log('\n3. CHECKING ACTIVE CONNECTIONS:');
    const connections = connectionsModel.connectionsInfo();
    
    for (const conn of connections) {
      console.log(`\n   Connection ${conn.id}:`);
      console.log(`   - State: ${conn.state}`);
      console.log(`   - Remote Person: ${conn.remotePersonId?.substring(0, 8)}...`);
      console.log(`   - Remote Instance: ${conn.remoteInstanceId?.substring(0, 8)}...`);
      console.log(`   - Routes: ${conn.routes || 'none'}`);
      
      // Check if connection has CHUM route
      if (conn.routes && conn.routes.includes('chum')) {
        console.log('   ✅ CHUM route active on this connection');
      } else {
        console.log('   ❌ No CHUM route on this connection');
      }
    }
    
    // 4. Check access grants
    console.log('\n4. CHECKING ACCESS GRANTS:');
    const { getOnlyLatestReferencingObjsHashAndId } = await import('@refinio/one.core/lib/reverse-map-query.js');
    
    // Get current channel
    const chatModel = appModel.chatModel;
    const currentChannelId = chatModel.currentChannelId;
    const currentChannelInfo = chatModel.currentChannelInfo;
    
    if (currentChannelInfo) {
      console.log(`\n   Current channel: ${currentChannelId}`);
      console.log(`   - ChannelInfo hash: ${currentChannelInfo.$idHash$.substring(0, 8)}...`);
      
      // Check IdAccess grants for this channel
      const idAccessGrants = await getOnlyLatestReferencingObjsHashAndId(
        currentChannelInfo.$idHash$,
        'IdAccess'
      );
      console.log(`   - IdAccess grants: ${idAccessGrants.length}`);
      
      if (currentChannelInfo.$versionHash$) {
        const accessGrants = await getOnlyLatestReferencingObjsHashAndId(
          currentChannelInfo.$versionHash$,
          'Access'
        );
        console.log(`   - Access grants: ${accessGrants.length}`);
      }
    } else {
      console.log('   ❌ No current channel selected');
    }
    
    // 5. Check if we can access remote person's objects
    console.log('\n5. CHECKING REMOTE ACCESSIBILITY:');
    
    if (connections.length > 0 && currentChannelId?.includes('<->')) {
      const parts = currentChannelId.split('<->');
      const myId = await appModel.leuteModel.myMainIdentity();
      const remotePersonId = parts.find(id => id !== myId.personId) as SHA256IdHash<Person>;
      
      if (remotePersonId) {
        console.log(`   Checking accessibility for remote: ${remotePersonId.substring(0, 8)}...`);
        
        const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
        const accessibleHashes = await getAccessibleRootHashes(remotePersonId);
        
        console.log(`   - Accessible objects from remote: ${accessibleHashes.length}`);
        
        if (accessibleHashes.length === 0) {
          console.log('   ❌ CRITICAL: Cannot access any objects from remote!');
          console.log('      This means access grants are not working properly.');
        } else {
          console.log('   ✅ Can access remote objects');
        }
      }
    }
    
    // 6. Check WebSocket messages
    console.log('\n6. MONITORING WEBSOCKET FOR CHUM MESSAGES:');
    console.log('   To see CHUM sync messages, enable WebSocket debugging in browser DevTools');
    console.log('   Look for messages containing "synchronisation" type');
    
    // 7. Recommendations
    console.log('\n7. RECOMMENDATIONS:');
    
    if (!hasLeuteModule) {
      console.log('\n❌ CRITICAL: LeuteConnectionsModule is missing!');
      console.log('   This module is required for CHUM synchronization.');
      console.log('   The ConnectionsModel needs to be properly initialized with CHUM support.');
    }
    
    if (!chumRoute) {
      console.log('\n❌ CRITICAL: CHUM route not configured!');
      console.log('   The ConnectionsModel needs to have CHUM route enabled.');
    }
    
    console.log('\n📝 NEXT STEPS:');
    console.log('1. Ensure both devices have completed pairing');
    console.log('2. Send a test message and wait 2-3 seconds');
    console.log('3. Check the console logs on both devices');
    console.log('4. Look for "CHUM CHECK AFTER SEND" messages');
    console.log('5. If objects don\'t become accessible, access grants are failing');
    
    // Export to global for easy access
    (globalThis as any).__diagnoseChumMessageExchange = () => diagnoseChumMessageExchange(appModel);
    console.log('\n💡 TIP: Run __diagnoseChumMessageExchange() anytime to re-run diagnostics');
    
  } catch (error) {
    console.error('❌ Diagnostic error:', error);
  }
}

// Additional helper to monitor CHUM sync in real-time
export function monitorChumSync(appModel: AppModel): () => void {
  console.log('🔍 Starting CHUM sync monitoring...');
  
  const channelManager = appModel.channelManager;
  
  // Monitor channel updates
  const unsubscribe = channelManager.onUpdated.listen((
    channelInfoIdHash: string,
    channelId: string,
    channelOwner: string | null,
    timeOfEarliestChange: Date,
    data: any[]
  ) => {
    console.log(`\n📨 CHUM SYNC EVENT at ${new Date().toISOString()}`);
    console.log(`   Channel: ${channelId}`);
    console.log(`   Updates: ${data?.length || 0} entries`);
    console.log(`   Time of change: ${timeOfEarliestChange.toISOString()}`);
    
    if (data && data.length > 0) {
      data.forEach((entry, idx) => {
        console.log(`   Entry ${idx + 1}:`);
        console.log(`     - Type: ${entry.type || 'unknown'}`);
        console.log(`     - Hash: ${entry.channelEntryHash?.substring(0, 8)}...`);
        if (entry.data) {
          console.log(`     - Content preview: ${JSON.stringify(entry.data).substring(0, 50)}...`);
        }
      });
    }
  });
  
  console.log('✅ CHUM sync monitoring active. Call the returned function to stop.');
  
  return unsubscribe;
}

// Export to global
(globalThis as any).__monitorChumSync = (appModel: AppModel) => monitorChumSync(appModel);