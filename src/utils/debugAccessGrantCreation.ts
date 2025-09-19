/**
 * Debug if access grants are being created properly
 */

export async function debugAccessGrantCreation() {
    console.log('\n🔍 DEBUG ACCESS GRANT CREATION');
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
        
        // Create a test channel and monitor access grant creation
        const testChannelId = `test-${Date.now()}-${myPersonId}<->${remotePersonId}`;
        console.log(`\n🔨 Creating test channel: ${testChannelId}`);
        
        // Hook into access grant creation
        const { createAccess } = await import('@refinio/one.core/lib/access.js');
        const originalCreateAccess = createAccess;
        let accessGrantsCreated = 0;
        
        // Temporarily replace createAccess to log calls
        (globalThis as any).createAccess = async (grants: any[]) => {
            console.log(`\n📝 createAccess called with ${grants.length} grants:`);
            grants.forEach((grant, idx) => {
                console.log(`   Grant ${idx + 1}:`);
                console.log(`     ID: ${grant.id?.substring(0, 12)}...`);
                console.log(`     Person: ${grant.person?.length || 0} entries`);
                if (grant.person?.length > 0) {
                    grant.person.forEach((p: string) => 
                        console.log(`       - ${p.substring(0, 12)}...`)
                    );
                }
                console.log(`     Group: ${grant.group?.length || 0} entries`);
                console.log(`     Mode: ${grant.mode}`);
            });
            accessGrantsCreated += grants.length;
            
            // Call the original function
            return originalCreateAccess(grants);
        };
        
        try {
            // Create the channel
            await appModel.channelManager.createChannel(testChannelId, myPersonId);
            console.log('✅ Channel created');
            
            // Manually trigger access grant creation
            console.log('\n🔐 Manually calling grantAccessFor1to1Channel...');
            await appModel.leuteAccessRightsManager.grantAccessFor1to1Channel(testChannelId, myPersonId);
            
            console.log(`\n📊 Total access grants created: ${accessGrantsCreated}`);
            
            if (accessGrantsCreated > 0) {
                console.log('✅ Access grants were created successfully!');
            } else {
                console.log('❌ No access grants were created!');
            }
            
        } finally {
            // Restore original function
            (globalThis as any).createAccess = originalCreateAccess;
        }
        
        // Check if the channel is visible
        const channels = await appModel.channelManager.channels();
        const testChannel = channels.find(ch => ch.id === testChannelId);
        
        console.log(`\n🔍 Test channel visibility: ${testChannel ? '✅ VISIBLE' : '❌ NOT FOUND'}`);
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    }
}

// Make it globally available
(globalThis as any).debugAccessGrantCreation = debugAccessGrantCreation;