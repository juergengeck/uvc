/**
 * Debug person ID sorting to understand topic ID differences
 */

import type { AppModel } from '../models/AppModel';

export async function debugPersonIdSorting(appModel: AppModel): Promise<void> {
  console.log('\n🔍 PERSON ID SORTING DEBUG\n');
  
  // Get device info
  const myId = await appModel.leuteModel.myMainIdentity();
  const deviceId = myId.personId.substring(0, 8);
  const myPersonId = myId.personId.toString();
  
  console.log(`📱 DEVICE: ${deviceId}`);
  console.log(`📱 MY FULL PERSON ID: ${myPersonId}`);
  console.log(`📱 MY PERSON ID LENGTH: ${myPersonId.length}`);
  console.log(`📱 MY PERSON ID TYPE: ${typeof myPersonId}`);
  
  // Get all contacts and show sorting results
  const contacts = await appModel.leuteModel.others();
  console.log(`\n👥 TESTING SORTING WITH ${contacts.length} CONTACTS:\n`);
  
  for (const contact of contacts) {
    try {
      const contactPersonId = await contact.mainIdentity();
      const contactId = contactPersonId.toString();
      
      console.log(`\n📞 CONTACT PERSON ID: ${contactId}`);
      console.log(`   Length: ${contactId.length}`);
      console.log(`   Type: ${typeof contactId}`);
      
      // Test manual sorting (what we were doing before)
      const manualSort = [myPersonId, contactId].sort();
      console.log(`\n🔧 MANUAL SORT RESULT:`);
      console.log(`   Input: [${myPersonId.substring(0, 8)}..., ${contactId.substring(0, 8)}...]`);
      console.log(`   Sorted: [${manualSort[0].substring(0, 8)}..., ${manualSort[1].substring(0, 8)}...]`);
      console.log(`   Topic ID: ${manualSort.join('<->')}`);
      
      // Test JavaScript string comparison
      console.log(`\n📊 STRING COMPARISON:`);
      console.log(`   ${myPersonId.substring(0, 16)}... < ${contactId.substring(0, 16)}... = ${myPersonId < contactId}`);
      console.log(`   ${myPersonId.substring(0, 16)}... > ${contactId.substring(0, 16)}... = ${myPersonId > contactId}`);
      
      // Show what TopicModel.createOneToOneTopic should produce
      // (simulating the internal [from, to].sort().join('<->') logic)
      const topicModelSort = [myId.personId, contactPersonId].sort();
      const topicModelResult = topicModelSort.join('<->');
      console.log(`\n🏭 TOPIC MODEL SIMULATION:`);
      console.log(`   Input: [${myId.personId.toString().substring(0, 8)}..., ${contactPersonId.toString().substring(0, 8)}...]`);
      console.log(`   Sorted: [${topicModelSort[0].toString().substring(0, 8)}..., ${topicModelSort[1].toString().substring(0, 8)}...]`);
      console.log(`   Topic ID: ${topicModelResult}`);
      
      // Check if they match
      if (manualSort.join('<->') === topicModelResult) {
        console.log(`   ✅ MANUAL AND TOPIC MODEL MATCH`);
      } else {
        console.log(`   ⚠️ MISMATCH DETECTED!`);
        console.log(`      Manual: ${manualSort.join('<->')}`);
        console.log(`      TopicModel: ${topicModelResult}`);
      }
      
      // Actually test creating the topic to see what ID it gets
      console.log(`\n🎯 ACTUAL TOPIC CREATION TEST:`);
      try {
        const actualTopic = await appModel.topicModel.createOneToOneTopic(
          myId.personId,
          contactPersonId
        );
        console.log(`   Created topic ID: ${actualTopic.id}`);
        
        if (actualTopic.id === topicModelResult) {
          console.log(`   ✅ ACTUAL MATCHES SIMULATION`);
        } else {
          console.log(`   ⚠️ ACTUAL DOESN'T MATCH SIMULATION!`);
          console.log(`      Simulation: ${topicModelResult}`);
          console.log(`      Actual:     ${actualTopic.id}`);
        }
      } catch (topicError) {
        console.log(`   ❌ Topic creation failed: ${topicError.message}`);
      }
      
    } catch (contactError) {
      console.log(`❌ Error processing contact: ${contactError.message}`);
    }
  }
  
  console.log(`\n📋 DEVICE ${deviceId} SUMMARY:`);
  console.log(`Person ID: ${myPersonId}`);
  console.log(`Contacts tested: ${contacts.length}`);
  console.log(`\n🔬 COMPARE THIS OUTPUT WITH THE OTHER DEVICE!`);
}

// Export to global for easy debugging
(globalThis as any).debugPersonIdSorting = () => {
  const appModel = (globalThis as any).getAppModel?.();
  if (appModel) {
    debugPersonIdSorting(appModel);
  } else {
    console.log('❌ AppModel not available');
  }
};