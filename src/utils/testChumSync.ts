/**
 * Test CHUM sync after our fixes
 */

export async function testChumSync() {
    console.log('\n🧪 TESTING CHUM SYNC AFTER FIXES');
    console.log('='.repeat(60));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }

        const connectionsModel = appModel.transportManager?.getConnectionsModel();
        if (!connectionsModel) {
            console.log('❌ ConnectionsModel not available');
            return;
        }

        // 1. Check current connections
        console.log('\n1️⃣ CURRENT CONNECTIONS:');
        const connections = connectionsModel.connectionsInfo();
        console.log(`   Total connections: ${connections.length}`);
        
        const chumConnections = connections.filter(c => c.protocol === 'chum');
        console.log(`   CHUM connections: ${chumConnections.length}`);
        
        connections.forEach((conn, idx) => {
            console.log(`\n   Connection ${idx + 1}:`);
            console.log(`     Remote: ${conn.remotePersonId?.substring(0, 16)}...`);
            console.log(`     Protocol: ${conn.protocol}`);
            console.log(`     Status: ${conn.connectionStatus}`);
        });

        // 2. If no CHUM connections, try to establish them
        if (chumConnections.length === 0 && connections.length > 0) {
            console.log('\n2️⃣ NO CHUM CONNECTIONS FOUND - ESTABLISHING NOW:');
            
            const leuteModule = (connectionsModel as any).leuteConnectionsModule;
            if (!leuteModule) {
                console.log('❌ LeuteConnectionsModule not available');
                return;
            }

            for (const conn of connections) {
                if (conn.connectionStatus === 'connected' && conn.protocol !== 'chum') {
                    console.log(`\n   🚀 Establishing CHUM for ${conn.remotePersonId?.substring(0, 16)}...`);
                    try {
                        await leuteModule.connectToInstance(
                            conn.remotePersonId,
                            conn.remoteInstanceId,
                            'chum'
                        );
                        console.log('   ✅ CHUM connection established');
                    } catch (error) {
                        console.error('   ❌ Failed:', error.message);
                    }
                }
            }

            // Update cache
            if (typeof leuteModule.updateCache === 'function') {
                console.log('\n   🔄 Updating cache...');
                await leuteModule.updateCache();
                console.log('   ✅ Cache updated');
            }

            // Re-check connections
            console.log('\n3️⃣ CONNECTIONS AFTER CHUM ESTABLISHMENT:');
            const newConnections = connectionsModel.connectionsInfo();
            const newChumConnections = newConnections.filter(c => c.protocol === 'chum');
            console.log(`   Total connections: ${newConnections.length}`);
            console.log(`   CHUM connections: ${newChumConnections.length}`);
        }

        // 3. Test message sync
        console.log('\n4️⃣ TESTING MESSAGE SYNC:');
        console.log('   Send a message on one device and check if it appears on the other.');
        console.log('   The CHUM sync should now be working if connections are established.');

    } catch (error) {
        console.error('\n❌ Test failed:', error);
    }
}

// Make it globally available
(globalThis as any).testChumSync = testChumSync;