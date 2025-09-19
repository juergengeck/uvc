/**
 * Debug CHUM parser issues
 * 
 * The error "M2O-PH1: This does not look like valid ONE microdata (isIdObj is false)"
 * indicates that CHUM is receiving ID objects but trying to parse them as regular objects.
 */

export async function debugChumParser() {
    console.log('\n🔍 CHUM PARSER DEBUG');
    console.log('='.repeat(50));
    
    try {
        // Check what parsing functions are available
        const { convertMicrodataToObject, convertIdMicrodataToObject } = await import('@refinio/one.core/lib/microdata-to-object.js');
        console.log('✅ Parser functions available:', {
            convertMicrodataToObject: typeof convertMicrodataToObject,
            convertIdMicrodataToObject: typeof convertIdMicrodataToObject
        });
        
        // Test parsing both types of microdata
        const idObjMicrodata = '<div data-id-object="true" itemscope itemtype="//refin.io/Access"><div itemprop="id">test</div></div>';
        const regularMicrodata = '<div itemscope itemtype="//refin.io/Message"><div itemprop="text">Hello</div></div>';
        
        console.log('\n📝 Testing ID object parsing:');
        try {
            // This should work
            const idObj = await convertIdMicrodataToObject(idObjMicrodata);
            console.log('✅ ID object parsed successfully:', idObj);
        } catch (err) {
            console.error('❌ ID object parsing failed:', err.message);
        }
        
        try {
            // This should fail with M2O-PH1
            const wrongParse = await convertMicrodataToObject(idObjMicrodata);
            console.log('❌ WRONG: Regular parser accepted ID object:', wrongParse);
        } catch (err) {
            console.log('✅ Regular parser correctly rejected ID object:', err.message);
        }
        
        console.log('\n📝 Testing regular object parsing:');
        try {
            const regularObj = await convertMicrodataToObject(regularMicrodata);
            console.log('✅ Regular object parsed successfully:', regularObj);
        } catch (err) {
            console.error('❌ Regular object parsing failed:', err.message);
        }
        
        // Now check CHUM's object types
        console.log('\n🔍 Checking CHUM sync object types...');
        
        const appModel = (globalThis as any).appModel;
        if (!appModel) {
            console.log('❌ AppModel not available');
            return;
        }
        
        // Check what types of objects are being synced
        const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
        const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
        const { getObjectByIdHash } = await import('@refinio/one.core/lib/storage-versioned-objects.js');
        
        // Get a remote person to check
        const connections = await appModel.transportManager.getActiveConnections();
        if (connections.length === 0) {
            console.log('❌ No active connections');
            return;
        }
        
        const remotePersonId = connections[0].remotePersonId || connections[0].targetPersonId;
        console.log(`\n👤 Checking objects for remote person: ${remotePersonId.substring(0, 12)}...`);
        
        const accessibleObjects = await getAccessibleRootHashes(remotePersonId);
        console.log(`📊 Found ${accessibleObjects.length} accessible objects`);
        
        // Check the first few objects
        for (let i = 0; i < Math.min(3, accessibleObjects.length); i++) {
            const objInfo = accessibleObjects[i];
            console.log(`\n📦 Object ${i + 1}:`);
            console.log(`   Type: ${objInfo.type}`);
            console.log(`   Hash: ${(objInfo.hash || objInfo.idHash || 'unknown').substring(0, 12)}...`);
            
            // Check if it's an ID object type
            const idObjectTypes = ['Access', 'IdAccess', 'ChannelInfo', 'Profile', 'Group'];
            if (idObjectTypes.includes(objInfo.type)) {
                console.log(`   ⚠️  This is an ID object type - needs convertIdMicrodataToObject`);
            } else {
                console.log(`   ✅ Regular object type - uses convertMicrodataToObject`);
            }
        }
        
        console.log('\n💡 DIAGNOSIS:');
        console.log('The CHUM protocol is receiving ID objects (like Access) but trying to parse them');
        console.log('with the regular object parser. This is why we see the M2O-PH1 error.');
        console.log('\nThe fix would be to ensure CHUM uses the correct parser based on object type.');
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    }
}

// Make it globally available
(globalThis as any).debugChumParser = debugChumParser;