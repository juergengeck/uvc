/**
 * Diagnostic script to identify why messages aren't being exchanged between devices
 */

export async function diagnoseMessageExchange(): Promise<void> {
  console.log('\n🔍 MESSAGE EXCHANGE DIAGNOSTIC');
  console.log('=' .repeat(50));

  try {
    // Check if models are available
    const { getModel } = await import('../initialization/index');
    const appModel = getModel();
    
    if (!appModel) {
      console.error('❌ AppModel not available');
      return;
    }

    console.log('✅ AppModel available');

    // Check TransportManager
    const transportManager = appModel.transportManager;
    if (!transportManager) {
      console.error('❌ TransportManager not available');
      return;
    }
    console.log('✅ TransportManager available');

    // Check CommServerManager
    const commServerManager = transportManager.getCommServerManager();
    if (!commServerManager) {
      console.error('❌ CommServerManager not available');
      return;
    }
    console.log('✅ CommServerManager available');

    // Check CommServerManager status
    console.log(`📊 CommServerManager status: ${commServerManager.status}`);

    // Check ChannelManager
    const channelManager = appModel.channelManager;
    if (!channelManager) {
      console.error('❌ ChannelManager not available');
      return;
    }
    console.log('✅ ChannelManager available');

    // Check if ChannelManager has onUpdated event
    if (!channelManager.onUpdated) {
      console.error('❌ ChannelManager.onUpdated not available');
      return;
    }
    console.log('✅ ChannelManager.onUpdated available');

    // Check listener count
    const listenerCount = (channelManager.onUpdated as any).listeners?.length || 0;
    console.log(`📊 ChannelManager.onUpdated listener count: ${listenerCount}`);

    // Check connections
    const connectionsModel = transportManager.getConnectionsModel();
    if (!connectionsModel) {
      console.error('❌ ConnectionsModel not available');
      return;
    }
    console.log('✅ ConnectionsModel available');

    // Check active connections
    const activeConnections = await transportManager.getActiveConnections();
    console.log(`📊 Active connections: ${activeConnections.length}`);

    // Test message sending
    console.log('\n🧪 TESTING MESSAGE SENDING...');
    
    // Get all ChatMessage objects to see what's in the system
    const allMessages = await channelManager.getObjectsWithType('ChatMessage', {
      limit: 50  // Get up to 50 recent messages
    });
    
    console.log(`📊 Total ChatMessage objects in system: ${allMessages.length}`);
    
    // Group messages by channel
    const messagesByChannel = new Map<string, any[]>();
    for (const message of allMessages) {
      const channelId = (message as any).channelId || 'unknown';
      if (!messagesByChannel.has(channelId)) {
        messagesByChannel.set(channelId, []);
      }
      messagesByChannel.get(channelId)!.push(message);
    }
    
    console.log(`📊 Messages distributed across ${messagesByChannel.size} channels:`);
    for (const [channelId, messages] of messagesByChannel) {
      console.log(`  - ${channelId.substring(0, 30)}...: ${messages.length} messages`);
    }
    
    // Test if we can manually trigger the onUpdated event
    console.log('\n🧪 TESTING CHANNEL MANAGER EVENT SYSTEM...');
    
    let eventFired = false;
    const testListener = () => {
      eventFired = true;
      console.log('✅ Test event fired successfully');
    };
    
    channelManager.onUpdated.listen(testListener);
    
    // Wait a moment to see if any events fire naturally
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (!eventFired) {
      console.log('❌ No onUpdated events fired during test period');
    }
    
    // Clean up test listener
    channelManager.onUpdated.dont(testListener);
    
    console.log('\n📋 DIAGNOSTIC SUMMARY:');
    console.log(`- AppModel: ✅`);
    console.log(`- TransportManager: ✅`);
    console.log(`- CommServerManager: ✅ (status: ${commServerManager.status})`);
    console.log(`- ChannelManager: ✅`);
    console.log(`- onUpdated listeners: ${listenerCount}`);
    console.log(`- Active connections: ${activeConnections.length}`);
    console.log(`- Total messages: ${allMessages.length}`);
    console.log(`- Channels with messages: ${messagesByChannel.size}`);
    console.log(`- Event system: ${eventFired ? '✅' : '❌'}`);

  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

// Export for use in development
(global as any).diagnoseMessageExchange = diagnoseMessageExchange; 