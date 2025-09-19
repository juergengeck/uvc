// Debug script to monitor access grant listeners and ChannelInfo replication
// Add this to your browser console to see when listeners fire

if (typeof window !== 'undefined' && window.appModel) {
  const appModel = window.appModel;
  
  console.log('🔧 SETTING UP ACCESS GRANT MONITORING...');
  
  // Monitor when ChannelManager.onUpdated fires
  let updateCount = 0;
  const originalListen = appModel.channelManager.onUpdated.listen;
  
  appModel.channelManager.onUpdated.listen = function(...args) {
    updateCount++;
    console.log(`🔔 [Monitor ${updateCount}] ChannelManager.onUpdated fired:`, {
      channelInfoIdHash: args[0]?.substring(0, 8) + '...',
      channelId: args[1]?.substring(0, 30) + '...',
      channelOwner: args[2]?.substring(0, 8) + '...',
      dataCount: args[4]?.length || 0
    });
    
    // Check if this is for a 1-to-1 channel
    if (args[1]?.includes('<->')) {
      console.log('  📱 This is a 1-to-1 channel update!');
      
      // Check access grants after a delay
      setTimeout(async () => {
        try {
          const connections = await appModel.transportManager.getActiveConnections();
          if (connections.length > 0) {
            const remote = connections[0].remotePersonId || connections[0].targetPersonId;
            const { isIdAccessibleBy } = await import('@refinio/one.core/lib/accessManager.js');
            
            const channelInfoAccessible = await isIdAccessibleBy(args[0], remote);
            console.log(`  🔍 ChannelInfo ${args[0].substring(0, 8)}... accessible to remote: ${channelInfoAccessible ? '✅' : '❌'}`);
            
            if (!channelInfoAccessible) {
              console.log('  🚨 PROBLEM: ChannelInfo not accessible to remote!');
            }
          }
        } catch (e) {
          console.log('  ❌ Error checking accessibility:', e.message);
        }
      }, 1000);
    }
    
    // Call original listeners
    return originalListen.apply(this, args);
  };
  
  console.log('✅ Access grant monitoring enabled');
  console.log('📝 Send a message to see when listeners fire...');
  
  // Add a function to check current channel state
  window.checkChannelState = async function() {
    console.log('\n🔍 CHECKING CURRENT CHANNEL STATE...');
    
    const connections = await appModel.transportManager.getActiveConnections();
    if (connections.length === 0) {
      console.log('❌ No connections');
      return;
    }
    
    const remote = connections[0].remotePersonId || connections[0].targetPersonId;
    const my = await appModel.leuteModel.myMainIdentity();
    const topicId = [my, remote].sort().join('<->');
    
    console.log(`🎯 Topic: ${topicId.substring(0, 32)}...`);
    
    const channelInfos = await appModel.channelManager.getMatchingChannelInfos({
      channelId: topicId
    });
    
    console.log(`📋 Found ${channelInfos.length} channel instances:`);
    
    for (let i = 0; i < channelInfos.length; i++) {
      const info = channelInfos[i];
      const isMine = info.owner === my;
      const isRemote = info.owner === remote;
      
      console.log(`  ${i + 1}. Owner: ${info.owner?.substring(0, 8)}... ${isMine ? '(ME)' : isRemote ? '(REMOTE)' : ''}`);
      
      // Check if this ChannelInfo is accessible to the remote
      try {
        const { isIdAccessibleBy } = await import('@refinio/one.core/lib/accessManager.js');
        const accessible = await isIdAccessibleBy(info.idHash, remote);
        console.log(`     Accessible to remote: ${accessible ? '✅' : '❌'}`);
      } catch (e) {
        console.log(`     Accessibility check failed: ${e.message}`);
      }
    }
  };
  
  console.log('✅ Use checkChannelState() to check current state');
} else {
  console.log('❌ AppModel not available');
}