/**
 * Comprehensive Access Grant Diagnostics
 * 
 * This tool directly tests the ONE platform access grant system to understand
 * why getAccessibleRootHashes() returns 0 objects for CHUM synchronization.
 * 
 * Based on our memory of how the ONE access system actually works.
 * Optimized for React Native console logging.
 */

export async function createAccessGrantDiagnostics() {
  return {
    /**
     * Test the complete access grant discovery chain for a remote person
     */
    async testAccessGrantDiscovery(remotePersonId: string, debugDetails: boolean = true) {
      console.log('\n🔬 ACCESS GRANT DISCOVERY TEST');
      console.log('='.repeat(50));
      console.log(`Testing access for remote person: ${remotePersonId.substring(0, 12)}...`);
      
      try {
        // Import ONE core functions
        const getOnlyLatestReferencingObjsHashAndId = require('@refinio/one.core/lib/reverse-map-query.js').getOnlyLatestReferencingObjsHashAndId;
        const getAllEntries = require('@refinio/one.core/lib/reverse-map-query.js').getAllEntries;
        
        // 1. Test direct person access
        console.log('\n1️⃣ DIRECT PERSON ACCESS');
        try {
          const personAccessObjs = await getOnlyLatestReferencingObjsHashAndId(remotePersonId as any, 'Access');
          const personIdAccessObjs = await getOnlyLatestReferencingObjsHashAndId(remotePersonId as any, 'IdAccess');
          
          console.log(`   📊 Access objects referencing person: ${personAccessObjs.length}`);
          console.log(`   📊 IdAccess objects referencing person: ${personIdAccessObjs.length}`);
          
          if (debugDetails && personAccessObjs.length > 0) {
            console.log('   🔍 Access objects:');
            personAccessObjs.slice(0, 3).forEach((obj, i) => {
              console.log(`     ${i + 1}. Hash: ${obj.hash.substring(0, 12)}... ID: ${obj.idHash.substring(0, 12)}...`);
            });
          }
          
          if (debugDetails && personIdAccessObjs.length > 0) {
            console.log('   🔍 IdAccess objects:');
            personIdAccessObjs.slice(0, 3).forEach((obj, i) => {
              console.log(`     ${i + 1}. Hash: ${obj.hash.substring(0, 12)}... ID: ${obj.idHash.substring(0, 12)}...`);
            });
          }
          
        } catch (error) {
          console.log(`   ❌ Error checking direct person access: ${error}`);
        }
        
        // 2. Test group membership
        console.log('\n2️⃣ GROUP MEMBERSHIP');
        try {
          const groupsContainingPerson = await getOnlyLatestReferencingObjsHashAndId(remotePersonId as any, 'Group');
          console.log(`   📊 Groups containing person: ${groupsContainingPerson.length}`);
          
          if (debugDetails && groupsContainingPerson.length > 0) {
            console.log('   🔍 Group memberships:');
            groupsContainingPerson.slice(0, 3).forEach((group, i) => {
              console.log(`     ${i + 1}. Group Hash: ${group.hash.substring(0, 12)}... ID: ${group.idHash.substring(0, 12)}...`);
            });
          }
          
          // 3. Test group-based access for each group
          if (groupsContainingPerson.length > 0) {
            console.log('\n3️⃣ GROUP-BASED ACCESS');
            for (const group of groupsContainingPerson.slice(0, 3)) {
              try {
                const groupAccess = await getOnlyLatestReferencingObjsHashAndId(group.idHash as any, 'Access');
                const groupIdAccess = await getOnlyLatestReferencingObjsHashAndId(group.idHash as any, 'IdAccess');
                
                console.log(`   📊 Group ${group.idHash.substring(0, 8)}: ${groupAccess.length} Access + ${groupIdAccess.length} IdAccess`);
                
                if (debugDetails && (groupAccess.length > 0 || groupIdAccess.length > 0)) {
                  console.log(`      🔍 Access objects for this group:`);
                  groupAccess.slice(0, 2).forEach((obj, i) => {
                    console.log(`        Access ${i + 1}: ${obj.hash.substring(0, 12)}...`);
                  });
                  groupIdAccess.slice(0, 2).forEach((obj, i) => {
                    console.log(`        IdAccess ${i + 1}: ${obj.hash.substring(0, 12)}...`);
                  });
                }
              } catch (error) {
                console.log(`   ❌ Error checking group access for ${group.idHash.substring(0, 8)}: ${error}`);
              }
            }
          }
          
        } catch (error) {
          console.log(`   ❌ Error checking group membership: ${error}`);
        }
        
        // 4. Test final accessible hashes using getAllEntries (same as one.leute)
        console.log('\n4️⃣ FINAL ACCESSIBLE HASHES');
        try {
          const getAllEntries = require('@refinio/one.core/lib/reverse-map-query.js').getAllEntries;
          const accessibleHashes = await getAllEntries(remotePersonId as any);
          console.log(`   📊 Total accessible objects: ${accessibleHashes.length}`);
          
          if (debugDetails && accessibleHashes.length > 0) {
            console.log('   🔍 Sample accessible objects:');
            accessibleHashes.slice(0, 5).forEach((obj, i) => {
              console.log(`     ${i + 1}. Type: ${obj.type}, Hash: ${(obj as any).idHash || (obj as any).hash || 'unknown'}`.substring(0, 60));
            });
          }
          
          if (accessibleHashes.length === 0) {
            console.log('   🚨 CRITICAL: No accessible objects found - this explains CHUM sync failure!');
          }
          
        } catch (error) {
          console.log(`   ❌ Error getting accessible hashes: ${error}`);
        }
        
        console.log('\n✅ Access grant discovery test complete');
        
      } catch (error) {
        console.log(`❌ Access grant discovery test failed: ${error}`);
      }
    },
    
    /**
     * Test reverse map file existence directly
     */
    async testReverseMapFiles(remotePersonId: string) {
      console.log('\n🗃️ REVERSE MAP FILE TEST');
      console.log('='.repeat(40));
      
      try {
        // Import file reading function
        const { readUTF8TextFile } = await import('@refinio/one.core/lib/system/storage-base.js');
        const { STORAGE } = await import('@refinio/one.core/lib/storage-base-common.js');
        
        // Test specific reverse map files for this person
        const mapTypes = ['Access', 'IdAccess', 'Group'];
        
        for (const mapType of mapTypes) {
          const mapName = `${remotePersonId}.Object.${mapType}`;
          console.log(`   🔍 Testing map: ${mapName.substring(0, 40)}...`);
          
          try {
            const mapData = await readUTF8TextFile(mapName, STORAGE.RMAPS);
            const entries = mapData.slice(0, -1).split('\n');
            console.log(`     ✅ Found ${entries.length} entries`);
            
            if (entries.length > 0) {
              console.log(`     📝 Sample entries:`);
              entries.slice(0, 3).forEach((entry, i) => {
                console.log(`       ${i + 1}. ${entry.substring(0, 20)}...`);
              });
            }
            
          } catch (fileError) {
            if (fileError.name === 'FileNotFoundError') {
              console.log(`     ❌ Map file not found - no ${mapType} objects reference this person`);
            } else {
              console.log(`     ❌ Error reading map: ${fileError}`);
            }
          }
        }
        
      } catch (error) {
        console.log(`❌ Reverse map file test failed: ${error}`);
      }
    },
    
    /**
     * Test a specific channel's access grants
     */
    async testChannelAccess(channelId: string, remotePersonId: string) {
      console.log('\n📺 CHANNEL ACCESS TEST');
      console.log('='.repeat(40));
      console.log(`Channel: ${channelId.substring(0, 32)}...`);
      console.log(`Remote Person: ${remotePersonId.substring(0, 12)}...`);
      
      try {
        // Get AppModel to access ChannelManager
        const appModel = (window as any).appModel || (global as any).appModel;
        if (!appModel) {
          console.log('❌ AppModel not available in global scope');
          return;
        }
        
        // Calculate channel info hash
        const calculateIdHashOfObj = require('@refinio/one.core/lib/util/object.js').calculateIdHashOfObj;
        
        // Try to determine channel owner from channelId
        let channelOwner = null;
        if (channelId.includes('<->')) {
          // 1-to-1 chat, no specific owner
          channelOwner = null;
        } else {
          // System channel, might have owner
          channelOwner = null;
        }
        
        const channelInfoIdHash = await calculateIdHashOfObj({
          $type$: 'ChannelInfo',
          id: channelId,
          owner: channelOwner === null ? undefined : channelOwner
        });
        
        console.log(`   🎯 ChannelInfo ID Hash: ${channelInfoIdHash.substring(0, 12)}...`);
        
        // Test if this channel is accessible to remote person
        const getAllEntries = require('@refinio/one.core/lib/reverse-map-query.js').getAllEntries;
        const accessibleHashes = await getAllEntries(remotePersonId as any);
        
        const hasChannelAccess = accessibleHashes.some(obj => {
          return (obj as any).idHash === channelInfoIdHash || (obj as any).hash === channelInfoIdHash;
        });
        
        console.log(`   📊 Channel accessible to remote person: ${hasChannelAccess ? '✅ YES' : '❌ NO'}`);
        
        if (!hasChannelAccess) {
          console.log('   🚨 CRITICAL: Remote person cannot access this channel - explains why no messages sync!');
        }
        
        // Check reverse maps for this channel
        const getOnlyLatestReferencingObjsHashAndId = require('@refinio/one.core/lib/reverse-map-query.js').getOnlyLatestReferencingObjsHashAndId;
        
        try {
          const accessGrants = await getOnlyLatestReferencingObjsHashAndId(channelInfoIdHash as any, 'Access');
          const idAccessGrants = await getOnlyLatestReferencingObjsHashAndId(channelInfoIdHash as any, 'IdAccess');
          
          console.log(`   📊 Access grants for channel: ${accessGrants.length} Access + ${idAccessGrants.length} IdAccess`);
          
          if (accessGrants.length === 0 && idAccessGrants.length === 0) {
            console.log('   🚨 CRITICAL: No access grants found for this channel!');
          }
          
        } catch (error) {
          console.log(`   ❌ Error checking channel access grants: ${error}`);
        }
        
      } catch (error) {
        console.log(`❌ Channel access test failed: ${error}`);
      }
    },
    
    /**
     * Test group membership specifically for everyone group
     */
    async testEveryoneGroupMembership(remotePersonId: string) {
      console.log('\n👥 EVERYONE GROUP MEMBERSHIP TEST');
      console.log('='.repeat(45));
      
      try {
        // Get AppModel to access group information
        const appModel = (window as any).appModel || (global as any).appModel;
        if (!appModel) {
          console.log('❌ AppModel not available in global scope');
          return;
        }
        
        // Try to get everyone group
        const GroupModel = require('@refinio/one.models/lib/models/Leute/GroupModel.js').default;
        const everyoneGroup = await GroupModel.constructFromLatestProfileVersionByGroupName('everyone');
        
        console.log(`   🎯 Everyone group ID: ${everyoneGroup.groupIdHash.substring(0, 12)}...`);
        
        // Check if remote person is member of everyone group
        const getOnlyLatestReferencingObjsHashAndId = require('@refinio/one.core/lib/reverse-map-query.js').getOnlyLatestReferencingObjsHashAndId;
        const groupsContainingPerson = await getOnlyLatestReferencingObjsHashAndId(remotePersonId as any, 'Group');
        
        const isInEveryoneGroup = groupsContainingPerson.some(group => group.idHash === everyoneGroup.groupIdHash);
        
        console.log(`   📊 Remote person in everyone group: ${isInEveryoneGroup ? '✅ YES' : '❌ NO'}`);
        
        if (!isInEveryoneGroup) {
          console.log('   🚨 CRITICAL: Remote person is not in everyone group - this breaks group-based access!');
          console.log('   💡 TIP: Check if remote person was properly added to everyone group during pairing');
        }
        
        // Check what groups the person IS in
        console.log(`   📊 Total groups person belongs to: ${groupsContainingPerson.length}`);
        if (groupsContainingPerson.length > 0) {
          console.log('   🔍 Group memberships:');
          groupsContainingPerson.slice(0, 3).forEach((group, i) => {
            console.log(`     ${i + 1}. Group: ${group.idHash.substring(0, 12)}...`);
          });
        }
        
      } catch (error) {
        console.log(`❌ Everyone group membership test failed: ${error}`);
      }
    }
  };
}

/**
 * Run all diagnostic tests for a remote person and channel
 */
export async function runCompleteAccessDiagnostics(remotePersonId: string, channelId?: string) {
  console.log('\n🔬 COMPLETE ACCESS GRANT DIAGNOSTICS');
  console.log('='.repeat(60));
  console.log(`🎯 Target: Remote Person ${remotePersonId.substring(0, 12)}...`);
  if (channelId) {
    console.log(`🎯 Channel: ${channelId.substring(0, 32)}...`);
  }
  
  const diagnostics = await createAccessGrantDiagnostics();
  
  // Run all tests in sequence
  await diagnostics.testReverseMapFiles(remotePersonId);
  await diagnostics.testEveryoneGroupMembership(remotePersonId);
  await diagnostics.testAccessGrantDiscovery(remotePersonId, true);
  
  if (channelId) {
    await diagnostics.testChannelAccess(channelId, remotePersonId);
  }
  
  console.log('\n🏁 COMPLETE DIAGNOSTICS FINISHED');
  console.log('='.repeat(40));
  console.log('💡 KEY INSIGHTS:');
  console.log('   1. Check if reverse map files exist for the remote person');
  console.log('   2. Verify remote person is member of everyone group');
  console.log('   3. Ensure channel has proper access grants (use IdAccess for ChannelInfo)');
  console.log('   4. Fix any missing access grants or group memberships');
}

// Make diagnostic functions available globally
if (typeof window !== 'undefined') {
  (window as any).runCompleteAccessDiagnostics = runCompleteAccessDiagnostics;
  (window as any).createAccessGrantDiagnostics = createAccessGrantDiagnostics;
}

// Make available in Node.js/React Native global scope
if (typeof global !== 'undefined') {
  (global as any).runCompleteAccessDiagnostics = runCompleteAccessDiagnostics;
  (global as any).createAccessGrantDiagnostics = createAccessGrantDiagnostics;
}