/**
 * Test if LeuteAccessRightsManager listener is actually registered
 * This will help us understand why access grants aren't being created
 */

export function testLeuteAccessListener() {
  console.log('\n🔍 TESTING LEUTE ACCESS RIGHTS MANAGER LISTENER');
  console.log('='.repeat(60));
  
  try {
    // Get AppModel from global
    const appModel = (globalThis as any).appModel || (window as any).appModel;
    
    if (!appModel) {
      console.error('❌ No AppModel available');
      return;
    }
    
    const channelManager = appModel.channelManager;
    if (!channelManager) {
      console.error('❌ No ChannelManager available');
      return;
    }
    
    console.log('✅ Got ChannelManager instance');
    
    // Check all listeners on onUpdated
    const listeners = channelManager.onUpdated._listeners || {};
    const listenerKeys = Object.keys(listeners);
    console.log(`🔍 Total onUpdated listeners: ${listenerKeys.length}`);
    
    // Try to identify each listener
    for (let i = 0; i < listenerKeys.length; i++) {
      const key = listenerKeys[i];
      const listener = listeners[key];
      console.log(`📝 Listener ${i + 1}: ${key}`);
      console.log(`   Type: ${typeof listener}`);
      
      if (typeof listener === 'function') {
        // Try to detect if this is the LeuteAccessRightsManager listener
        const funcStr = listener.toString();
        if (funcStr.includes('LeuteAccessRightsManager') || 
            funcStr.includes('Auto-creating access grants') ||
            funcStr.includes('createAccess')) {
          console.log('   🎯 This appears to be the LeuteAccessRightsManager listener');
        } else if (funcStr.includes('ChatModel') || funcStr.includes('refreshMessages')) {
          console.log('   💬 This appears to be a ChatModel listener');
        } else if (funcStr.includes('diagnostics') || funcStr.includes('AUTO MESSAGE')) {
          console.log('   🔬 This appears to be an auto diagnostics listener');
        } else {
          console.log('   ❓ Unknown listener type');
        }
        
        // Show first 100 chars of function for identification
        const preview = funcStr.substring(0, 100).replace(/\s+/g, ' ');
        console.log(`   Preview: ${preview}...`);
      }
    }
    
    // Test by manually calling a fake event
    console.log('\n🧪 Testing manual event trigger...');
    
    let leuteListenerCalled = false;
    let otherListenersCalled = 0;
    
    // Temporarily wrap each listener to see which ones get called
    const originalListeners: { [key: string]: Function } = {};
    
    for (const key of listenerKeys) {
      const originalListener = listeners[key];
      originalListeners[key] = originalListener;
      
      listeners[key] = function(...args: any[]) {
        console.log(`🔔 Listener ${key} called with ${args.length} arguments`);
        
        const funcStr = originalListener.toString();
        if (funcStr.includes('LeuteAccessRightsManager') || 
            funcStr.includes('Auto-creating access grants')) {
          console.log('   🎯 LeuteAccessRightsManager listener triggered!');
          leuteListenerCalled = true;
        } else {
          otherListenersCalled++;
        }
        
        // Call the original listener
        return originalListener.apply(this, args);
      };
    }
    
    // Trigger a fake event
    console.log('🚀 Triggering fake onUpdated event...');
    
    const fakeChannelInfoIdHash = 'test_channel_info_hash_12345';
    const fakeChannelId = 'test_channel_id<->test_channel_id';
    const fakeChannelOwner = null;
    const fakeTime = new Date();
    const fakeData = [{ $type$: 'ChatMessage', text: 'test message' }];
    
    try {
      channelManager.onUpdated.emit(
        fakeChannelInfoIdHash,
        fakeChannelId, 
        fakeChannelOwner,
        fakeTime,
        fakeData
      );
      
      // Wait a moment for async listeners
      setTimeout(() => {
        console.log('\n📊 RESULTS:');
        console.log(`🎯 LeuteAccessRightsManager listener called: ${leuteListenerCalled ? '✅ YES' : '❌ NO'}`);
        console.log(`📝 Other listeners called: ${otherListenersCalled}`);
        
        if (!leuteListenerCalled) {
          console.log('🚨 CRITICAL: LeuteAccessRightsManager listener is NOT responding to events!');
          console.log('🔧 This explains why access grants are not being created');
          console.log('🔧 The listener is either not registered or has an error preventing execution');
        } else {
          console.log('✅ LeuteAccessRightsManager listener is working');
          console.log('🔍 If access grants still aren\'t created, the issue is inside the listener logic');
        }
        
        // Restore original listeners
        for (const key of listenerKeys) {
          listeners[key] = originalListeners[key];
        }
        
        console.log('🧹 Test complete, original listeners restored');
      }, 1000);
      
    } catch (emitError) {
      console.error('❌ Error triggering fake event:', emitError);
    }
    
  } catch (error) {
    console.error('❌ Error testing LeuteAccessRightsManager listener:', error);
  }
}

// Make available globally
(globalThis as any).testLeuteAccessListener = testLeuteAccessListener;

export default testLeuteAccessListener;