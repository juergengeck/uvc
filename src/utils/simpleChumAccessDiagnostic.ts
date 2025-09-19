/**
 * Simple CHUM Access Diagnostic
 * 
 * This is a minimal diagnostic to check if access grants are being created correctly
 * and if CHUM can discover objects for remote peers.
 */

export async function runSimpleChumAccessDiagnostic() {
  console.log('\n🔍 SIMPLE CHUM ACCESS DIAGNOSTIC');
  console.log('='.repeat(50));
  
  try {
    // Get AppModel
    const appModel = (window as any).appModel || (global as any).appModel;
    if (!appModel) {
      console.log('❌ AppModel not available');
      return;
    }
    
    // Get my person ID
    const myPersonId = await appModel.leuteModel.myMainIdentity();
    console.log(`👤 My person ID: ${myPersonId.substring(0, 12)}...`);
    
    // Get active connections
    const connections = await appModel.transportManager.getActiveConnections();
    console.log(`🌐 Active connections: ${connections.length}`);
    
    if (connections.length === 0) {
      console.log('❌ No active connections - cannot test CHUM sync');
      return;
    }
    
    // Test for each connection
    for (const connection of connections) {
      const remotePersonId = connection.remotePersonId || connection.targetPersonId;
      if (!remotePersonId) continue;
      
      console.log(`\n🎯 Testing access for remote person: ${remotePersonId.substring(0, 12)}...`);
      
      // Import ONE core functions
      const { getAllEntries } = await import('@refinio/one.core/lib/reverse-map-query.js');
      const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
      
      // Test 1: Check what objects are accessible
      try {
        const accessibleObjects = await getAccessibleRootHashes(remotePersonId);
        console.log(`   📊 Accessible root hashes: ${accessibleObjects.length}`);
        
        if (accessibleObjects.length > 0) {
          console.log(`   ✅ CHUM can discover ${accessibleObjects.length} objects for this person`);
          // Show first few objects
          accessibleObjects.slice(0, 3).forEach((obj: any, i: number) => {
            console.log(`     ${i + 1}. Type: ${obj.type}, Hash: ${(obj.hash || obj.idHash || 'unknown').substring(0, 12)}...`);
          });
        } else {
          console.log(`   ❌ CRITICAL: No accessible objects found - CHUM sync will fail!`);
        }
      } catch (error) {
        console.log(`   ❌ Error getting accessible objects: ${error}`);
      }
      
      // Test 2: Check reverse map entries
      try {
        const allEntries = await getAllEntries(remotePersonId);
        console.log(`   📊 Total reverse map entries: ${allEntries.length}`);
        
        if (allEntries.length === 0) {
          console.log(`   ❌ No reverse map entries - access grants may not be working`);
        }
      } catch (error) {
        console.log(`   ❌ Error getting reverse map entries: ${error}`);
      }
      
      // Test 3: Check if person is in everyone group
      try {
        const { getOnlyLatestReferencingObjsHashAndId } = await import('@refinio/one.core/lib/reverse-map-query.js');
        const groupsContainingPerson = await getOnlyLatestReferencingObjsHashAndId(remotePersonId, 'Group');
        console.log(`   👥 Groups containing person: ${groupsContainingPerson.length}`);
        
        if (groupsContainingPerson.length === 0) {
          console.log(`   ❌ Person is not in any groups - may need to be added to everyone group`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking group membership: ${error}`);
      }
    }
    
    console.log('\n✅ Diagnostic complete');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

// Make available globally
(globalThis as any).runSimpleChumAccessDiagnostic = runSimpleChumAccessDiagnostic;

export default runSimpleChumAccessDiagnostic;