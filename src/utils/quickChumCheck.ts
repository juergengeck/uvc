// Quick CHUM diagnostic that can be pasted directly into console
(async function quickChumCheck() {
  console.log('\n🔍 QUICK CHUM CHECK');
  console.log('='.repeat(50));
  
  try {
    // Get AppModel
    const appModel = window.appModel || global.appModel;
    if (!appModel) {
      console.log('❌ AppModel not available');
      return;
    }
    
    // Get my person ID
    const myPersonId = await appModel.leuteModel.myMainIdentity();
    console.log(`👤 My ID: ${myPersonId.substring(0, 8)}...`);
    
    // Get connections
    const connections = await appModel.transportManager.getActiveConnections();
    console.log(`🌐 Active connections: ${connections.length}`);
    
    if (connections.length === 0) {
      console.log('❌ No active connections');
      return;
    }
    
    // Test first connection
    const conn = connections[0];
    const remotePersonId = conn.remotePersonId || conn.targetPersonId;
    console.log(`👥 Testing with remote: ${remotePersonId.substring(0, 8)}...`);
    
    // Check what's accessible
    const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
    const accessible = await getAccessibleRootHashes(remotePersonId);
    
    console.log(`\n📊 RESULTS:`);
    console.log(`   Accessible objects: ${accessible.length}`);
    
    if (accessible.length === 0) {
      console.log(`   ❌ NO OBJECTS ACCESSIBLE - CHUM SYNC WILL FAIL!`);
      console.log(`   🔧 This means access grants are not working properly`);
    } else {
      console.log(`   ✅ CHUM can discover ${accessible.length} objects`);
      
      // Check for channels
      const channels = await appModel.channelManager.channels();
      const chatChannels = channels.filter(ch => ch.id && ch.id.includes('<->'));
      console.log(`   💬 Chat channels: ${chatChannels.length}`);
      
      // Show sample accessible objects
      console.log(`   📦 Sample accessible objects:`);
      accessible.slice(0, 3).forEach((obj, i) => {
        const hash = obj.idHash || obj.hash || obj.node || 'unknown';
        console.log(`     ${i+1}. ${obj.type || 'unknown'}: ${hash.substring(0, 12)}...`);
      });
    }
    
    // Check reverse maps
    const { getOnlyLatestReferencingObjsHashAndId } = await import('@refinio/one.core/lib/reverse-map-query.js');
    const accessGrants = await getOnlyLatestReferencingObjsHashAndId(remotePersonId, 'Access');
    const idAccessGrants = await getOnlyLatestReferencingObjsHashAndId(remotePersonId, 'IdAccess');
    
    console.log(`\n📋 Access Grants:`);
    console.log(`   Access objects: ${accessGrants.length}`);
    console.log(`   IdAccess objects: ${idAccessGrants.length}`);
    
    if (accessGrants.length === 0 && idAccessGrants.length === 0) {
      console.log(`   ❌ NO ACCESS GRANTS FOUND FOR REMOTE PERSON`);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
})();