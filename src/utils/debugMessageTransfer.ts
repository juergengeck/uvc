/**
 * Debug why messages aren't transferring between devices
 */

export async function debugMessageTransfer() {
    console.log('\n🔍 MESSAGE TRANSFER DEBUG');
    console.log('='.repeat(50));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }
        
        // Check active connections
        const connections = await appModel.transportManager.getActiveConnections();
        console.log(`\n🌐 Active connections: ${connections.length}`);
        
        if (connections.length === 0) {
            console.log('❌ No active connections - messages cannot transfer');
            return;
        }
        
        // For each connection, check what's accessible
        for (const conn of connections) {
            const remotePersonId = conn.remotePersonId || conn.targetPersonId;
            if (!remotePersonId) continue;
            
            console.log(`\n🎯 Connection to remote: ${remotePersonId.substring(0, 12)}...`);
            
            // Check access grants
            const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
            const accessible = await getAccessibleRootHashes(remotePersonId);
            
            console.log(`📊 Total accessible objects: ${accessible.length}`);
            
            // Group by type
            const byType: Record<string, number> = {};
            for (const obj of accessible) {
                byType[obj.type] = (byType[obj.type] || 0) + 1;
            }
            
            console.log('\n📦 Accessible objects by type:');
            for (const [type, count] of Object.entries(byType)) {
                console.log(`   ${type}: ${count}`);
                
                // Highlight message-related types
                if (type === 'Message' || type === 'ChatMessage') {
                    console.log(`   ✅ Remote can access ${count} ${type} objects`);
                } else if (type === 'ChannelInfo') {
                    console.log(`   ✅ Remote can access channel info`);
                } else if (type === 'ChannelEntry') {
                    console.log(`   ✅ Remote can access channel entries`);
                }
            }
            
            // Check if we're creating proper access grants for messages
            console.log('\n🔐 Checking message access grants...');
            
            // Get a 1-to-1 channel
            const channelManager = appModel.channelManager;
            const myPersonId = await appModel.leuteModel.myMainIdentity();
            const channelId = myPersonId < remotePersonId 
                ? `${myPersonId}<->${remotePersonId}`
                : `${remotePersonId}<->${myPersonId}`;
            
            console.log(`\n📁 Checking channel: ${channelId.substring(0, 50)}...`);
            
            try {
                // Get channel entries
                const entries = await channelManager.getChannelEntries(channelId, myPersonId);
                console.log(`📨 Channel has ${entries.length} entries`);
                
                if (entries.length > 0) {
                    // Check if entries have proper access
                    const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
                    
                    for (let i = 0; i < Math.min(3, entries.length); i++) {
                        const entry = entries[i];
                        console.log(`\n📧 Entry ${i + 1}:`);
                        console.log(`   Hash: ${entry.dataHash?.substring(0, 12) || 'N/A'}...`);
                        
                        // Check if this entry is in accessible objects
                        const isAccessible = accessible.some(obj => 
                            obj.hash === entry.dataHash || 
                            obj.hash === entry.channelEntryHash
                        );
                        
                        if (isAccessible) {
                            console.log(`   ✅ Entry is accessible to remote`);
                        } else {
                            console.log(`   ❌ Entry is NOT accessible to remote!`);
                            console.log(`   ⚠️  This message won't sync!`);
                        }
                    }
                }
            } catch (err) {
                console.log(`❌ Error checking channel: ${err.message}`);
            }
            
            // Check CHUM protocol status
            console.log('\n🔄 CHUM Protocol Status:');
            console.log('   The M2O-PH1 errors suggest CHUM is trying to sync but failing on Access objects');
            console.log('   This may prevent proper message synchronization');
            
            // Recommendations
            console.log('\n💡 DIAGNOSIS:');
            console.log('1. CHUM sync is partially working (connection established)');
            console.log('2. Access/IdAccess objects are failing to parse (M2O-PH1 error)');
            console.log('3. This may prevent message objects from being discovered');
            console.log('4. Messages exist locally but may not have proper access grants');
            
            console.log('\n🔧 POTENTIAL FIXES:');
            console.log('1. Ensure messages have access grants for both participants');
            console.log('2. Check that ChannelEntry objects are properly created');
            console.log('3. Verify that channel info is accessible to both parties');
            console.log('4. The M2O-PH1 error needs to be fixed in the CHUM protocol parser');
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    }
}

// Make it globally available
(globalThis as any).debugMessageTransfer = debugMessageTransfer;