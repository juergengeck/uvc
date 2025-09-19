#!/usr/bin/env node

// Debug script to check CHUM access rights for message synchronization
// Run this in the browser console or as a standalone debug script

async function debugChumAccess() {
  try {
    console.log('🔍 CHUM ACCESS RIGHTS DIAGNOSTIC');
    console.log('=' .repeat(50));
    
    // Check if global debug functions are available
    if (typeof window !== 'undefined' && window.appModel) {
      const appModel = window.appModel;
      console.log('✅ AppModel found via window.appModel');
      
      // Check for active connections
      const connections = await appModel.transportManager.getActiveConnections();
      console.log(`📡 Active connections: ${connections.length}`);
      
      if (connections.length === 0) {
        console.log('❌ No active connections - cannot check CHUM sync');
        return;
      }
      
      const connection = connections[0];
      const remotePersonId = connection.remotePersonId || connection.targetPersonId;
      console.log(`🤝 Connection to: ${remotePersonId.substring(0, 8)}...`);
      
      // Import access manager functions
      const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
      const { getOnlyLatestReferencingObjsHashAndId } = await import('@refinio/one.core/lib/reverse-map-query.js');
      
      // Check accessible objects
      const accessible = await getAccessibleRootHashes(remotePersonId);
      console.log(`📊 Objects accessible to remote: ${accessible.length}`);
      
      // Check access grants
      const access = await getOnlyLatestReferencingObjsHashAndId(remotePersonId, 'Access');
      const idAccess = await getOnlyLatestReferencingObjsHashAndId(remotePersonId, 'IdAccess');
      console.log(`🔑 Access grants: ${access.length}`);
      console.log(`🔑 IdAccess grants: ${idAccess.length}`);
      
      // Check for chat channel objects
      console.log('\n📝 CHECKING CHAT CHANNELS...');
      const leuteModel = appModel.leuteModel;
      const channelManager = appModel.channelManager;
      
      // Get my person ID
      const myPersonId = await leuteModel.myMainIdentity();
      console.log(`👤 My Person ID: ${myPersonId.substring(0, 8)}...`);
      
      // Look for 1-to-1 chat topic between me and remote
      const topicId = [myPersonId, remotePersonId].sort().join('<->');
      console.log(`🎯 Expected 1-to-1 topic ID: ${topicId}`);
      
      // Check if topic exists
      const topicModel = appModel.topicModel;
      const topic = await topicModel.topics.queryById(topicId);
      if (topic) {
        console.log(`✅ Topic found: ${topic.name || 'Unnamed'}`);
        
        // Check channel infos for this topic
        const channelInfos = await channelManager.getMatchingChannelInfos({
          channelId: topicId
        });
        console.log(`📋 Channel instances for topic: ${channelInfos.length}`);
        
        channelInfos.forEach((info, idx) => {
          console.log(`  Channel ${idx + 1}:`);
          console.log(`    Owner: ${info.owner?.substring(0, 8) || 'null'}`);
          console.log(`    IsMyChannel: ${info.isMyChannel}`);
          console.log(`    Head: ${info.head?.substring(0, 8) || 'null'}`);
        });
        
        // Check if remote has access to our channel content
        console.log('\n🔍 CHECKING CHANNEL ACCESS...');
        for (const channelInfo of channelInfos) {
          if (channelInfo.owner === myPersonId) {
            console.log(`📤 My channel (${channelInfo.owner.substring(0, 8)}...):`);
            
            // Check if this channel's content is accessible to remote
            const channelHash = channelInfo.idHash;
            const isAccessible = accessible.some(hash => hash === channelHash);
            console.log(`  Channel accessible to remote: ${isAccessible ? '✅ YES' : '❌ NO'}`);
            
            if (!isAccessible) {
              console.log('  🚨 PROBLEM: Remote cannot access our channel content!');
            }
          } else if (channelInfo.owner === remotePersonId) {
            console.log(`📥 Remote channel (${channelInfo.owner.substring(0, 8)}...):`);
            console.log('  This should contain remote messages that we should see');
          }
        }
      } else {
        console.log(`❌ Topic not found: ${topicId}`);
      }
      
    } else {
      console.log('❌ AppModel not available - run this in the app context');
    }
    
  } catch (error) {
    console.error('❌ CHUM diagnostic failed:', error);
  }
  
  console.log('=' .repeat(50));
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.debugChumAccess = debugChumAccess;
  console.log('✅ debugChumAccess() function available in browser console');
}

// Auto-run if in Node.js environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = debugChumAccess;
}

// Auto-run in browser
if (typeof window !== 'undefined') {
  // Wait a bit for app to load, then run diagnostic
  setTimeout(debugChumAccess, 2000);
}