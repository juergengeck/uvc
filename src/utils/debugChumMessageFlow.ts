/**
 * Debug CHUM message flow - trace how messages should sync between devices
 */

export async function debugChumMessageFlow() {
    console.log('\n🔍 DEBUG CHUM MESSAGE FLOW - END-TO-END TRACE');
    console.log('='.repeat(80));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }

        // 1. Check if we have channels with messages
        console.log('\n1️⃣ LOCAL CHANNELS AND MESSAGES:');
        const channelManager = appModel.channelManager;
        if (!channelManager) {
            console.log('❌ ChannelManager not available');
            return;
        }

        // Get all channels
        const channels = await channelManager.getChannels();
        console.log(`   Total channels: ${channels.length}`);

        let totalMessages = 0;
        let channelsWithMessages = [];

        for (const channel of channels) {
            try {
                // Get channel info
                const channelInfo = await channelManager.getChannel(channel.id, channel.owner);
                if (channelInfo) {
                    // Count entries
                    const entryCount = channelInfo.entryCount || 0;
                    if (entryCount > 0) {
                        channelsWithMessages.push({
                            id: channel.id,
                            owner: channel.owner,
                            entryCount
                        });
                        totalMessages += entryCount;
                        console.log(`   ✅ Channel "${channel.id}" has ${entryCount} entries`);
                    }
                }
            } catch (e) {
                // Skip channels we can't read
            }
        }

        console.log(`   Total messages across all channels: ${totalMessages}`);

        // 2. Check access rights for these channels
        console.log('\n2️⃣ ACCESS RIGHTS FOR CHANNELS WITH MESSAGES:');
        
        for (const channel of channelsWithMessages) {
            console.log(`\n   Channel: ${channel.id}`);
            
            // Get channel ID hash
            const { calculateIdHashOfObj } = await import('@refinio/one.core/lib/util/object.js');
            const channelIdHash = await calculateIdHashOfObj({
                $type$: 'ChannelInfo',
                id: channel.id,
                owner: channel.owner === null ? undefined : channel.owner
            });

            console.log(`   Channel ID Hash: ${channelIdHash.substring(0, 16)}...`);

            // Check who has access to this channel
            try {
                const { getAccess } = await import('@refinio/one.core/lib/access.js');
                const accessInfo = await getAccess(channelIdHash);
                
                if (accessInfo) {
                    console.log(`   ✅ Access granted to:`);
                    if (accessInfo.person && accessInfo.person.length > 0) {
                        console.log(`      Persons: ${accessInfo.person.map(p => p.substring(0, 16) + '...').join(', ')}`);
                    }
                    if (accessInfo.group && accessInfo.group.length > 0) {
                        console.log(`      Groups: ${accessInfo.group.map(g => g.substring(0, 16) + '...').join(', ')}`);
                    }
                } else {
                    console.log('   ❌ No access rights found for this channel');
                }
            } catch (e) {
                console.log('   ❌ Could not check access rights:', e.message);
            }
        }

        // 3. Check CHUM protocol status
        console.log('\n3️⃣ CHUM PROTOCOL STATUS:');
        const connectionsModel = appModel.transportManager?.getConnectionsModel();
        const connections = connectionsModel?.connectionsInfo() || [];
        
        console.log(`   Active connections: ${connections.length}`);
        
        for (const conn of connections) {
            if (conn.connectionStatus === 'connected') {
                console.log(`\n   📡 Connection to ${conn.remotePersonId?.substring(0, 16)}...`);
                console.log(`      Protocol: ${conn.protocol}`);
                console.log(`      Status: ${conn.connectionStatus}`);
                
                // Check if this person should have access to any channels
                let hasAccess = false;
                for (const channel of channelsWithMessages) {
                    const channelIdHash = await calculateIdHashOfObj({
                        $type$: 'ChannelInfo',
                        id: channel.id,
                        owner: channel.owner === null ? undefined : channel.owner
                    });
                    
                    try {
                        const { getAccess } = await import('@refinio/one.core/lib/access.js');
                        const accessInfo = await getAccess(channelIdHash);
                        
                        if (accessInfo?.person?.includes(conn.remotePersonId)) {
                            hasAccess = true;
                            console.log(`      ✅ Has access to channel: ${channel.id}`);
                        }
                    } catch (e) {
                        // Silent fail
                    }
                }
                
                if (!hasAccess) {
                    console.log('      ❌ No access to any channels with messages');
                }
            }
        }

        // 4. Try to manually check CHUM sync state
        console.log('\n4️⃣ MANUAL CHUM SYNC CHECK:');
        
        // Get first channel with messages
        if (channelsWithMessages.length > 0) {
            const testChannel = channelsWithMessages[0];
            console.log(`   Testing with channel: ${testChannel.id}`);
            
            // Get a message from this channel
            try {
                const entries = await channelManager.getObjects(testChannel.id, testChannel.owner, 0, 1);
                if (entries && entries.length > 0) {
                    const firstEntry = entries[0];
                    console.log(`   ✅ Found message with hash: ${firstEntry.dataHash?.substring(0, 16)}...`);
                    
                    // Check if this object should be synced
                    const { getAccess } = await import('@refinio/one.core/lib/access.js');
                    const msgAccess = await getAccess(firstEntry.dataHash);
                    
                    if (msgAccess) {
                        console.log('   ✅ Message has access rights');
                        console.log(`      Should sync to: ${msgAccess.person?.length || 0} persons, ${msgAccess.group?.length || 0} groups`);
                    } else {
                        console.log('   ❌ Message has NO access rights - will not sync!');
                    }
                }
            } catch (e) {
                console.log('   ❌ Could not get message from channel:', e.message);
            }
        }

        // 5. Recommendations
        console.log('\n5️⃣ DIAGNOSTIC SUMMARY:');
        console.log('   Issues found:');
        
        if (totalMessages === 0) {
            console.log('   ❌ No messages found in any channels');
        }
        
        const chumConnections = connections.filter(c => c.protocol === 'chum' && c.connectionStatus === 'connected');
        if (chumConnections.length === 0) {
            console.log('   ❌ No active CHUM connections');
            console.log('   💡 Fix: Ensure connectToInstance is called with "chum" protocol');
        }
        
        console.log('\n   To fix CHUM sync:');
        console.log('   1. Ensure access rights are created for channel AND all message objects');
        console.log('   2. Ensure CHUM protocol connections are established (not just WebSocket)');
        console.log('   3. Call leuteModule.updateCache() after creating access rights');
        console.log('   4. Verify ObjectEventDispatcher is initialized and firing events');
        
    } catch (error) {
        console.error('\n❌ Debug failed:', error);
    }
}

// Make it globally available
(globalThis as any).debugChumMessageFlow = debugChumMessageFlow;