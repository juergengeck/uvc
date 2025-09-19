/**
 * Debug CHUM Exporter and Importer - Find out how to trigger them
 */

export async function debugChumExporterImporter() {
    console.log('\n🔍 DEBUG CHUM EXPORTER/IMPORTER - DEEP ANALYSIS');
    console.log('='.repeat(80));
    
    try {
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }

        // 1. Get ConnectionsModel through TransportManager
        console.log('\n1️⃣ GETTING CONNECTIONS MODEL:');
        const connectionsModel = appModel.transportManager?.getConnectionsModel();
        if (!connectionsModel) {
            console.log('❌ ConnectionsModel not available');
            return;
        }
        console.log('✅ ConnectionsModel found');

        // 2. Get LeuteConnectionsModule
        console.log('\n2️⃣ GETTING LEUTE CONNECTIONS MODULE:');
        const leuteModule = (connectionsModel as any).leuteConnectionsModule;
        if (!leuteModule) {
            console.log('❌ LeuteConnectionsModule not found');
            return;
        }
        console.log('✅ LeuteConnectionsModule found');

        // 3. Check for CHUM-related properties in LeuteConnectionsModule
        console.log('\n3️⃣ CHUM-RELATED PROPERTIES IN LEUTE MODULE:');
        const leuteProps = Object.keys(leuteModule);
        const chumRelatedProps = leuteProps.filter(p => 
            p.toLowerCase().includes('chum') || 
            p.toLowerCase().includes('export') || 
            p.toLowerCase().includes('import') ||
            p.toLowerCase().includes('sync')
        );
        console.log(`   Total properties: ${leuteProps.length}`);
        console.log(`   CHUM-related properties: [${chumRelatedProps.join(', ')}]`);

        // 4. Check methods on LeuteConnectionsModule
        console.log('\n4️⃣ METHODS ON LEUTE MODULE:');
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(leuteModule))
            .filter(m => typeof leuteModule[m] === 'function' && m !== 'constructor');
        console.log(`   Methods: [${methods.join(', ')}]`);

        // Look for sync-related methods
        const syncMethods = methods.filter(m => 
            m.toLowerCase().includes('sync') || 
            m.toLowerCase().includes('export') ||
            m.toLowerCase().includes('import') ||
            m.toLowerCase().includes('chum')
        );
        console.log(`   Sync-related methods: [${syncMethods.join(', ')}]`);

        // 5. Check internal CHUM sessions or managers
        console.log('\n5️⃣ INTERNAL CHUM MANAGERS:');
        
        // Check for _chumManager or similar
        const internalProps = Object.keys(leuteModule).filter(p => p.startsWith('_'));
        console.log(`   Internal properties: [${internalProps.join(', ')}]`);
        
        for (const prop of internalProps) {
            const value = (leuteModule as any)[prop];
            if (value && typeof value === 'object') {
                console.log(`   Checking ${prop}:`, value.constructor?.name || 'unknown');
                
                // Check if it has exporter/importer related methods
                if (value.export || value.import || value.sync) {
                    console.log(`     ✅ Found sync-related methods on ${prop}`);
                }
            }
        }

        // 6. Check connections for CHUM protocol handlers
        console.log('\n6️⃣ CHECKING CONNECTIONS FOR CHUM HANDLERS:');
        const connections = connectionsModel.connectionsInfo();
        console.log(`   Total connections: ${connections.length}`);

        for (const conn of connections) {
            if (conn.connectionStatus === 'connected') {
                console.log(`\n   📡 Connected to: ${conn.remotePersonId?.substring(0, 16)}...`);
                
                // Try to access the actual connection object
                // ConnectionsModel might store them internally
                const connectionId = `${conn.localPersonId}-${conn.remotePersonId}`;
                console.log(`   Looking for connection object with ID pattern...`);
                
                // Check various possible storage locations
                const possibleLocations = [
                    'connections',
                    '_connections', 
                    'activeConnections',
                    '_activeConnections',
                    'connectionMap',
                    '_connectionMap'
                ];
                
                for (const location of possibleLocations) {
                    const storage = (connectionsModel as any)[location];
                    if (storage) {
                        console.log(`     Found ${location}: ${typeof storage}`);
                        if (typeof storage === 'object') {
                            const keys = Object.keys(storage);
                            console.log(`       Contains ${keys.length} entries`);
                            
                            // Look for this specific connection
                            for (const key of keys) {
                                const connObj = storage[key];
                                if (connObj && (key.includes(conn.remotePersonId) || 
                                    (connObj.remotePersonId && connObj.remotePersonId === conn.remotePersonId))) {
                                    console.log(`       ✅ Found connection object at ${location}[${key.substring(0, 16)}...]`);
                                    
                                    // Check for CHUM handlers
                                    if (connObj.routes) {
                                        console.log(`         Has routes: ${Object.keys(connObj.routes).join(', ')}`);
                                    }
                                    if (connObj.plugins) {
                                        console.log(`         Has plugins: ${Object.keys(connObj.plugins).join(', ')}`);
                                    }
                                    if (connObj._chumExporter || connObj.chumExporter) {
                                        console.log('         ✅ Has CHUM exporter!');
                                    }
                                    if (connObj._chumImporter || connObj.chumImporter) {
                                        console.log('         ✅ Has CHUM importer!');
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 7. Try to trigger CHUM sync manually
        console.log('\n7️⃣ ATTEMPTING TO TRIGGER CHUM SYNC:');
        
        // Check if there's an updateCache or sync method
        if (typeof leuteModule.updateCache === 'function') {
            console.log('   Calling updateCache()...');
            try {
                await leuteModule.updateCache();
                console.log('   ✅ updateCache() completed');
            } catch (error) {
                console.error('   ❌ updateCache() failed:', error);
            }
        }

        // Check for sync-specific methods
        if (typeof leuteModule.syncWithPerson === 'function') {
            console.log('   Found syncWithPerson method!');
            for (const conn of connections) {
                if (conn.connectionStatus === 'connected') {
                    try {
                        console.log(`   Calling syncWithPerson(${conn.remotePersonId.substring(0, 16)}...)...`);
                        await leuteModule.syncWithPerson(conn.remotePersonId);
                        console.log('   ✅ syncWithPerson completed');
                    } catch (error) {
                        console.error('   ❌ syncWithPerson failed:', error);
                    }
                    break; // Try just one
                }
            }
        }

        // 8. Check ONE core for CHUM components
        console.log('\n8️⃣ CHECKING ONE CORE FOR CHUM COMPONENTS:');
        try {
            // Try to import CHUM-related modules from one.core
            const possibleImports = [
                '@refinio/one.core/lib/chum',
                '@refinio/one.core/lib/sync',
                '@refinio/one.core/lib/replication',
                '@refinio/one.models/lib/misc/CHUM',
                '@refinio/one.models/lib/misc/ChumExporter',
                '@refinio/one.models/lib/misc/ChumImporter'
            ];

            for (const importPath of possibleImports) {
                try {
                    console.log(`   Trying to import ${importPath}...`);
                    const module = await import(importPath);
                    console.log(`   ✅ Found module: ${importPath}`);
                    console.log(`      Exports: ${Object.keys(module).join(', ')}`);
                } catch (e) {
                    // Silent fail - module doesn't exist
                }
            }
        } catch (error) {
            console.log('   Could not check ONE core imports');
        }

        // 9. Final analysis
        console.log('\n9️⃣ ANALYSIS SUMMARY:');
        console.log('   Based on the investigation:');
        console.log('   - CHUM sync is built into LeuteConnectionsModule');
        console.log('   - It should be triggered automatically when:');
        console.log('     1. Connections are established');
        console.log('     2. Access rights are created');
        console.log('     3. Objects are stored that match access rights');
        console.log('   - Manual triggers might include:');
        console.log('     - leuteModule.updateCache()');
        console.log('     - leuteModule.enableConnectionsForPerson()');
        console.log('     - connectToInstance() with "chum" protocol');
        
    } catch (error) {
        console.error('\n❌ Debug failed:', error);
    }
}

// Make it globally available
(globalThis as any).debugChumExporterImporter = debugChumExporterImporter;