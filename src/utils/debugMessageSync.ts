/**
 * Debug why messages aren't syncing between devices
 */

import type { AppModel } from '../models/AppModel';

export async function debugMessageSync(appModel: AppModel): Promise<void> {
  console.log('\n🔍 MESSAGE SYNC DEBUGGING\n');
  
  const connectionsModel = appModel.transportManager.getConnectionsModel();
  if (!connectionsModel) {
    console.log('❌ No ConnectionsModel found');
    return;
  }

  // 1. Check connection state
  console.log('1. CONNECTION STATE:');
  const connections = connectionsModel.connectionsInfo();
  console.log(`   Total connections: ${connections.length}`);
  
  for (const conn of connections) {
    if (conn.state === 'connected') {
      console.log(`\n   ✅ Connected to: ${conn.remotePersonId?.substring(0, 8)}...`);
      console.log(`      State: ${conn.state}`);
      console.log(`      Connection ID: ${conn.id}`);
      
      // Check connection internals
      const internalConn = (connectionsModel as any).connections?.get(conn.id);
      if (internalConn) {
        console.log(`      Has internal connection: ✅`);
        console.log(`      Connection type: ${internalConn.constructor.name}`);
        
        // Check if connection has CHUM plugin
        const plugins = internalConn.plugins || [];
        const hasChumPlugin = plugins.some((p: any) => p.constructor.name === 'ChumPlugin');
        console.log(`      Has ChumPlugin: ${hasChumPlugin ? '✅' : '❌'}`);
      }
    }
  }

  // 2. Check CHUM exporter/importer
  console.log('\n2. CHUM EXPORTER/IMPORTER:');
  const exporter = (connectionsModel as any).exporter;
  const importer = (connectionsModel as any).importer;
  
  if (exporter) {
    console.log('   ✅ Exporter present');
    console.log(`      Type: ${exporter.constructor.name}`);
    
    // Check if exporter has access to objects
    if (typeof exporter.getAccessibleRootHashes === 'function') {
      try {
        const remotePersonId = connections.find(c => c.state === 'connected')?.remotePersonId;
        if (remotePersonId) {
          const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
          const accessible = await getAccessibleRootHashes(remotePersonId);
          console.log(`      Accessible objects for remote: ${accessible.length}`);
        }
      } catch (e) {
        console.log(`      Error checking accessible objects: ${e.message}`);
      }
    }
  } else {
    console.log('   ❌ Exporter missing!');
  }
  
  if (importer) {
    console.log('   ✅ Importer present');
    console.log(`      Type: ${importer.constructor.name}`);
  } else {
    console.log('   ❌ Importer missing!');
  }

  // 3. Check current channel access
  console.log('\n3. CHANNEL ACCESS:');
  const chatModel = appModel.chatModel;
  const channelId = chatModel.currentChannelId;
  
  if (channelId) {
    console.log(`   Current channel: ${channelId}`);
    
    // Check if channel info is accessible
    const channelInfo = chatModel.currentChannelInfo;
    if (channelInfo) {
      console.log(`   Channel info hash: ${channelInfo.$idHash$?.substring(0, 8)}...`);
      
      // Check access grants
      const { getOnlyLatestReferencingObjsHashAndId } = await import('@refinio/one.core/lib/reverse-map-query.js');
      const idAccessGrants = await getOnlyLatestReferencingObjsHashAndId(channelInfo.$idHash$, 'IdAccess');
      console.log(`   IdAccess grants: ${idAccessGrants.length}`);
      
      if (idAccessGrants.length > 0) {
        for (const grant of idAccessGrants.slice(0, 2)) {
          console.log(`      Grant: ${grant.idHash.substring(0, 8)}...`);
        }
      }
    }
  }

  // 4. Force trigger sync
  console.log('\n4. TRIGGERING MANUAL SYNC:');
  
  // Find connected connections
  const connectedConns = connections.filter(c => c.state === 'connected');
  
  for (const connInfo of connectedConns) {
    console.log(`\n   Triggering sync for connection ${connInfo.id}...`);
    
    // Get internal connection
    const conn = (connectionsModel as any).connections?.get(connInfo.id);
    if (conn && typeof conn.send === 'function') {
      try {
        // Send sync request
        conn.send('synchronisation');
        console.log('   ✅ Sync request sent');
        
        // Also try to trigger CHUM service manually
        if (conn.chum) {
          console.log('   Found CHUM service on connection');
        }
      } catch (e) {
        console.log(`   ❌ Error sending sync: ${e.message}`);
      }
    }
  }

  console.log('\n5. RECOMMENDATIONS:');
  console.log('   1. Check if both devices show "Connected to" the other device');
  console.log('   2. Verify that IdAccess grants exist for the channel');
  console.log('   3. Look for "CHUM SYNC REQUEST DETECTED" in logs after sending a message');
  console.log('   4. If sync requests aren\'t working, try reconnecting the devices');
  
  console.log('\n💡 After running this, send a test message and watch the logs on BOTH devices');
}

// Export to global
(globalThis as any).debugMessageSync = (appModel: AppModel) => debugMessageSync(appModel);