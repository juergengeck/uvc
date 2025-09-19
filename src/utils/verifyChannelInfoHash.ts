/**
 * Verify that ChannelInfo hashes are calculated correctly
 */

export async function verifyChannelInfoHash() {
    console.log('\n🔍 VERIFY CHANNEL INFO HASH CALCULATION');
    console.log('='.repeat(50));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }
        
        const myPersonId = await appModel.leuteModel.myMainIdentity();
        const channelManager = appModel.channelManager;
        
        // Get all channels
        const channels = await channelManager.channels();
        console.log(`\n📁 Found ${channels.length} channels`);
        
        // Check a 1-to-1 channel
        const oneToOneChannel = channels.find(ch => ch.id.includes('<->'));
        if (!oneToOneChannel) {
            console.log('❌ No 1-to-1 channel found');
            return;
        }
        
        console.log(`\n🎯 Checking channel: ${oneToOneChannel.id.substring(0, 50)}...`);
        console.log(`   Owner: ${oneToOneChannel.owner?.substring(0, 12) || 'null'}`);
        
        // Get the actual ChannelInfo object
        const channelInfo = await channelManager.getChannelInfo(oneToOneChannel.id, oneToOneChannel.owner);
        
        if (!channelInfo) {
            console.log('❌ Could not retrieve ChannelInfo object');
            return;
        }
        
        console.log('\n📋 ChannelInfo object properties:');
        console.log(`   $type$: ${channelInfo.$type$}`);
        console.log(`   id: ${channelInfo.id?.substring(0, 50) || 'undefined'}...`);
        console.log(`   owner: ${channelInfo.owner?.substring(0, 12) || 'undefined'}`);
        console.log(`   $idHash$: ${channelInfo.$idHash$?.substring(0, 12) || 'undefined'}...`);
        console.log(`   head: ${channelInfo.head?.substring(0, 12) || 'undefined'}...`);
        
        // Compare with calculated hash
        const { calculateIdHashOfObj } = await import('@refinio/one.core/lib/util/object.js');
        const calculatedHash = await calculateIdHashOfObj({
            $type$: 'ChannelInfo',
            id: oneToOneChannel.id,
            owner: oneToOneChannel.owner === null ? undefined : oneToOneChannel.owner
        });
        
        console.log('\n🔍 Hash comparison:');
        console.log(`   Actual $idHash$: ${channelInfo.$idHash$?.substring(0, 12) || 'N/A'}...`);
        console.log(`   Calculated hash: ${calculatedHash.substring(0, 12)}...`);
        
        if (channelInfo.$idHash$ === calculatedHash) {
            console.log('   ✅ Hashes match!');
        } else {
            console.log('   ❌ Hashes DO NOT match!');
            console.log('   This explains why access grants weren\'t working');
            console.log('   The actual ChannelInfo has additional properties (like head)');
        }
        
        console.log('\n💡 KEY INSIGHT:');
        console.log('ChannelInfo objects are versioned with a "head" property.');
        console.log('We must use the actual object from ChannelManager, not calculate our own hash.');
        
    } catch (error) {
        console.error('❌ Verification failed:', error);
    }
}

// Make it globally available
(globalThis as any).verifyChannelInfoHash = verifyChannelInfoHash;