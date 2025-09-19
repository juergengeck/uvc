/**
 * Simple CHUM Diagnostics - No complex imports, designed for React Native console
 */

export function createSimpleChumDiagnostics() {
  return {
    async runBasicDiagnostics() {
      console.log('\n🔬 SIMPLE CHUM DIAGNOSTICS');
      console.log('='.repeat(50));
      
      try {
        // Get AppModel from global scope
        const appModel = (window as any).appModel || (global as any).appModel;
        if (!appModel) {
          console.log('❌ AppModel not available in global scope');
          return;
        }
        
        console.log('✅ AppModel found');
        
        // 1. Device Info
        console.log('\n1️⃣ DEVICE INFO');
        try {
          const personId = await appModel.leuteModel.myMainIdentity();
          console.log(`   👤 My Person ID: ${personId?.substring(0, 12)}...`);
        } catch (error) {
          console.log(`   ❌ Error getting person ID: ${error}`);
        }
        
        // 2. Connection Status
        console.log('\n2️⃣ CONNECTION STATUS');
        try {
          const transportManager = appModel.transportManager;
          if (transportManager && transportManager.getActiveConnections) {
            const connections = await transportManager.getActiveConnections();
            console.log(`   🌐 Active connections: ${connections.length}`);
            
            connections.forEach((conn: any, i: number) => {
              const remoteId = conn.remotePersonId || conn.targetPersonId || 'unknown';
              console.log(`   Connection ${i + 1}: ${remoteId?.substring(0, 12)}...`);
            });
          } else {
            console.log('   ❌ TransportManager.getActiveConnections not available');
          }
        } catch (error) {
          console.log(`   ❌ Error checking connections: ${error}`);
        }
        
        // 3. Channel Info
        console.log('\n3️⃣ CHANNEL INFO');
        try {
          const channelManager = appModel.channelManager;
          if (channelManager && channelManager.channels) {
            const channels = await channelManager.channels();
            console.log(`   📊 Total channels: ${channels.length}`);
            
            const chatChannels = channels.filter((ch: any) => ch.id && ch.id.includes('<->'));
            console.log(`   💬 Chat channels: ${chatChannels.length}`);
            
            chatChannels.forEach((ch: any, i: number) => {
              console.log(`   Chat ${i + 1}: ${ch.id?.substring(0, 32)}...`);
            });
          } else {
            console.log('   ❌ ChannelManager.channels not available');
          }
        } catch (error) {
          console.log(`   ❌ Error checking channels: ${error}`);
        }
        
        // 4. CRITICAL: AccessManager Test  
        console.log('\n4️⃣ CRITICAL ACCESS MANAGER TEST');
        try {
          // This is the key test - can we access the core function directly?
          console.log('   🔍 Testing direct access to ONE core functions...');
          
          // Try to access the function through the global require system
          console.log('   📦 Checking if ONE core modules are accessible...');
          
          // Test if we can access AppModel's internal modules
          if (appModel.leuteModel && appModel.leuteModel.instance) {
            console.log('   ✅ LeuteModel instance available');
            
            // Try to get trusted persons to test with
            const instance = appModel.leuteModel.instance;
            console.log(`   🔍 Instance ID: ${instance.toString().substring(0, 12)}...`);
          }
          
        } catch (error) {
          console.log(`   ❌ Error in AccessManager test: ${error}`);
        }
        
        console.log('\n✅ Basic diagnostics complete');
        console.log('\n📝 NEXT STEPS:');
        console.log('   1. Verify active connections exist');
        console.log('   2. Check chat channels are created');
        console.log('   3. Manual test of access grants needed');
        
      } catch (error) {
        console.log(`❌ Diagnostics failed: ${error}`);
      }
    },
    
    // Helper to manually test access grants
    async testAccessGrants() {
      console.log('\n🔬 MANUAL ACCESS GRANT TEST');
      console.log('='.repeat(40));
      
      try {
        const appModel = (window as any).appModel || (global as any).appModel;
        if (!appModel) {
          console.log('❌ AppModel not available');
          return;
        }
        
        // Get connections to test access grants
        const transportManager = appModel.transportManager;
        if (!transportManager || !transportManager.getActiveConnections) {
          console.log('❌ Cannot access connections for testing');
          return;
        }
        
        const connections = await transportManager.getActiveConnections();
        if (connections.length === 0) {
          console.log('❌ No active connections to test with');
          return;
        }
        
        console.log(`📊 Testing with ${connections.length} connections`);
        
        // For each connection, show what we can determine
        for (let i = 0; i < connections.length; i++) {
          const conn = connections[i];
          const remotePersonId = conn.remotePersonId || conn.targetPersonId;
          
          console.log(`\n   Connection ${i + 1}:`);
          console.log(`   👤 Remote Person: ${remotePersonId?.substring(0, 12)}...`);
          console.log(`   🔗 Connection Type: ${conn.constructor?.name || 'unknown'}`);
          console.log(`   📡 Status: ${conn.isConnected ? 'Connected' : 'Disconnected'}`);
        }
        
      } catch (error) {
        console.log(`❌ Access grant test failed: ${error}`);
      }
    }
  };
}

// Make it available globally
(globalThis as any).simpleChumDiagnostics = createSimpleChumDiagnostics();