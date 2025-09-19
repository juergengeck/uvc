/**
 * Verify CHUM Sync
 * 
 * This diagnostic specifically checks if the CHUM protocol can discover
 * channel and message objects for synchronization between devices.
 */

export async function verifyChumSync() {
  console.log('\n🔬 VERIFYING CHUM SYNC CAPABILITY');
  console.log('='.repeat(60));
  
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
    
    // Get channel manager
    const channelManager = appModel.channelManager;
    if (!channelManager) {
      console.log('❌ ChannelManager not available');
      return;
    }
    
    // Get all channels
    const channels = await channelManager.channels();
    console.log(`📺 Total channels: ${channels.length}`);
    
    // Find 1-to-1 chat channels
    const oneToOneChannels = channels.filter((ch: any) => ch.id && ch.id.includes('<->'));
    console.log(`💬 1-to-1 chat channels: ${oneToOneChannels.length}`);
    
    if (oneToOneChannels.length === 0) {
      console.log('❌ No 1-to-1 channels found');
      return;
    }
    
    // Test the first 1-to-1 channel
    const testChannel = oneToOneChannels[0];
    console.log(`\n🎯 Testing channel: ${testChannel.id.substring(0, 32)}...`);
    
    // Extract participant IDs
    const participantIds = testChannel.id.split('<->');
    const otherPersonId = participantIds.find((id: string) => id !== myPersonId);
    
    if (!otherPersonId) {
      console.log('❌ Could not determine other participant');
      return;
    }
    
    console.log(`👥 Other participant: ${otherPersonId.substring(0, 12)}...`);
    
    // Import ONE core functions
    const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
    const { getAllEntries } = await import('@refinio/one.core/lib/reverse-map-query.js');
    const { calculateIdHashOfObj } = await import('@refinio/one.core/lib/util/object.js');
    
    // Calculate channel info ID hash
    const channelInfoIdHash = await calculateIdHashOfObj({
      $type$: 'ChannelInfo',
      id: testChannel.id,
      owner: testChannel.owner || null
    });
    
    console.log(`🔑 Channel ID hash: ${channelInfoIdHash.substring(0, 12)}...`);
    
    // Test 1: Can the other person access this channel?
    console.log('\n📊 Testing if other person can access the channel:');
    
    try {
      const accessibleObjects = await getAccessibleRootHashes(otherPersonId);
      console.log(`   Total accessible objects: ${accessibleObjects.length}`);
      
      // Check if channel is accessible
      const channelAccessible = accessibleObjects.some((obj: any) => 
        obj.idHash === channelInfoIdHash || 
        obj.hash === channelInfoIdHash ||
        (obj.node && obj.node === channelInfoIdHash)
      );
      
      if (channelAccessible) {
        console.log(`   ✅ Channel IS accessible to other person!`);
      } else {
        console.log(`   ❌ Channel is NOT accessible to other person - THIS IS THE PROBLEM!`);
      }
      
      // Show some accessible objects for debugging
      if (accessibleObjects.length > 0) {
        console.log(`   Sample accessible objects:`);
        accessibleObjects.slice(0, 5).forEach((obj: any, i: number) => {
          const hash = obj.idHash || obj.hash || obj.node || 'unknown';
          console.log(`     ${i + 1}. Type: ${obj.type || 'unknown'}, Hash: ${hash.substring(0, 12)}...`);
        });
      }
    } catch (error) {
      console.log(`   ❌ Error checking accessible objects: ${error}`);
    }
    
    // Test 2: Check reverse maps
    console.log('\n📊 Checking reverse maps:');
    
    try {
      const { getOnlyLatestReferencingObjsHashAndId } = await import('@refinio/one.core/lib/reverse-map-query.js');
      
      // Check Access objects
      const accessObjs = await getOnlyLatestReferencingObjsHashAndId(otherPersonId, 'Access');
      console.log(`   Access objects referencing person: ${accessObjs.length}`);
      
      // Check IdAccess objects
      const idAccessObjs = await getOnlyLatestReferencingObjsHashAndId(otherPersonId, 'IdAccess');
      console.log(`   IdAccess objects referencing person: ${idAccessObjs.length}`);
      
      // Check if any of these grant access to our channel
      let foundChannelAccess = false;
      
      // Check in Access objects
      for (const accessObj of accessObjs) {
        const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
        try {
          const access = await getObject(accessObj.hash);
          if (access.object === channelInfoIdHash || access.object === testChannel.$versionHash$) {
            console.log(`   ✅ Found Access grant for channel!`);
            foundChannelAccess = true;
          }
        } catch (e) {
          // Ignore individual object errors
        }
      }
      
      // Check in IdAccess objects
      for (const idAccessObj of idAccessObjs) {
        const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
        try {
          const idAccess = await getObject(idAccessObj.hash);
          if (idAccess.id === channelInfoIdHash) {
            console.log(`   ✅ Found IdAccess grant for channel!`);
            foundChannelAccess = true;
          }
        } catch (e) {
          // Ignore individual object errors
        }
      }
      
      if (!foundChannelAccess) {
        console.log(`   ❌ No access grants found for the channel`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error checking reverse maps: ${error}`);
    }
    
    // Test 3: Check channel entries
    console.log('\n📊 Checking channel entries (messages):');
    
    try {
      // Get channel entries
      const channelIter = channelManager.channelIterator(testChannel.id, testChannel.owner || null);
      const entries = [];
      
      for await (const entry of channelIter) {
        entries.push(entry);
        if (entries.length >= 5) break; // Just check first 5
      }
      
      console.log(`   Found ${entries.length} channel entries`);
      
      if (entries.length > 0) {
        // Check if entries reference accessible objects
        for (const entry of entries) {
          if (entry.dataHash) {
            console.log(`   Entry data hash: ${entry.dataHash.substring(0, 12)}...`);
          }
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Error checking channel entries: ${error}`);
    }
    
    console.log('\n✅ Verification complete');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Make available globally
(globalThis as any).verifyChumSync = verifyChumSync;

export default verifyChumSync;