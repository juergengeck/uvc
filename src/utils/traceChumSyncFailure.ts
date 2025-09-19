/**
 * Trace why CHUM sync events fire but messages don't appear on the other device
 */

export async function traceChumSyncFailure() {
    console.log('\n🔍 TRACE CHUM SYNC FAILURE - Why events fire but messages don\'t sync');
    console.log('='.repeat(80));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }

        // 1. Check what messages we have locally
        console.log('\n1️⃣ LOCAL MESSAGES CHECK:');
        const chatModel = appModel.chatModel;
        if (chatModel && chatModel.currentTopicId) {
            const messages = chatModel.getMessages();
            console.log(`   Current topic: ${chatModel.currentTopicId}`);
            console.log(`   Local messages: ${messages.length}`);
            
            messages.forEach((msg, idx) => {
                console.log(`   Message ${idx + 1}: "${msg.text}" (hash: ${msg.hash?.substring(0, 8)}..., time: ${new Date(msg.timestamp).toLocaleTimeString()})`);
            });
        } else {
            console.log('   ❌ No current topic or chat model');
        }

        // 2. Check channel entries directly
        console.log('\n2️⃣ CHANNEL ENTRIES CHECK:');
        const channelManager = appModel.channelManager;
        if (channelManager && chatModel?.currentTopicId) {
            const topicId = chatModel.currentTopicId;
            
            // Get all channel infos for this topic
            const channelInfos = await channelManager.getMatchingChannelInfos({channelId: topicId});
            console.log(`   Found ${channelInfos.length} channel(s) for topic`);
            
            for (const [idx, channelInfo] of channelInfos.entries()) {
                console.log(`\n   📁 Channel ${idx + 1}:`);
                console.log(`      Owner: ${channelInfo.owner?.substring(0, 16)}...`);
                console.log(`      Entry count: ${channelInfo.entryCount || 0}`);
                console.log(`      Head: ${channelInfo.head?.substring(0, 8)}...`);
                
                // Get actual entries
                try {
                    const entries = await channelManager.getObjects(topicId, channelInfo.owner, 0, 20);
                    console.log(`      Actual entries retrieved: ${entries.length}`);
                    
                    entries.forEach((entry, entryIdx) => {
                        console.log(`         Entry ${entryIdx + 1}: data=${entry.dataHash?.substring(0, 8)}..., time=${new Date(entry.creationTime).toLocaleTimeString()}`);
                    });
                } catch (e) {
                    console.log(`      ❌ Failed to get entries: ${e.message}`);
                }
            }
        }

        // 3. Check access rights for messages
        console.log('\n3️⃣ ACCESS RIGHTS CHECK:');
        if (chatModel && chatModel.currentTopicId) {
            const messages = chatModel.getMessages();
            const contacts = await appModel.leuteModel.others();
            
            if (contacts.length > 0) {
                const otherPersonId = await contacts[0].mainIdentity();
                console.log(`   Checking access for other person: ${otherPersonId.toString().substring(0, 16)}...`);
                
                for (const [idx, msg] of messages.slice(-3).entries()) { // Check last 3 messages
                    console.log(`\n   📝 Message ${idx + 1}: "${msg.text}"`);
                    
                    if (msg.hash) {
                        try {
                            const { getAccess } = await import('@refinio/one.core/lib/access.js');
                            const access = await getAccess(msg.hash);
                            
                            if (access) {
                                const hasPersonAccess = access.person?.includes(otherPersonId);
                                const groupCount = access.group?.length || 0;
                                
                                console.log(`      Access granted to: ${access.person?.length || 0} persons, ${groupCount} groups`);
                                console.log(`      Other person has access: ${hasPersonAccess ? '✅' : '❌'}`);
                                
                                if (!hasPersonAccess) {
                                    console.log(`      🚨 PROBLEM: Message not accessible to other person!`);
                                }
                            } else {
                                console.log(`      ❌ NO ACCESS RIGHTS FOUND - Message will not sync!`);
                            }
                        } catch (e) {
                            console.log(`      ❌ Failed to check access: ${e.message}`);
                        }
                    }
                }
            }
        }

        // 4. Check CHUM connections
        console.log('\n4️⃣ CHUM CONNECTIONS CHECK:');
        const connectionsModel = appModel.transportManager?.getConnectionsModel();
        if (connectionsModel) {
            const connections = connectionsModel.connectionsInfo();
            console.log(`   Total connections: ${connections.length}`);
            
            const chumConnections = connections.filter(c => c.protocol === 'chum');
            console.log(`   CHUM connections: ${chumConnections.length}`);
            
            chumConnections.forEach((conn, idx) => {
                console.log(`   CHUM ${idx + 1}: ${conn.remotePersonId?.substring(0, 16)}... - ${conn.connectionStatus}`);
            });
            
            if (chumConnections.length === 0) {
                console.log('   🚨 PROBLEM: No CHUM connections found!');
                console.log('   💡 Messages may not sync without CHUM protocol connections');
            }
        }

        // 5. Check if sync is actually happening
        console.log('\n5️⃣ SYNC STATUS CHECK:');
        const leuteModule = connectionsModel?.leuteConnectionsModule;
        if (leuteModule) {
            // Try to trigger sync manually
            if (typeof leuteModule.updateCache === 'function') {
                console.log('   🔄 Triggering manual sync...');
                try {
                    await leuteModule.updateCache();
                    console.log('   ✅ Manual sync completed');
                } catch (e) {
                    console.log(`   ❌ Manual sync failed: ${e.message}`);
                }
            }
        }

        // 6. Summary and recommendations
        console.log('\n6️⃣ DIAGNOSIS SUMMARY:');
        console.log('   Possible issues:');
        console.log('   1. Messages don\'t have access rights for other person');
        console.log('   2. CHUM connections not established');
        console.log('   3. Channel entries not syncing properly');
        console.log('   4. Message data objects not accessible');
        console.log('   5. Race condition in sync timing');
        
        console.log('\n   🔧 Next steps:');
        console.log('   - Check LeuteAccessRightsManager is granting access to message data');
        console.log('   - Verify CHUM protocol connections are established');
        console.log('   - Ensure channel entries AND message data both have access');

    } catch (error) {
        console.error('\n❌ Trace failed:', error);
    }
}

// Make it globally available
(globalThis as any).traceChumSyncFailure = traceChumSyncFailure;