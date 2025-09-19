/**
 * Debug enableConnectionsForPerson - trace what it should do to trigger CHUM
 */

export async function debugEnableConnectionsForPerson() {
    console.log('\n🔍 DEBUG enableConnectionsForPerson BEHAVIOR');
    console.log('='.repeat(70));
    
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

        const leuteModule = (connectionsModel as any).leuteConnectionsModule;
        if (!leuteModule) {
            console.log('❌ LeuteConnectionsModule not available');
            return;
        }

        // 1. Check current connections
        console.log('\n1️⃣ CURRENT CONNECTIONS BEFORE:');
        const beforeConnections = connectionsModel.connectionsInfo();
        console.log(`   Total connections: ${beforeConnections.length}`);
        
        beforeConnections.forEach((conn, idx) => {
            console.log(`   Connection ${idx + 1}: ${conn.remotePersonId?.substring(0, 16)}... (${conn.protocol}) - ${conn.connectionStatus}`);
        });

        // 2. Get contacts to test with
        console.log('\n2️⃣ GETTING CONTACTS:');
        const contacts = await appModel.leuteModel.others();
        console.log(`   Found ${contacts.length} contacts`);

        if (contacts.length === 0) {
            console.log('❌ No contacts found to test with');
            return;
        }

        // 3. Test enableConnectionsForPerson with first contact
        const testContact = contacts[0];
        const personId = await testContact.mainIdentity();
        console.log(`\n3️⃣ TESTING enableConnectionsForPerson WITH: ${personId.toString().substring(0, 16)}...`);

        // Check if already enabled
        const existingConnection = beforeConnections.find(c => c.remotePersonId === personId.toString());
        if (existingConnection) {
            console.log(`   ✅ Connection already exists: ${existingConnection.protocol} (${existingConnection.connectionStatus})`);
        } else {
            console.log('   ⚠️ No existing connection found');
        }

        // Call enableConnectionsForPerson
        console.log('\n4️⃣ CALLING enableConnectionsForPerson...');
        try {
            await leuteModule.enableConnectionsForPerson(personId);
            console.log('   ✅ enableConnectionsForPerson completed');
        } catch (error) {
            console.error('   ❌ enableConnectionsForPerson failed:', error);
            return;
        }

        // 5. Check connections after
        console.log('\n5️⃣ CONNECTIONS AFTER enableConnectionsForPerson:');
        const afterConnections = connectionsModel.connectionsInfo();
        console.log(`   Total connections: ${afterConnections.length}`);
        
        let foundNewConnections = false;
        afterConnections.forEach((conn, idx) => {
            const wasExisting = beforeConnections.some(bc => 
                bc.remotePersonId === conn.remotePersonId && bc.protocol === conn.protocol
            );
            
            const status = wasExisting ? '(existing)' : '(NEW)';
            if (!wasExisting) foundNewConnections = true;
            
            console.log(`   Connection ${idx + 1}: ${conn.remotePersonId?.substring(0, 16)}... (${conn.protocol}) - ${conn.connectionStatus} ${status}`);
        });

        if (!foundNewConnections) {
            console.log('   ⚠️ No new connections were created');
        }

        // 6. Specifically check for CHUM connections
        console.log('\n6️⃣ CHUM CONNECTION ANALYSIS:');
        const chumConnections = afterConnections.filter(c => c.protocol === 'chum');
        console.log(`   CHUM connections found: ${chumConnections.length}`);
        
        if (chumConnections.length === 0) {
            console.log('   ❌ NO CHUM CONNECTIONS - This is the problem!');
            console.log('   💡 enableConnectionsForPerson should automatically create CHUM connections');
        } else {
            chumConnections.forEach((conn, idx) => {
                console.log(`   CHUM ${idx + 1}: ${conn.remotePersonId?.substring(0, 16)}... - ${conn.connectionStatus}`);
            });
        }

        // 7. Check if updateCache is needed
        console.log('\n7️⃣ TESTING updateCache:');
        if (typeof leuteModule.updateCache === 'function') {
            console.log('   Calling updateCache...');
            try {
                await leuteModule.updateCache();
                console.log('   ✅ updateCache completed');
                
                // Check connections again
                const finalConnections = connectionsModel.connectionsInfo();
                const finalChumConnections = finalConnections.filter(c => c.protocol === 'chum');
                console.log(`   CHUM connections after updateCache: ${finalChumConnections.length}`);
            } catch (error) {
                console.error('   ❌ updateCache failed:', error);
            }
        } else {
            console.log('   ❌ updateCache method not available');
        }

        // 8. Analysis
        console.log('\n8️⃣ ANALYSIS:');
        if (chumConnections.length === 0) {
            console.log('   🔍 Problem: enableConnectionsForPerson is not creating CHUM connections');
            console.log('   🔍 Expected: one.leute pattern should automatically create CHUM after enableConnectionsForPerson');
            console.log('   🔍 Possible causes:');
            console.log('     - LeuteConnectionsModule not properly initialized');
            console.log('     - Missing route handlers for CHUM protocol');
            console.log('     - Different behavior in our ConnectionsModel vs one.leute');
        } else {
            console.log('   ✅ CHUM connections exist - check if messages sync properly');
        }

    } catch (error) {
        console.error('\n❌ Debug failed:', error);
    }
}

// Make it globally available
(globalThis as any).debugEnableConnectionsForPerson = debugEnableConnectionsForPerson;