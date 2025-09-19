#!/usr/bin/env node

// Debug script to check channel access and CHUM sync status
// Run this in the browser console to diagnose message sync issues

async function debugChannelAccess() {
  try {
    console.log('\n🔍 CHANNEL ACCESS DIAGNOSTIC');
    console.log('=' .repeat(60));
    
    // Check if global debug functions are available
    if (typeof window !== 'undefined' && window.appModel) {
      const appModel = window.appModel;
      console.log('✅ AppModel found via window.appModel');
      
      // Get connected person for 1-to-1 chat
      const connections = await appModel.transportManager.getActiveConnections();
      if (connections.length === 0) {
        console.log('❌ No active connections - cannot check CHUM sync');
        return;
      }
      
      const connection = connections[0];
      const remotePersonId = connection.remotePersonId || connection.targetPersonId;
      const myPersonId = await appModel.leuteModel.myMainIdentity();
      
      console.log(`👤 My Person ID: ${myPersonId.substring(0, 8)}...`);
      console.log(`🤝 Remote Person ID: ${remotePersonId.substring(0, 8)}...`);
      
      // Construct expected 1-to-1 topic ID
      const topicId = [myPersonId, remotePersonId].sort().join('<->');
      console.log(`🎯 Expected 1-to-1 topic ID: ${topicId.substring(0, 32)}...`);
      
      // Check topic exists
      const topicModel = appModel.topicModel;
      const topic = await topicModel.topics.queryById(topicId);
      if (!topic) {
        console.log('❌ Topic not found - creating topic first...');
        // Try to create the topic
        try {
          const newTopic = await topicModel.createOneToOneTopic(myPersonId, remotePersonId);
          console.log(`✅ Topic created: ${newTopic.id}`);
        } catch (e) {
          console.error('❌ Failed to create topic:', e.message);
          return;
        }
      } else {
        console.log('✅ Topic exists');
      }
      
      // Check channel instances
      console.log('\n📋 CHANNEL INSTANCES:');
      const channelManager = appModel.channelManager;
      const channelInfos = await channelManager.getMatchingChannelInfos({
        channelId: topicId
      });
      
      console.log(`Found ${channelInfos.length} channel instances:`);
      
      let myChannelInfo = null;
      let remoteChannelInfo = null;
      
      channelInfos.forEach((info, idx) => {
        const ownerStr = info.owner ? info.owner.substring(0, 8) + '...' : 'null';
        const isMine = info.owner === myPersonId;
        const isRemote = info.owner === remotePersonId;
        
        console.log(`  ${idx + 1}. Owner: ${ownerStr} ${isMine ? '(ME)' : isRemote ? '(REMOTE)' : ''}`);
        console.log(`     Head: ${info.head?.substring(0, 8) || 'null'}...`);
        console.log(`     Hash: ${info.idHash.substring(0, 8)}...`);
        
        if (isMine) myChannelInfo = info;
        if (isRemote) remoteChannelInfo = info;
      });
      
      // Check messages in my channel vs remote channel
      console.log('\n📝 MESSAGE COMPARISON:');
      
      if (myChannelInfo) {
        console.log('🟦 MY CHANNEL:');
        const myIterator = (channelManager.constructor).singleChannelObjectIterator(myChannelInfo);
        let myMessageCount = 0;
        const myMessages = [];
        
        for await (const entry of myIterator) {
          myMessageCount++;
          const { getObject } = await import('@refinio/one.core/lib/object.js');
          try {
            const msgData = await getObject(entry.dataHash);
            myMessages.push({
              text: msgData.text?.substring(0, 30) || 'No text',
              hash: entry.dataHash.substring(0, 8),
              time: new Date(entry.creationTime).toLocaleTimeString()
            });
          } catch (e) {
            myMessages.push({
              text: 'Failed to load',
              hash: entry.dataHash.substring(0, 8),
              time: new Date(entry.creationTime).toLocaleTimeString()
            });
          }
        }
        
        console.log(`  My channel has ${myMessageCount} messages:`);
        myMessages.forEach((msg, i) => {
          console.log(`    ${i + 1}. [${msg.time}] ${msg.hash}... "${msg.text}"`);
        });
      }
      
      if (remoteChannelInfo) {
        console.log('\n🟩 REMOTE CHANNEL:');
        const remoteIterator = (channelManager.constructor).singleChannelObjectIterator(remoteChannelInfo);
        let remoteMessageCount = 0;
        const remoteMessages = [];
        
        for await (const entry of remoteIterator) {
          remoteMessageCount++;
          const { getObject } = await import('@refinio/one.core/lib/object.js');
          try {
            const msgData = await getObject(entry.dataHash);
            remoteMessages.push({
              text: msgData.text?.substring(0, 30) || 'No text',
              hash: entry.dataHash.substring(0, 8),
              time: new Date(entry.creationTime).toLocaleTimeString()
            });
          } catch (e) {
            remoteMessages.push({
              text: 'Failed to load',
              hash: entry.dataHash.substring(0, 8),
              time: new Date(entry.creationTime).toLocaleTimeString()
            });
          }
        }
        
        console.log(`  Remote channel has ${remoteMessageCount} messages:`);
        remoteMessages.forEach((msg, i) => {
          console.log(`    ${i + 1}. [${msg.time}] ${msg.hash}... "${msg.text}"`);
        });
      } else {
        console.log('\n❌ Remote channel not found - this could be the issue!');
      }
      
      // Check CHUM accessibility
      console.log('\n🔍 CHUM ACCESS CHECK:');
      const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
      const accessible = await getAccessibleRootHashes(remotePersonId);
      console.log(`Objects accessible to remote: ${accessible.length}`);
      
      if (myChannelInfo) {
        const myChannelAccessible = accessible.includes(myChannelInfo.idHash);
        console.log(`My channel accessible to remote: ${myChannelAccessible ? '✅ YES' : '❌ NO'}`);
        
        if (!myChannelAccessible) {
          console.log('🚨 ISSUE: Remote cannot access my channel info!');
        }
      }
      
    } else {
      console.log('❌ AppModel not available - run this in the app context');
    }
    
  } catch (error) {
    console.error('❌ Channel access diagnostic failed:', error);
  }
  
  console.log('=' .repeat(60));
  console.log('🔍 DIAGNOSTIC COMPLETE\n');
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.debugChannelAccess = debugChannelAccess;
  console.log('✅ debugChannelAccess() function available in browser console');
}

// Auto-run in browser after delay
if (typeof window !== 'undefined') {
  setTimeout(debugChannelAccess, 2000);
}