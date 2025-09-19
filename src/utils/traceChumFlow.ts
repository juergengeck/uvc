/**
 * Trace CHUM flow to understand what's being synced
 */

export async function traceChumFlow() {
    console.log('\n🔍 TRACING CHUM FLOW');
    console.log('='.repeat(50));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }
        
        // Get the ChannelManager to check what objects exist
        const channelManager = appModel.channelManager;
        if (!channelManager) {
            console.log('❌ ChannelManager not available');
            return;
        }
        
        // Check what channels we have
        const channels = await channelManager.channels();
        console.log(`\n📂 Total channels: ${channels.length}`);
        
        for (const channel of channels) {
            console.log(`\n📁 Channel: ${channel.id}`);
            
            // Check channel entries
            const entries = await channelManager.getChannelEntries(channel.id);
            console.log(`   Entries: ${entries.length}`);
            
            // Get channel info object
            const channelInfo = await channelManager.getChannelInfo(channel.id);
            if (channelInfo) {
                console.log(`   ChannelInfo type: ${channelInfo.$type$}`);
                console.log(`   ChannelInfo hash: ${channelInfo.$hash$ || 'N/A'}`);
                console.log(`   ChannelInfo idHash: ${channelInfo.$idHash$ || 'N/A'}`);
            }
        }
        
        // Now check access grants
        console.log('\n🔐 Checking Access Grants:');
        
        const { getAllEntries } = await import('@refinio/one.core/lib/reverse-map-query.js');
        const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
        
        // Get my person ID
        const myPersonId = await appModel.leuteModel.myMainIdentity();
        console.log(`\n👤 My person ID: ${myPersonId.substring(0, 12)}...`);
        
        // Check what access objects I have
        const myAccessEntries = await getAllEntries(myPersonId);
        console.log(`📊 Total reverse map entries for me: ${myAccessEntries.length}`);
        
        // Filter for Access and IdAccess types
        const accessEntries = myAccessEntries.filter(e => e.type === 'Access' || e.type === 'IdAccess');
        console.log(`🔐 Access-related entries: ${accessEntries.length}`);
        
        // Check a few access objects
        for (let i = 0; i < Math.min(3, accessEntries.length); i++) {
            const entry = accessEntries[i];
            console.log(`\n🔍 Access entry ${i + 1}:`);
            console.log(`   Type: ${entry.type}`);
            console.log(`   Hash: ${entry.hash.substring(0, 12)}...`);
            
            try {
                const obj = await getObject(entry.hash);
                console.log(`   Object type: ${obj.$type$}`);
                console.log(`   Has ID fields: ${!!obj.id}`);
                
                // This is the key - Access objects should be ID objects
                if (entry.type === 'Access' || entry.type === 'IdAccess') {
                    console.log(`   ⚠️  This should be parsed as an ID object`);
                }
            } catch (err) {
                console.log(`   ❌ Failed to get object: ${err.message}`);
            }
        }
        
        // Check active connections
        const connections = await appModel.transportManager.getActiveConnections();
        console.log(`\n🌐 Active connections: ${connections.length}`);
        
        for (const conn of connections) {
            const remotePersonId = conn.remotePersonId || conn.targetPersonId;
            if (!remotePersonId) continue;
            
            console.log(`\n🎯 Connection to: ${remotePersonId.substring(0, 12)}...`);
            
            // Check what they can access
            const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
            const accessible = await getAccessibleRootHashes(remotePersonId);
            console.log(`   Accessible objects: ${accessible.length}`);
            
            // Group by type
            const byType: Record<string, number> = {};
            for (const obj of accessible) {
                byType[obj.type] = (byType[obj.type] || 0) + 1;
            }
            
            console.log('   By type:');
            for (const [type, count] of Object.entries(byType)) {
                console.log(`     - ${type}: ${count}`);
            }
        }
        
        console.log('\n💡 ANALYSIS:');
        console.log('1. Messages ARE syncing (ChatModel shows new messages)');
        console.log('2. Access/IdAccess objects are failing to sync');
        console.log('3. The error suggests CHUM is using wrong parser for Access objects');
        console.log('4. This might be why we see partial sync - messages work, access grants fail');
        
    } catch (error) {
        console.error('❌ Trace failed:', error);
    }
}

// Make it globally available
(globalThis as any).traceChumFlow = traceChumFlow;