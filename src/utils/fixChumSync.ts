/**
 * Fix CHUM synchronization by ensuring proper module initialization
 */

import type { AppModel } from '../models/AppModel';

export async function fixChumSync(appModel: AppModel): Promise<void> {
  console.log('\n🔧 FIXING CHUM SYNC...\n');
  
  const connectionsModel = appModel.transportManager.getConnectionsModel();
  if (!connectionsModel) {
    console.log('❌ No ConnectionsModel found');
    return;
  }

  // Check if leuteConnectionsModule exists
  const leuteModule = (connectionsModel as any).leuteConnectionsModule;
  if (!leuteModule) {
    console.log('❌ CRITICAL: leuteConnectionsModule is missing!');
    console.log('⚠️  This is why messages aren\'t syncing between devices');
    
    // Try to access the connections module through internal properties
    const modules = (connectionsModel as any).modules || {};
    console.log('📦 Available modules:', Object.keys(modules));
    
    // Check if CHUM exporter/importer are present
    const exporter = (connectionsModel as any).exporter;
    const importer = (connectionsModel as any).importer;
    console.log(`📤 Exporter present: ${!!exporter}`);
    console.log(`📥 Importer present: ${!!importer}`);
    
    // Force cache update if possible
    if (typeof (connectionsModel as any).updateCache === 'function') {
      console.log('🔄 Forcing cache update...');
      await (connectionsModel as any).updateCache();
    }
  } else {
    console.log('✅ leuteConnectionsModule found');
    
    // Force cache update
    if (typeof leuteModule.updateCache === 'function') {
      console.log('🔄 Updating leuteConnectionsModule cache...');
      await leuteModule.updateCache();
      console.log('✅ Cache updated');
    }
  }

  // Check CHUM route configuration
  const routes = (connectionsModel as any).routes || {};
  const connectionGroups = (connectionsModel as any).connectionGroups || {};
  
  console.log('\n📡 CONNECTION GROUPS:');
  Object.entries(connectionGroups).forEach(([name, group]: [string, any]) => {
    console.log(`  ${name}:`, {
      connections: group.connections?.length || 0,
      establishOutgoing: group.establishOutgoing
    });
  });

  // Force CHUM sync
  console.log('\n🔄 FORCING CHUM SYNC...');
  
  // Get all connections
  const connections = connectionsModel.connectionsInfo();
  console.log(`Found ${connections.length} connections`);
  
  for (const conn of connections) {
    if (conn.state === 'connected') {
      console.log(`\n📡 Connection ${conn.id}:`);
      console.log(`  Remote: ${conn.remotePersonId?.substring(0, 8)}...`);
      
      // Try to trigger sync on this connection
      const connection = (connectionsModel as any).connections?.get(conn.id);
      if (connection) {
        // Send sync request
        try {
          console.log('  📤 Sending manual sync trigger...');
          connection.send('synchronisation');
        } catch (e) {
          console.log('  ❌ Failed to send sync:', e.message);
        }
      }
    }
  }
  
  console.log('\n✅ CHUM sync fix attempted');
  console.log('📝 Now try sending another message and check if it appears on both devices');
}

// Export to global
(globalThis as any).fixChumSync = (appModel: AppModel) => fixChumSync(appModel);