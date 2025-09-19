/**
 * Debug channel access rights
 */

export async function debugChannelAccess() {
    console.log('\n🔍 CHANNEL ACCESS DEBUG');
    console.log('='.repeat(50));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }
        
        const myPersonId = await appModel.leuteModel.myMainIdentity();
        console.log(`👤 My person ID: ${myPersonId.substring(0, 12)}...`);
        
        // Check what channels I have
        const channelManager = appModel.channelManager;
        const allChannels = await channelManager.channels();
        console.log(`\n📁 Total channels: ${allChannels.length}`);
        
        // Find 1-to-1 channels
        const oneToOneChannels = allChannels.filter(ch => ch.id.includes('<->'));
        console.log(`💬 1-to-1 channels: ${oneToOneChannels.length}`);
        
        for (const channel of oneToOneChannels) {
            console.log(`\n📌 Channel: ${channel.id}`);
            console.log(`   Owner: ${channel.owner || 'undefined'}`);
            
            // Extract participants
            const participants = channel.id.split('<->');
            const otherPersonId = participants.find(id => id !== myPersonId);
            
            if (otherPersonId) {
                console.log(`   Other person: ${otherPersonId.substring(0, 12)}...`);
                
                // Check if the other person has access to this channel
                const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
                const theirAccessible = await getAccessibleRootHashes(otherPersonId);
                
                // Check if ChannelInfo is accessible
                const channelInfo = await channelManager.getChannelInfo(channel.id, channel.owner);
                if (channelInfo && channelInfo.$idHash$) {
                    const hasAccess = theirAccessible.some(obj => obj.hash === channelInfo.$idHash$);
                    if (hasAccess) {
                        console.log(`   ✅ Other person CAN access this ChannelInfo`);
                    } else {
                        console.log(`   ❌ Other person CANNOT access this ChannelInfo!`);
                        console.log(`   ⚠️  This is why the channel doesn't sync!`);
                    }
                }
                
                // Check channel entries
                const entries = await channelManager.getChannelEntries(channel.id, channel.owner);
                console.log(`   📧 Channel has ${entries.length} entries`);
                
                if (entries.length > 0) {
                    let accessibleCount = 0;
                    for (const entry of entries) {
                        if (entry.dataHash && theirAccessible.some(obj => obj.hash === entry.dataHash)) {
                            accessibleCount++;
                        }
                    }
                    console.log(`   📊 Other person can access ${accessibleCount}/${entries.length} messages`);
                }
            }
        }
        
        // Now check the reverse - what channels THEY have that I should see
        const connections = await appModel.transportManager.getActiveConnections();
        if (connections.length > 0) {
            const remotePersonId = connections[0].remotePersonId || connections[0].targetPersonId;
            console.log(`\n🔄 Checking what I can access from: ${remotePersonId.substring(0, 12)}...`);
            
            const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
            const myAccessible = await getAccessibleRootHashes(myPersonId);
            
            // Count ChannelInfo objects I can access
            const channelInfos = myAccessible.filter(obj => obj.type === 'ChannelInfo');
            console.log(`📊 I can access ${channelInfos.length} ChannelInfo objects total`);
            
            // The key question: can I see THEIR channel for our 1-to-1 chat?
            const expectedChannelId = myPersonId < remotePersonId 
                ? `${myPersonId}<->${remotePersonId}`
                : `${remotePersonId}<->${myPersonId}`;
            
            console.log(`\n🎯 Looking for their channel: ${expectedChannelId} owned by ${remotePersonId.substring(0, 12)}...`);
            
            // This is the critical check
            const theirChannels = allChannels.filter(ch => 
                ch.id === expectedChannelId && 
                ch.owner === remotePersonId
            );
            
            if (theirChannels.length > 0) {
                console.log(`✅ I CAN see their channel - CHUM sync worked for ChannelInfo`);
            } else {
                console.log(`❌ I CANNOT see their channel - CHUM sync failed for ChannelInfo`);
                console.log(`⚠️  This is why messages don't transfer!`);
            }
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    }
}

// Make it globally available
(globalThis as any).debugChannelAccess = debugChannelAccess;