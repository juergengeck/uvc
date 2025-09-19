/**
 * Debug CHUM sync issue - why messages don't appear on both devices
 */

import type { AppModel } from '../models/AppModel';

export async function debugChumSync(appModel: AppModel): Promise<void> {
  console.log('\n🔍 CHUM SYNC DEBUG\n');
  
  // Get device info
  const myId = await appModel.leuteModel.myMainIdentity();
  const deviceId = myId.personId.substring(0, 8);
  console.log(`📱 DEVICE: ${deviceId}`);
  
  // Get current channel
  const chatModel = appModel.chatModel;
  const channelId = chatModel.currentChannelId;
  const channelInfo = chatModel.currentChannelInfo;
  
  if (!channelId || !channelInfo) {
    console.log('❌ No active channel');
    return;
  }
  
  console.log(`\n📺 CHANNEL INFO:`);
  console.log(`   ID: ${channelId}`);
  console.log(`   Owner: ${channelInfo.owner?.substring(0, 8) || 'undefined'}`);
  console.log(`   Hash: ${channelInfo.$idHash$?.substring(0, 8)}...`);
  console.log(`   Version: ${channelInfo.$versionHash$?.substring(0, 8)}...`);
  
  // Get messages
  const messages = chatModel.getMessages();
  console.log(`\n📨 MESSAGES: ${messages.length} total`);
  messages.forEach((msg, idx) => {
    console.log(`   ${idx + 1}. "${msg.text}" (${msg.hash?.substring(0, 8)}...)`);
  });
  
  // Check channel access
  const { getOnlyLatestReferencingObjsHashAndId } = await import('@refinio/one.core/lib/reverse-map-query.js');
  
  console.log(`\n🔐 ACCESS GRANTS:`);
  
  // Check IdAccess grants
  const idAccessGrants = await getOnlyLatestReferencingObjsHashAndId(channelInfo.$idHash$, 'IdAccess');
  console.log(`   IdAccess grants for channel: ${idAccessGrants.length}`);
  
  // Check Access grants for channel version
  if (channelInfo.$versionHash$) {
    const accessGrants = await getOnlyLatestReferencingObjsHashAndId(channelInfo.$versionHash$, 'Access');
    console.log(`   Access grants for version: ${accessGrants.length}`);
  }
  
  // Check if we have grants for individual messages
  if (messages.length > 0) {
    const firstMsg = messages[0];
    if (firstMsg.hash) {
      const msgGrants = await getOnlyLatestReferencingObjsHashAndId(firstMsg.hash, 'Access');
      console.log(`   Access grants for first message: ${msgGrants.length}`);
    }
  }
  
  // Check connections
  const connectionsModel = appModel.transportManager.getConnectionsModel();
  const connections = connectionsModel?.connectionsInfo() || [];
  const activeConns = connections.filter(c => c.state === 'connected');
  
  console.log(`\n🔗 CONNECTIONS: ${activeConns.length} active`);
  
  for (const conn of activeConns) {
    const remoteId = conn.remotePersonId?.substring(0, 8);
    console.log(`\n   Connection to ${remoteId}:`);
    
    // Check what they can access from us
    try {
      const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
      const theirAccess = await getAccessibleRootHashes(conn.remotePersonId);
      console.log(`   They can access ${theirAccess.length} objects from us`);
      
      // Check if they can access our channel
      const canAccessChannel = theirAccess.includes(channelInfo.$idHash$);
      console.log(`   Can access our channel: ${canAccessChannel ? '✅' : '❌'}`);
      
      // Check if they can access our messages
      if (messages.length > 0 && messages[0].hash) {
        const canAccessMsg = theirAccess.includes(messages[0].hash);
        console.log(`   Can access our messages: ${canAccessMsg ? '✅' : '❌'}`);
      }
    } catch (e) {
      console.log(`   Error checking access: ${e.message}`);
    }
  }
  
  console.log(`\n💡 DIAGNOSIS:`);
  
  // Common issues
  if (activeConns.length === 0) {
    console.log('❌ No active connections - devices not connected');
  } else if (idAccessGrants.length === 0) {
    console.log('❌ No IdAccess grants - channel not shared');
  } else if (messages.length > 0) {
    // Check if messages have grants
    console.log('🔍 Checking if message access grants exist...');
  }
  
  console.log(`\n📋 SUMMARY FOR DEVICE ${deviceId}:`);
  console.log(`Channel owner: ${channelInfo.owner?.substring(0, 8)}`);
  console.log(`Messages: ${messages.length}`);
  console.log(`Connected to: ${activeConns.map(c => c.remotePersonId?.substring(0, 8)).join(', ')}`);
  console.log(`\nRun this on BOTH devices and compare results!`);
}

// Export to global
(globalThis as any).debugChumSync = () => {
  const appModel = (globalThis as any).getAppModel?.();
  if (appModel) {
    debugChumSync(appModel);
  } else {
    console.log('❌ AppModel not available');
  }
};