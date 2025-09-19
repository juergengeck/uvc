/**
 * Debug CHUM connection establishment with granular details
 */

export async function debugChumConnections() {
    console.log('\n🔍 DEBUG CHUM CONNECTIONS - GRANULAR ANALYSIS');
    console.log('='.repeat(70));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available at globalThis.appModel');
            return;
        }
        console.log('✅ AppModel found');
        
        // 1. Transport Manager Check
        console.log('\n1️⃣ TRANSPORT MANAGER CHECK:');
        const transportManager = appModel.transportManager;
        console.log(`   transportManager exists: ${!!transportManager}`);
        console.log(`   transportManager type: ${transportManager?.constructor?.name || 'unknown'}`);
        
        if (!transportManager) {
            console.log('❌ TransportManager not available');
            return;
        }
        
        // 2. ConnectionsModel Check
        console.log('\n2️⃣ CONNECTIONS MODEL CHECK:');
        const connectionsModel = transportManager.getConnectionsModel();
        console.log(`   getConnectionsModel() returned: ${!!connectionsModel}`);
        console.log(`   connectionsModel type: ${connectionsModel?.constructor?.name || 'unknown'}`);
        
        if (!connectionsModel) {
            console.log('❌ ConnectionsModel not available');
            return;
        }
        
        // 3. ConnectionsModel Properties
        console.log('\n3️⃣ CONNECTIONS MODEL PROPERTIES:');
        console.log(`   onlineState: ${connectionsModel.onlineState}`);
        console.log(`   config:`, connectionsModel.config || 'undefined');
        
        // Check all properties
        const modelProps = Object.keys(connectionsModel);
        console.log(`   Total properties: ${modelProps.length}`);
        console.log(`   Key properties:`, modelProps.filter(p => 
            p.includes('leute') || p.includes('chum') || p.includes('module') || p.includes('route')
        ));
        
        // 4. LeuteConnectionsModule Check
        console.log('\n4️⃣ LEUTE CONNECTIONS MODULE CHECK:');
        const leuteModule = (connectionsModel as any).leuteConnectionsModule;
        console.log(`   leuteConnectionsModule exists: ${!!leuteModule}`);
        
        if (!leuteModule) {
            console.log('❌ CRITICAL: leuteConnectionsModule is missing!');
            
            // Check if it's under a different property
            console.log('\n   🔍 Searching for module in other properties:');
            for (const prop of modelProps) {
                const value = (connectionsModel as any)[prop];
                if (value && typeof value === 'object' && 
                    (prop.includes('module') || prop.includes('Module'))) {
                    console.log(`     Found module at: ${prop}`);
                    console.log(`     Type: ${value.constructor?.name || 'unknown'}`);
                }
            }
            return;
        }
        
        console.log(`   leuteModule type: ${leuteModule.constructor?.name || 'unknown'}`);
        console.log(`   leuteModule methods:`, Object.getOwnPropertyNames(Object.getPrototypeOf(leuteModule))
            .filter(m => typeof leuteModule[m] === 'function' && m !== 'constructor')
            .slice(0, 10));
        
        // 5. Connection Info
        console.log('\n5️⃣ CONNECTION INFO:');
        const connections = connectionsModel.connectionsInfo();
        console.log(`   Total connections: ${connections.length}`);
        
        connections.forEach((conn, idx) => {
            console.log(`\n   📡 Connection ${idx + 1}:`);
            console.log(`      remotePersonId: ${conn.remotePersonId?.substring(0, 16) || 'undefined'}...`);
            console.log(`      remoteInstanceId: ${conn.remoteInstanceId?.substring(0, 16) || 'undefined'}...`);
            console.log(`      connectionStatus: ${conn.connectionStatus}`);
            console.log(`      protocol: ${conn.protocol || 'undefined'}`);
            console.log(`      localPersonId: ${conn.localPersonId?.substring(0, 16) || 'undefined'}...`);
            console.log(`      localInstanceId: ${conn.localInstanceId?.substring(0, 16) || 'undefined'}...`);
            
            // Check connection object properties
            const connProps = Object.keys(conn);
            console.log(`      All properties: [${connProps.join(', ')}]`);
            
            // Check if this is a CHUM connection
            if (conn.protocol === 'chum') {
                console.log('      ✅ CHUM protocol detected');
            } else {
                console.log(`      ❌ Protocol is '${conn.protocol}', not 'chum'`);
            }
        });
        
        // 6. Routes Check
        console.log('\n6️⃣ ROUTES CHECK:');
        const routes = (connectionsModel as any).routes;
        if (routes) {
            console.log(`   Routes object exists: ✅`);
            console.log(`   Route keys: [${Object.keys(routes).join(', ')}]`);
            console.log(`   'chum' route registered: ${routes.chum ? '✅' : '❌'}`);
            
            if (routes.chum) {
                console.log(`   CHUM route handler type: ${typeof routes.chum}`);
                console.log(`   CHUM route details:`, routes.chum.toString().substring(0, 100) + '...');
            }
        } else {
            console.log('   Routes object: ❌ Not found');
        }
        
        // 7. CHUM Sessions Check
        console.log('\n7️⃣ CHUM SESSIONS CHECK:');
        if (leuteModule.chumSessions) {
            const sessions = leuteModule.chumSessions;
            console.log(`   chumSessions exists: ✅`);
            console.log(`   Active sessions: ${Object.keys(sessions).length}`);
            
            Object.entries(sessions).forEach(([sessionId, session], idx) => {
                console.log(`\n   🔗 Session ${idx + 1} (${sessionId}):`);
                const s = session as any;
                console.log(`      remotePersonId: ${s.remotePersonId?.substring(0, 16) || 'undefined'}...`);
                console.log(`      state: ${s.state || 'undefined'}`);
                console.log(`      exporter exists: ${!!s.exporter}`);
                console.log(`      importer exists: ${!!s.importer}`);
                
                if (s.exporter) {
                    console.log(`      exporter type: ${s.exporter.constructor?.name || 'unknown'}`);
                }
                if (s.importer) {
                    console.log(`      importer type: ${s.importer.constructor?.name || 'unknown'}`);
                }
                
                // Check session properties
                const sessionProps = Object.keys(s);
                console.log(`      All properties: [${sessionProps.join(', ')}]`);
            });
        } else {
            console.log('   chumSessions property: ❌ Not found');
            
            // Check for CHUM-related properties
            console.log('\n   🔍 Searching for CHUM-related properties:');
            const leuteProps = Object.keys(leuteModule);
            const chumProps = leuteProps.filter(p => 
                p.toLowerCase().includes('chum') || 
                p.toLowerCase().includes('export') || 
                p.toLowerCase().includes('import')
            );
            console.log(`   Found properties: [${chumProps.join(', ')}]`);
        }
        
        // 8. Try to establish CHUM connection
        console.log('\n8️⃣ ATTEMPTING CHUM CONNECTION:');
        const hasConnectToInstance = typeof leuteModule.connectToInstance === 'function';
        console.log(`   connectToInstance method exists: ${hasConnectToInstance ? '✅' : '❌'}`);
        
        if (hasConnectToInstance && connections.length > 0) {
            const firstConn = connections[0];
            if (firstConn.connectionStatus === 'connected' && firstConn.protocol !== 'chum') {
                console.log(`\n   🎯 Attempting to establish CHUM with ${firstConn.remotePersonId?.substring(0, 16)}...`);
                
                try {
                    const result = await leuteModule.connectToInstance(
                        firstConn.remotePersonId,
                        firstConn.remoteInstanceId,
                        'chum'
                    );
                    console.log('   ✅ connectToInstance returned:', result);
                } catch (error) {
                    console.error('   ❌ connectToInstance failed:', error);
                    console.error('      Error type:', error.constructor?.name);
                    console.error('      Error message:', error.message);
                    console.error('      Error stack:', error.stack?.split('\n').slice(0, 3).join('\n'));
                }
            }
        }
        
        // 9. Cache Update
        console.log('\n9️⃣ CACHE UPDATE:');
        const hasUpdateCache = typeof leuteModule.updateCache === 'function';
        console.log(`   updateCache method exists: ${hasUpdateCache ? '✅' : '❌'}`);
        
        if (hasUpdateCache) {
            try {
                console.log('   🔄 Calling updateCache()...');
                await leuteModule.updateCache();
                console.log('   ✅ updateCache completed');
            } catch (error) {
                console.error('   ❌ updateCache failed:', error.message);
            }
        }
        
        // 10. Final Analysis
        console.log('\n🔟 ANALYSIS SUMMARY:');
        console.log('   - ConnectionsModel: ✅');
        console.log(`   - LeuteConnectionsModule: ${leuteModule ? '✅' : '❌'}`);
        console.log(`   - Active connections: ${connections.length}`);
        console.log(`   - CHUM connections: ${connections.filter(c => c.protocol === 'chum').length}`);
        console.log(`   - CHUM route registered: ${routes?.chum ? '✅' : '❌'}`);
        
    } catch (error) {
        console.error('\n❌ Debug failed with error:', error);
        console.error('   Error type:', error.constructor?.name);
        console.error('   Error message:', error.message);
        console.error('   Error stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
    }
}

// Make it globally available
(globalThis as any).debugChumConnections = debugChumConnections;