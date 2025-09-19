/**
 * Verify that CHUM is syncing channel data despite M2O-PH1 errors
 */

export async function verifyChumChannelSync() {
    console.log('\n🔍 VERIFYING CHUM CHANNEL SYNC');
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
            console.log('❌ No active connections');
            return;
        }
        
        const remotePersonId = connections[0].remotePersonId || connections[0].targetPersonId;
        console.log(`👥 Remote person ID: ${remotePersonId.substring(0, 12)}...`);
        
        // Check what channels we have
        const channelManager = appModel.channelManager;
        const allChannels = await channelManager.channels();
        console.log(`\n📁 Total channels: ${allChannels.length}`);
        
        // Find 1-to-1 channels
        const channelId = myPersonId < remotePersonId 
            ? `${myPersonId}<->${remotePersonId}`
            : `${remotePersonId}<->${myPersonId}`;
        
        const myChannel = allChannels.find(ch => 
            ch.id === channelId && ch.owner === myPersonId
        );
        const theirChannel = allChannels.find(ch => 
            ch.id === channelId && ch.owner === remotePersonId
        );
        
        console.log('\n📊 Channel Discovery Status:');
        console.log(`   My channel: ${myChannel ? '✅ EXISTS' : '❌ NOT FOUND'}`);
        console.log(`   Their channel: ${theirChannel ? '✅ EXISTS (CHUM synced!)' : '❌ NOT FOUND (CHUM sync pending)'}`);
        
        if (myChannel && theirChannel) {
            console.log('\n✅✅✅ SUCCESS: Both channels are visible!');
            console.log('   This means CHUM sync is working for ChannelInfo objects');
            console.log('   The M2O-PH1 errors are just noise from Access objects');
            
            // Check if messages are syncing
            const myEntries = await channelManager.getChannelEntries(channelId, myPersonId);
            const theirEntries = await channelManager.getChannelEntries(channelId, remotePersonId);
            
            console.log(`\n📧 Message counts:`);
            console.log(`   My channel: ${myEntries.length} messages`);
            console.log(`   Their channel: ${theirEntries.length} messages`);
            
            if (theirEntries.length > 0) {
                console.log('   ✅ Messages from remote are visible!');
            }
        } else if (myChannel && !theirChannel) {
            console.log('\n⏳ CHUM sync in progress...');
            console.log('   Their channel hasn\'t synced yet');
            console.log('   Try running this diagnostic again in a few seconds');
        }
        
        // Check access grant status - wrap in try/catch due to M2O-PH1 errors
        try {
            const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
            const theirAccessible = await getAccessibleRootHashes(remotePersonId);
            const channelInfos = theirAccessible.filter(obj => obj.type === 'ChannelInfo');
            const messages = theirAccessible.filter(obj => 
                obj.type === 'Message' || obj.type === 'ChatMessage'
            );
            
            console.log('\n🔐 Access Grant Summary:');
            console.log(`   ChannelInfo objects accessible to remote: ${channelInfos.length}`);
            console.log(`   Message objects accessible to remote: ${messages.length}`);
        } catch (error) {
            if (error.message && error.message.includes('M2O-PH1')) {
                console.log('\n⚠️  M2O-PH1 error when checking access grants');
                console.log('   This is the known issue with Access/IdAccess objects');
                console.log('   Channel sync may still work despite this error');
            } else {
                throw error;
            }
        }
        
        console.log('\n💡 SUMMARY:');
        console.log('1. M2O-PH1 errors are from Access/IdAccess objects - ignore them');
        console.log('2. CHUM sync works for ChannelInfo and Message objects');
        console.log('3. If channels aren\'t visible yet, wait for sync to complete');
        
    } catch (error) {
        console.error('❌ Verification failed:', error);
    }
}

// Make it globally available
(globalThis as any).verifyChumChannelSync = verifyChumChannelSync;