/**
 * Debug topic ID creation to understand why devices might create different topic IDs
 */

import type { AppModel } from '../models/AppModel';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

export async function debugTopicIds(appModel: AppModel): Promise<void> {
  console.log('\n🔍 TOPIC ID CREATION DEBUG\n');
  
  // Get device info
  const myId = await appModel.leuteModel.myMainIdentity();
  const deviceId = myId.personId.substring(0, 8);
  console.log(`📱 DEVICE: ${deviceId}`);
  console.log(`📱 FULL PERSON ID: ${myId.personId}`);
  
  // Get all contacts
  const contacts = await appModel.leuteModel.others();
  console.log(`\n👥 CONTACTS: ${contacts.length} found`);
  
  for (const contact of contacts) {
    try {
      const contactPersonId = await contact.mainIdentity();
      const contactId = contactPersonId.toString().substring(0, 8);
      
      console.log(`\n📞 CONTACT: ${contactId}...`);
      console.log(`   Full Person ID: ${contactPersonId}`);
      
      // Show what the topic ID SHOULD be (manually sorted)
      const manualSort = [myId.personId, contactPersonId].sort();
      const expectedTopicId = manualSort.join('<->');
      console.log(`   Expected topic ID: ${expectedTopicId}`);
      
      // Check if topic exists in registry
      try {
        const existingTopic = await appModel.topicModel.topics.queryById(expectedTopicId);
        if (existingTopic) {
          console.log(`   ✅ Topic exists in registry: ${existingTopic.id}`);
          console.log(`   Topic name: ${existingTopic.name || 'undefined'}`);
          
          // Check if we can enter the topic room
          try {
            const room = await appModel.topicModel.enterTopicRoom(existingTopic.id);
            console.log(`   ✅ Can enter topic room`);
            
            // Get message count
            const messages = await room.getLatestMessages(100);
            console.log(`   📨 Messages in topic: ${messages.length}`);
          } catch (roomError) {
            console.log(`   ❌ Cannot enter topic room: ${roomError.message}`);
          }
        } else {
          console.log(`   ❌ Topic NOT found in registry`);
          
          // Try to create it and see what happens
          console.log(`   🔨 Attempting to create topic...`);
          try {
            const newTopic = await appModel.topicModel.createOneToOneTopic(
              myId.personId,
              contactPersonId
            );
            console.log(`   ✅ Created topic: ${newTopic.id}`);
            console.log(`   Topic name: ${newTopic.name || 'undefined'}`);
            
            // Verify it matches expected ID
            if (newTopic.id === expectedTopicId) {
              console.log(`   ✅ Topic ID matches expected value`);
            } else {
              console.log(`   ⚠️ Topic ID MISMATCH!`);
              console.log(`      Expected: ${expectedTopicId}`);
              console.log(`      Actual:   ${newTopic.id}`);
            }
          } catch (createError) {
            console.log(`   ❌ Failed to create topic: ${createError.message}`);
          }
        }
      } catch (queryError) {
        console.log(`   ❌ Error querying topic: ${queryError.message}`);
      }
      
      // Check if there are any other topics that might match this contact
      console.log(`   🔍 Searching for any topics containing this contact's ID...`);
      try {
        const allTopics = await appModel.topicModel.topics.all();
        const matchingTopics = allTopics.filter(topic => 
          topic.id.includes(contactPersonId.toString().substring(0, 8)) ||
          topic.id.includes(contactPersonId.toString())
        );
        
        if (matchingTopics.length > 0) {
          console.log(`   Found ${matchingTopics.length} potentially matching topics:`);
          matchingTopics.forEach(topic => {
            console.log(`     - ${topic.id}`);
          });
        } else {
          console.log(`   No topics found containing this contact's ID`);
        }
      } catch (allTopicsError) {
        console.log(`   Error searching all topics: ${allTopicsError.message}`);
      }
      
    } catch (contactError) {
      console.log(`❌ Error processing contact: ${contactError.message}`);
    }
  }
  
  console.log(`\n📋 SUMMARY FOR DEVICE ${deviceId}:`);
  console.log(`My Person ID: ${myId.personId}`);
  console.log(`Contacts: ${contacts.length}`);
  console.log(`\nRun this on BOTH devices to compare topic IDs!`);
}

// Export to global for easy debugging
(globalThis as any).debugTopicIds = () => {
  const appModel = (globalThis as any).getAppModel?.();
  if (appModel) {
    debugTopicIds(appModel);
  } else {
    console.log('❌ AppModel not available');
  }
};