// Basic CHUM connectivity test
// Run this in browser console to test basic CHUM sync

async function testChumBasic() {
  try {
    console.log('🧪 BASIC CHUM CONNECTIVITY TEST');
    console.log('=' .repeat(50));
    
    if (!window.appModel) {
      console.log('❌ AppModel not available');
      return;
    }
    
    const appModel = window.appModel;
    
    // 1. Check connections
    const connections = await appModel.transportManager.getActiveConnections();
    console.log(`📡 Active connections: ${connections.length}`);
    
    if (connections.length === 0) {
      console.log('❌ No connections - pair devices first');
      return;
    }
    
    const connection = connections[0];
    const remote = connection.remotePersonId || connection.targetPersonId;
    console.log(`🤝 Connected to: ${remote.substring(0, 8)}...`);
    
    // 2. Check basic CHUM accessibility
    const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
    const accessible = await getAccessibleRootHashes(remote);
    console.log(`📊 Objects accessible to remote: ${accessible.length}`);
    
    if (accessible.length === 0) {
      console.log('🚨 CRITICAL: No objects accessible to remote - CHUM sync is broken!');
      return;
    }
    
    // 3. Check access grants
    const { getOnlyLatestReferencingObjsHashAndId } = await import('@refinio/one.core/lib/reverse-map-query.js');
    const access = await getOnlyLatestReferencingObjsHashAndId(remote, 'Access');
    const idAccess = await getOnlyLatestReferencingObjsHashAndId(remote, 'IdAccess');
    console.log(`🔑 Access grants: ${access.length}`);
    console.log(`🔑 IdAccess grants: ${idAccess.length}`);
    
    if (access.length === 0 && idAccess.length === 0) {
      console.log('🚨 No access grants found - creating test grant...');
      
      // Create a simple test grant
      const { createAccess } = await import('@refinio/one.core/lib/access.js');
      const testGrant = [{
        id: remote,
        person: [await appModel.leuteModel.myMainIdentity()],
        group: [],
        mode: 'ADD'
      }];
      
      try {
        await createAccess(testGrant);
        console.log('✅ Test access grant created');
        
        // Re-check
        const newAccessible = await getAccessibleRootHashes(remote);
        console.log(`📊 Objects accessible after grant: ${newAccessible.length}`);
      } catch (e) {
        console.log('❌ Failed to create test grant:', e.message);
      }
    }
    
    // 4. Test basic object creation and access
    console.log('\n🧪 Testing object creation and access...');
    
    try {
      const { createUnversionedObject } = await import('@refinio/one.core/lib/object.js');
      const testObj = await createUnversionedObject({
        $type$: 'TestMessage',
        text: 'CHUM sync test from ' + new Date().toISOString(),
        sender: await appModel.leuteModel.myMainIdentity()
      });
      
      console.log(`✅ Test object created: ${testObj.substring(0, 8)}...`);
      
      // Grant access to this object
      const { createAccess } = await import('@refinio/one.core/lib/access.js');
      await createAccess([{
        object: testObj,
        person: [remote],
        group: [],
        mode: 'ADD'
      }]);
      
      console.log('✅ Access granted to test object');
      
      // Check if it becomes accessible
      setTimeout(async () => {
        const newAccessible = await getAccessibleRootHashes(remote);
        const isAccessible = newAccessible.includes(testObj);
        console.log(`🔍 Test object accessible to remote: ${isAccessible ? '✅' : '❌'}`);
      }, 2000);
      
    } catch (e) {
      console.log('❌ Object creation test failed:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Basic CHUM test failed:', error);
  }
}

// Export and auto-run
if (typeof window !== 'undefined') {
  window.testChumBasic = testChumBasic;
  setTimeout(testChumBasic, 1000);
}