/**
 * Test script to verify ChannelManager.onUpdated events fire correctly
 * 
 * This script will test if the channel event system is working by:
 * 1. Getting the current ChannelManager instance
 * 2. Registering a test listener
 * 3. Posting a test message to trigger an event
 * 4. Verifying the event fires
 */

export async function testChannelManagerEvents(): Promise<boolean> {
  console.log('\n🧪 TESTING CHANNELMANAGER.ONUPDATED EVENTS');
  console.log('='.repeat(60));
  
  try {
    // Get AppModel instance
    const { getModel } = await import('../initialization/index');
    const appModel = getModel();
    
    if (!appModel) {
      console.error('❌ No AppModel available - cannot test events');
      return false;
    }
    
    const channelManager = appModel.channelManager;
    if (!channelManager) {
      console.error('❌ No ChannelManager available - cannot test events');
      return false;
    }
    
    console.log('✅ Got ChannelManager instance');
    console.log(`🔍 ChannelManager onUpdated exists: ${!!channelManager.onUpdated}`);
    console.log(`🔍 ChannelManager onUpdated.listen exists: ${!!channelManager.onUpdated?.listen}`);
    
    // Count existing listeners
    const existingListeners = Object.keys(channelManager.onUpdated._listeners || {}).length;
    console.log(`🔍 Existing listeners count: ${existingListeners}`);
    
    // Register a test listener
    let eventReceived = false;
    let eventData: any = null;
    
    console.log('📝 Registering test listener...');
    const disconnect = channelManager.onUpdated.listen((
      channelInfoIdHash: string,
      channelId: string,
      channelOwner: any,
      timeOfEarliestChange: Date,
      data: any[]
    ) => {
      console.log('🎉 TEST EVENT RECEIVED!');
      console.log(`   Channel ID: ${channelId}`);
      console.log(`   Channel Hash: ${channelInfoIdHash?.substring(0, 16)}...`);
      console.log(`   Time: ${timeOfEarliestChange?.toISOString()}`);
      console.log(`   Data entries: ${data?.length || 0}`);
      
      eventReceived = true;
      eventData = { channelId, channelInfoIdHash, timeOfEarliestChange, dataCount: data?.length || 0 };
    });
    
    console.log('✅ Test listener registered');
    
    // Post a test message to trigger an event
    console.log('🚀 Posting test message to trigger channel event...');
    
    const topicModel = appModel.getTopicModel();
    if (!topicModel) {
      console.error('❌ No TopicModel available - cannot post test message');
      return false;
    }
    
    // Create a unique test topic/channel
    const testTopicId = `test-channel-events-${Date.now()}`;
    console.log(`📝 Creating test topic: ${testTopicId}`);
    
    // Post a test message
    await topicModel.postToTopic(testTopicId, {
      text: 'Test message for channel event verification',
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Test message posted');
    
    // Wait for event to fire
    console.log('⏳ Waiting 3 seconds for event to fire...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check results
    if (eventReceived) {
      console.log('🎉 SUCCESS: ChannelManager.onUpdated event fired correctly!');
      console.log('📊 Event data:', eventData);
      
      // Verify the event data makes sense
      if (eventData.channelId && eventData.channelInfoIdHash && eventData.timeOfEarliestChange) {
        console.log('✅ Event data is complete and valid');
      } else {
        console.log('⚠️ Event fired but data may be incomplete');
      }
      
      // Clean up
      if (typeof disconnect === 'function') {
        disconnect();
        console.log('🧹 Test listener disconnected');
      }
      
      return true;
    } else {
      console.log('❌ FAILURE: ChannelManager.onUpdated event did NOT fire');
      console.log('🔍 This confirms the event system is broken');
      
      // Check if channel was actually created
      try {
        const channels = await channelManager.channels();
        const testChannel = channels.find((ch: any) => ch.id === testTopicId);
        if (testChannel) {
          console.log('🔍 Test channel WAS created but event did not fire');
          console.log('🔍 This indicates the event emission is broken, not channel creation');
        } else {
          console.log('🔍 Test channel was NOT created');
          console.log('🔍 This indicates a deeper issue with channel creation');
        }
      } catch (channelsError) {
        console.log('🔍 Error checking channels:', channelsError);
      }
      
      // Clean up
      if (typeof disconnect === 'function') {
        disconnect();
        console.log('🧹 Test listener disconnected');
      }
      
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error testing ChannelManager events:', error);
    return false;
  }
}

// Make available globally for console debugging
(globalThis as any).testChannelManagerEvents = testChannelManagerEvents;

export default testChannelManagerEvents;