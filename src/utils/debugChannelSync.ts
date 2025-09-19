/**
 * Debug Channel Synchronization
 * 
 * Quick commands to diagnose channel sync issues between devices
 */

// Import diagnostics
import { runChannelSyncDiagnostics } from './channelSyncDiagnostics';
import { runChumSyncDiagnostics } from './chumSyncDiagnostics';

/**
 * Run complete channel sync diagnostics
 * 
 * Usage: await debugChannelSync('channel-id-here')
 */
export async function debugChannelSync(channelId: string) {
  console.log('\n🔍 DEBUGGING CHANNEL SYNCHRONIZATION');
  console.log('='.repeat(80));
  
  // Run channel-specific diagnostics
  console.log('\n📊 Running channel diagnostics...');
  await runChannelSyncDiagnostics(channelId);
  
  // Run CHUM diagnostics
  console.log('\n📊 Running CHUM diagnostics...');
  await runChumSyncDiagnostics();
  
  console.log('\n✅ Diagnostics complete');
  console.log('\n💡 Next steps:');
  console.log('1. Check if both devices show the same message count');
  console.log('2. Verify ChumPlugin is installed on both devices');
  console.log('3. Ensure devices have active P2P connection');
  console.log('4. Look for CHUM sync messages in the logs');
  console.log('5. Try sending a test message and watch the logs');
}

/**
 * Monitor channel updates in real-time
 * 
 * Usage: monitorChannelUpdates()
 */
export function monitorChannelUpdates() {
  const appModel = (window as any).appModel || (global as any).appModel;
  
  if (!appModel?.channelManager) {
    console.error('❌ ChannelManager not available');
    return;
  }
  
  console.log('📡 Monitoring channel updates...');
  console.log('Press Ctrl+C to stop\n');
  
  const unsubscribe = appModel.channelManager.onUpdated.listen((
    channelInfoIdHash: any,
    channelId: any,
    channelOwner: any,
    timeOfEarliestChange: any,
    data: any
  ) => {
    console.log('\n🔔 CHANNEL UPDATE DETECTED!');
    console.log(`   Channel: ${channelId}`);
    console.log(`   Owner: ${channelOwner?.substring(0, 16) || 'none'}...`);
    console.log(`   Time: ${timeOfEarliestChange?.toISOString()}`);
    console.log(`   Data entries: ${data?.length || 0}`);
    
    if (data && data.length > 0) {
      console.log('   📦 Data entries:');
      data.forEach((entry: any, idx: number) => {
        console.log(`      ${idx + 1}. ${entry.channelEntryHash?.substring(0, 16) || 'no hash'}...`);
      });
    }
  });
  
  // Store unsubscribe function globally for cleanup
  (globalThis as any).__channelMonitorUnsubscribe = unsubscribe;
  
  console.log('✅ Monitor started. To stop: __channelMonitorUnsubscribe()');
}

/**
 * Test message synchronization between devices
 * 
 * Usage: await testMessageSync('channel-id', 'Test message')
 */
export async function testMessageSync(channelId: string, message: string = 'Test sync message') {
  const appModel = (window as any).appModel || (global as any).appModel;
  
  if (!appModel?.chatModel) {
    console.error('❌ ChatModel not available');
    return;
  }
  
  console.log(`\n🧪 TESTING MESSAGE SYNC`);
  console.log(`Channel: ${channelId}`);
  console.log(`Message: "${message}"`);
  
  try {
    // Send message
    console.log('\n📤 Sending message...');
    await appModel.chatModel.sendMessage(message);
    console.log('✅ Message sent');
    
    // Wait for propagation
    console.log('⏳ Waiting 3 seconds for sync...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check message count
    const messages = appModel.chatModel.getMessages();
    console.log(`\n📊 Current message count: ${messages.length}`);
    
    // Check last message
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      console.log('📨 Last message:', {
        text: lastMessage.text?.substring(0, 50) + '...',
        sender: lastMessage.senderId?.substring(0, 8) + '...',
        timestamp: lastMessage.timestamp
      });
    }
    
    console.log('\n💡 Check the other device to see if this message appeared');
    
  } catch (error) {
    console.error('❌ Error testing message sync:', error);
  }
}

// Make functions available globally
(globalThis as any).debugChannelSync = debugChannelSync;
(globalThis as any).monitorChannelUpdates = monitorChannelUpdates;
(globalThis as any).testMessageSync = testMessageSync;

// Export for module usage
export default {
  debugChannelSync,
  monitorChannelUpdates,
  testMessageSync
};