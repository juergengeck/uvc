/**
 * Quick test for ChannelManager events that can be run in browser console
 * Run this in one simulator to test if events fire when posting messages
 */

export function quickEventTest() {
  console.log('\n🧪 QUICK CHANNELMANAGER EVENT TEST');
  console.log('='.repeat(50));
  
  // Get the global app model
  const appModel = (globalThis as any).appModel || (window as any).appModel;
  if (!appModel) {
    console.error('❌ No global appModel found');
    return;
  }
  
  const channelManager = appModel.channelManager;
  if (!channelManager) {
    console.error('❌ No channelManager found');
    return;
  }
  
  console.log('✅ Found ChannelManager');
  
  // Check current listener count
  const listenerCount = Object.keys(channelManager.onUpdated._listeners || {}).length;
  console.log(`🔍 Current onUpdated listeners: ${listenerCount}`);
  
  // Add a test listener
  let eventCount = 0;
  const disconnect = channelManager.onUpdated.listen((channelInfoIdHash, channelId, channelOwner, time, data) => {
    eventCount++;
    console.log(`🎉 EVENT ${eventCount}: Channel ${channelId} updated at ${time?.toISOString()}`);
    console.log(`   Hash: ${channelInfoIdHash?.substring(0, 16)}...`);
    console.log(`   Data entries: ${data?.length || 0}`);
  });
  
  console.log('✅ Test listener added');
  console.log('📝 Now post a message in the chat to test if events fire');
  console.log('⏳ Monitoring for 30 seconds...');
  
  // Auto-disconnect after 30 seconds
  setTimeout(() => {
    if (typeof disconnect === 'function') {
      disconnect();
    }
    console.log(`🏁 Test complete. Events received: ${eventCount}`);
    if (eventCount === 0) {
      console.log('❌ NO EVENTS FIRED - ChannelManager.onUpdated is broken');
    } else {
      console.log('✅ Events are working correctly');
    }
  }, 30000);
  
  return disconnect;
}

// Make available globally
(globalThis as any).quickEventTest = quickEventTest;

export default quickEventTest;