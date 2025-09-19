/**
 * Check for malformed access grants that might be causing M2O-PH1 errors
 */

export async function checkMalformedAccessGrants() {
  console.log('\n🔍 CHECKING FOR MALFORMED ACCESS GRANTS');
  console.log('=' . repeat(50));
  
  try {
    const appModel = (globalThis as any).appModel;
    if (!appModel) {
      console.log('❌ AppModel not available');
      return;
    }
    
    // Get my ID and contacts
    const myId = await appModel.leuteModel.myMainIdentity();
    const myIdShort = myId.toString().substring(0, 8);
    const userName = myIdShort === 'd27f0ef1' ? 'demo' : 'demo1';
    
    console.log(`\n👤 Running as: ${userName} (${myIdShort}...)`);
    
    // Get all Access and IdAccess objects
    const { getAllEntries } = await import('@refinio/one.core/lib/reverse-map-query.js');
    const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
    const { getObjectByIdHash } = await import('@refinio/one.core/lib/storage-versioned-objects.js');
    
    // Check Access objects
    console.log('\n📦 Checking Access objects...');
    const accessEntries = await getAllEntries(myId, 'Access');
    console.log(`   Found ${accessEntries.length} Access objects`);
    
    let malformedCount = 0;
    for (let i = 0; i < Math.min(5, accessEntries.length); i++) {
      try {
        const accessObj = await getObjectByIdHash(accessEntries[i]);
        if (accessObj && accessObj.obj) {
          const obj = accessObj.obj;
          console.log(`\n   Access ${i + 1}:`);
          console.log(`     Type: ${obj.$type$}`);
          console.log(`     Has 'object' field: ${obj.object ? '✅' : '❌'}`);
          console.log(`     Has 'id' field: ${obj.id ? '⚠️ WRONG!' : '✅ correct'}`);
          console.log(`     Person count: ${obj.person?.length || 0}`);
          console.log(`     Group count: ${obj.group?.length || 0}`);
          
          if (obj.id) {
            console.log(`     ❌ MALFORMED: Access object should not have 'id' field!`);
            malformedCount++;
          }
        }
      } catch (e) {
        console.log(`     ❌ Error reading Access object: ${e.message}`);
      }
    }
    
    // Check IdAccess objects
    console.log('\n📦 Checking IdAccess objects...');
    const idAccessEntries = await getAllEntries(myId, 'IdAccess');
    console.log(`   Found ${idAccessEntries.length} IdAccess objects`);
    
    for (let i = 0; i < Math.min(5, idAccessEntries.length); i++) {
      try {
        const idAccessObj = await getObjectByIdHash(idAccessEntries[i]);
        if (idAccessObj && idAccessObj.obj) {
          const obj = idAccessObj.obj;
          console.log(`\n   IdAccess ${i + 1}:`);
          console.log(`     Type: ${obj.$type$}`);
          console.log(`     Has 'id' field: ${obj.id ? '✅' : '❌'}`);
          console.log(`     Has 'object' field: ${obj.object ? '⚠️ WRONG!' : '✅ correct'}`);
          console.log(`     Person count: ${obj.person?.length || 0}`);
          console.log(`     Group count: ${obj.group?.length || 0}`);
          
          if (obj.object) {
            console.log(`     ❌ MALFORMED: IdAccess object should not have 'object' field!`);
            malformedCount++;
          }
          
          // Check if the ID points to a valid versioned object
          if (obj.id) {
            try {
              const targetObj = await getObjectByIdHash(obj.id);
              console.log(`     Target object type: ${targetObj?.obj?.$type$ || 'unknown'}`);
            } catch (e) {
              console.log(`     ⚠️ Cannot read target object: ${e.message}`);
            }
          }
        }
      } catch (e) {
        console.log(`     ❌ Error reading IdAccess object: ${e.message}`);
      }
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total Access objects: ${accessEntries.length}`);
    console.log(`   Total IdAccess objects: ${idAccessEntries.length}`);
    console.log(`   Malformed objects found: ${malformedCount}`);
    
    if (malformedCount > 0) {
      console.log(`\n⚠️ FOUND MALFORMED ACCESS GRANTS!`);
      console.log(`   These are likely causing the M2O-PH1 errors during CHUM sync`);
      console.log(`   The app may have created these before the fix was applied`);
      console.log(`\n💡 RECOMMENDATION: Clear app data and start fresh to remove malformed objects`);
    } else {
      console.log(`\n✅ No malformed access grants found in the samples checked`);
    }
    
  } catch (error) {
    console.error('❌ Error checking access grants:', error);
  }
}

// Make available globally
(globalThis as any).checkMalformedAccessGrants = checkMalformedAccessGrants;