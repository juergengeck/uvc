/**
 * Debug ChannelManager instance flow to understand listener registration issues
 */

export function debugChannelManagerFlow() {
  console.log('\n🔍 DEBUGGING CHANNELMANAGER INSTANCE FLOW');
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
    
    // 1. Check current state
    const currentListeners = Object.keys(channelManager.onUpdated._listeners || {}).length;
    console.log(`📊 Current listeners: ${currentListeners}`);
    
    // 2. Patch the onUpdated.listen method to track registrations
    console.log('\n🔧 Installing listener tracking...');
    
    const originalListen = channelManager.onUpdated.listen;
    let listenerCount = 0;
    
    channelManager.onUpdated.listen = function(callback: any) {
      listenerCount++;
      console.log(`📝 LISTENER REGISTERED #${listenerCount}`);
      
      // Try to identify the caller
      const stack = new Error().stack;
      if (stack) {
        const lines = stack.split('\n');
        for (let i = 2; i < Math.min(6, lines.length); i++) {
          const line = lines[i].trim();
          if (line.includes('LeuteAccessRightsManager')) {
            console.log(`   🎯 LeuteAccessRightsManager listener detected!`);
          } else if (line.includes('ChatModel')) {
            console.log(`   💬 ChatModel listener detected!`);
          } else if (line.includes('auto') || line.includes('diagnostics')) {
            console.log(`   🔬 Auto diagnostics listener detected!`);
          }
          console.log(`   📍 ${line}`);
        }
      }
      
      const result = originalListen.call(this, callback);
      
      const newListenerCount = Object.keys(channelManager.onUpdated._listeners || {}).length;
      console.log(`   ✅ Listener registered successfully. Total: ${newListenerCount}`);
      
      return result;
    };
    
    // 3. Patch the onUpdated.emit method to track emissions
    const originalEmit = channelManager.onUpdated.emit;
    let emitCount = 0;
    
    channelManager.onUpdated.emit = function(...args: any[]) {
      emitCount++;
      console.log(`🔔 EVENT EMITTED #${emitCount}`);
      console.log(`   Args: ${args.length} arguments`);
      if (args[1]) {
        console.log(`   Channel: ${args[1].substring(0, 32)}...`);
      }
      
      const listenersBefore = Object.keys(channelManager.onUpdated._listeners || {}).length;
      console.log(`   📊 Listeners before emit: ${listenersBefore}`);
      
      const result = originalEmit.apply(this, args);
      
      console.log(`   ✅ Event emission completed`);
      return result;
    };
    
    console.log('✅ Listener tracking installed');
    console.log('\n🎯 Now watch for listener registrations and event emissions');
    console.log('💡 Try posting a message to see the flow');
    
    // 4. Test immediate listener registration
    console.log('\n🧪 Testing immediate listener registration...');
    
    let testEventReceived = false;
    const testDisconnect = channelManager.onUpdated.listen(() => {
      testEventReceived = true;
      console.log('🎉 Test listener received event!');
    });
    
    console.log(`📊 Listeners after test registration: ${Object.keys(channelManager.onUpdated._listeners || {}).length}`);
    
    // Clean up test listener
    setTimeout(() => {
      if (typeof testDisconnect === 'function') {
        testDisconnect();
      }
      console.log('🧹 Test listener cleaned up');
    }, 5000);
    
  } catch (error) {
    console.error('❌ Error debugging ChannelManager flow:', error);
  }
}

// Make available globally
(globalThis as any).debugChannelManagerFlow = debugChannelManagerFlow;

export default debugChannelManagerFlow;