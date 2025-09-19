/**
 * Debug the structure of ChannelInfo objects to understand versioning
 */

export async function debugChannelInfoStructure() {
    console.log('\n🔍 DEBUG CHANNEL INFO STRUCTURE');
    console.log('='.repeat(50));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }
        
        const myPersonId = await appModel.leuteModel.myMainIdentity();
        const channelManager = appModel.channelManager;
        
        // Get a 1-to-1 channel
        const channels = await channelManager.channels();
        const oneToOneChannel = channels.find(ch => ch.id.includes('<->'));
        
        if (!oneToOneChannel) {
            console.log('❌ No 1-to-1 channel found');
            return;
        }
        
        console.log(`\n🎯 Examining channel: ${oneToOneChannel.id.substring(0, 50)}...`);
        
        // Get the ChannelInfo object
        const channelInfo = await channelManager.getChannelInfo(oneToOneChannel.id, oneToOneChannel.owner);
        
        if (!channelInfo) {
            console.log('❌ ChannelInfo not found');
            return;
        }
        
        console.log('\n📋 ChannelInfo structure:');
        console.log(JSON.stringify(channelInfo, null, 2));
        
        // Check what happens when we calculate the idHash
        const { calculateIdHashOfObj } = await import('@refinio/one.core/lib/util/object.js');
        
        // Try different object structures
        console.log('\n🔬 Testing idHash calculations:');
        
        // 1. Basic structure (what we were doing)
        const basic = {
            $type$: 'ChannelInfo',
            id: oneToOneChannel.id,
            owner: oneToOneChannel.owner === null ? undefined : oneToOneChannel.owner
        };
        const basicHash = await calculateIdHashOfObj(basic);
        console.log(`\n1. Basic structure hash: ${basicHash.substring(0, 12)}...`);
        console.log('   Structure:', JSON.stringify(basic, null, 2));
        
        // 2. With head (if it exists)
        if (channelInfo.head) {
            const withHead = {
                ...basic,
                head: channelInfo.head
            };
            const withHeadHash = await calculateIdHashOfObj(withHead);
            console.log(`\n2. With head hash: ${withHeadHash.substring(0, 12)}...`);
            console.log('   Structure:', JSON.stringify(withHead, null, 2));
        }
        
        // 3. The actual object (minus computed properties)
        const actualClean = {
            $type$: channelInfo.$type$,
            id: channelInfo.id,
            owner: channelInfo.owner
        };
        const actualHash = await calculateIdHashOfObj(actualClean);
        console.log(`\n3. Actual (clean) hash: ${actualHash.substring(0, 12)}...`);
        console.log('   Structure:', JSON.stringify(actualClean, null, 2));
        
        console.log('\n📊 Comparison:');
        console.log(`   ChannelInfo.$idHash$: ${channelInfo.$idHash$?.substring(0, 12) || 'N/A'}...`);
        console.log(`   Basic calculated:     ${basicHash.substring(0, 12)}...`);
        console.log(`   Match? ${channelInfo.$idHash$ === basicHash ? '✅ YES' : '❌ NO'}`);
        
        console.log('\n💡 UNDERSTANDING:');
        console.log('- idHash identifies the object across ALL versions');
        console.log('- head points to the latest version');
        console.log('- Access grants use idHash to grant access to all versions');
        console.log('- CHUM syncs based on the head pointer');
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    }
}

// Make it globally available
(globalThis as any).debugChannelInfoStructure = debugChannelInfoStructure;