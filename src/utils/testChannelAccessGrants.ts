/**
 * Test if channel access grants are being created properly
 */

export async function testChannelAccessGrants() {
    console.log('\n🧪 TESTING CHANNEL ACCESS GRANTS');
    console.log('='.repeat(50));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }
        
        const myPersonId = await appModel.leuteModel.myMainIdentity();
        console.log(`👤 My person ID: ${myPersonId.substring(0, 12)}...`);
        
        // Get active connections
        const connections = await appModel.transportManager.getActiveConnections();
        if (connections.length === 0) {
            console.log('❌ No active connections to test with');
            return;
        }
        
        const remotePersonId = connections[0].remotePersonId || connections[0].targetPersonId;
        console.log(`👥 Remote person ID: ${remotePersonId.substring(0, 12)}...`);
        
        // Construct the expected channel ID
        const channelId = myPersonId < remotePersonId 
            ? `${myPersonId}<->${remotePersonId}`
            : `${remotePersonId}<->${myPersonId}`;
        
        console.log(`\n📁 Testing channel: ${channelId.substring(0, 50)}...`);
        
        // Check current state
        const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
        const beforeCount = (await getAccessibleRootHashes(remotePersonId)).length;
        console.log(`📊 Remote has access to ${beforeCount} objects before test`);
        
        // Create a test channel
        console.log('\n🔨 Creating test channel...');
        await appModel.channelManager.createChannel(channelId, myPersonId);
        
        // Manually trigger access grant creation
        console.log('🔐 Manually granting access...');
        await appModel.leuteAccessRightsManager.grantAccessFor1to1Channel(channelId, myPersonId);
        
        // Check after
        const afterCount = (await getAccessibleRootHashes(remotePersonId)).length;
        console.log(`\n📊 Remote has access to ${afterCount} objects after test`);
        
        if (afterCount > beforeCount) {
            console.log(`✅ SUCCESS: ${afterCount - beforeCount} new objects became accessible!`);
            
            // Check if we can see their channel
            const channels = await appModel.channelManager.channels();
            const theirChannel = channels.find(ch => 
                ch.id === channelId && 
                ch.owner === remotePersonId
            );
            
            if (theirChannel) {
                console.log(`✅ I can see their channel - bidirectional sync working!`);
            } else {
                console.log(`❌ I cannot see their channel yet - may need time to sync`);
            }
        } else {
            console.log('❌ FAILED: No new objects became accessible');
            console.log('   This suggests the access grant creation is not working');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Make it globally available
(globalThis as any).testChannelAccessGrants = testChannelAccessGrants;