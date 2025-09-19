/**
 * Debug script to print all contacts from the LeuteModel
 * 
 * This script can be imported and run from anywhere in the app where
 * the AppModel is available.
 */

export async function showContacts(appModel) {
  console.log('===== DEBUG: CONTACTS LIST =====');
  if (!appModel) {
    console.error('AppModel not available, cannot show contacts');
    return;
  }

  try {
    const leuteModel = appModel.leuteModel;
    if (!leuteModel) {
      console.error('LeuteModel not available, cannot show contacts');
      return;
    }

    // Log LeuteModel properties to understand its structure
    console.log('[DEBUG] LeuteModel object inspection:');
    console.log('[DEBUG] Type:', typeof leuteModel);
    console.log('[DEBUG] Constructor name:', leuteModel.constructor ? leuteModel.constructor.name : 'unknown');
    console.log('[DEBUG] Available methods:', Object.getOwnPropertyNames(leuteModel.__proto__ || {}).filter(prop => typeof leuteModel[prop] === 'function'));
    
    // Try different methods to get contacts since LeuteModel API may vary
    let contactIds = [];
    let retrievalMethod = '';
    
    // Method 1: getContacts()
    if (typeof leuteModel.getContacts === 'function') {
      try {
        contactIds = await leuteModel.getContacts();
        retrievalMethod = 'getContacts()';
        console.log(`[DEBUG] Retrieved contacts using getContacts(): ${contactIds.length} contacts`);
      } catch (error) {
        console.log('[DEBUG] getContacts() failed:', error.message);
      }
    } else {
      console.log('[DEBUG] leuteModel.getContacts is not a function');
    }
    
    // Method 2: Try others() - this is used in some implementations
    if (contactIds.length === 0 && typeof leuteModel.others === 'function') {
      try {
        const others = await leuteModel.others();
        contactIds = others.map(someone => someone.personId);
        retrievalMethod = 'others()';
        console.log(`[DEBUG] Retrieved contacts using others(): ${contactIds.length} contacts`);
      } catch (error) {
        console.log('[DEBUG] others() failed:', error.message);
      }
    }
    
    // Method 3: contacts property
    if (contactIds.length === 0 && leuteModel.contacts && Array.isArray(leuteModel.contacts)) {
      contactIds = leuteModel.contacts;
      retrievalMethod = 'contacts property';
      console.log(`[DEBUG] Retrieved contacts from contacts property: ${contactIds.length} contacts`);
    }
    
    // Method 4: Try _contacts property (internal implementation detail)
    if (contactIds.length === 0 && leuteModel._contacts && Array.isArray(leuteModel._contacts)) {
      contactIds = leuteModel._contacts;
      retrievalMethod = '_contacts property';
      console.log(`[DEBUG] Retrieved contacts from _contacts property: ${contactIds.length} contacts`);
    }

    console.log(`[DEBUG] Found ${contactIds.length} contacts using ${retrievalMethod}`);

    if (contactIds.length === 0) {
      console.log('[DEBUG] No contacts found. Checking direct model structure:');
      console.log('[DEBUG] Keys:', Object.keys(leuteModel));
      // Check for any property that might be an array of contacts
      for (const key of Object.keys(leuteModel)) {
        const value = leuteModel[key];
        if (Array.isArray(value)) {
          console.log(`[DEBUG] Array property "${key}" contains ${value.length} items`);
          if (value.length > 0) {
            console.log(`[DEBUG] First item sample:`, value[0]);
          }
        }
      }
    }

    // Print details for each contact
    for (let i = 0; i < contactIds.length; i++) {
      const personId = contactIds[i];
      console.log(`[DEBUG] Contact ${i + 1}/${contactIds.length} - PersonId: ${personId}`);
      
      try {
        // Try to get the Someone object for this person
        let someone;
        if (typeof leuteModel.getSomeone === 'function') {
          someone = await leuteModel.getSomeone(personId);
          console.log(`[DEBUG] Retrieved someone using getSomeone()`);
        } else if (typeof leuteModel.get === 'function') {
          someone = await leuteModel.get(personId);
          console.log(`[DEBUG] Retrieved someone using get()`);
        }
        
        if (someone) {
          console.log(`[DEBUG] Someone found for person ${personId}:`);
          console.log(`[DEBUG]   - SomeoneId: ${someone.idHash}`);
          console.log(`[DEBUG]   - PersonId: ${someone.personId}`);
          
          // Log all properties of Someone
          console.log(`[DEBUG]   - Someone properties:`, Object.keys(someone));
          console.log(`[DEBUG]   - Someone methods:`, Object.getOwnPropertyNames(someone.__proto__ || {}).filter(prop => typeof someone[prop] === 'function'));
          
          // Get profile
          let profile;
          if (typeof someone.mainProfile === 'function') {
            profile = await someone.mainProfile();
          } else if (someone.profiles && someone.profiles.length > 0) {
            profile = someone.profiles[0];
          }
          
          if (profile) {
            console.log(`[DEBUG]   - Profile: ${profile.idHash}`);
            console.log(`[DEBUG]   - Profile properties:`, Object.keys(profile));
            
            // Get name
            let names = [];
            if (typeof profile.descriptionsOfType === 'function') {
              names = profile.descriptionsOfType('PersonName');
            } else if (profile.personDescriptions && Array.isArray(profile.personDescriptions)) {
              names = profile.personDescriptions.filter(desc => desc.$type$ === 'PersonName');
            }
            
            if (names && names.length > 0) {
              console.log(`[DEBUG]   - Name: ${names[0].name}`);
            }
            
            // Get email
            let emails = [];
            if (typeof profile.getCommunicationEndpointsWithType === 'function') {
              emails = await profile.getCommunicationEndpointsWithType('Email');
            } else if (profile.communicationEndpoints && Array.isArray(profile.communicationEndpoints)) {
              emails = profile.communicationEndpoints.filter(endpoint => endpoint.$type$ === 'Email');
            }
            
            if (emails && emails.length > 0) {
              console.log(`[DEBUG]   - Email: ${emails[0].address}`);
            }
            
            // Check if it's an AI
            let isAI = false;
            if (typeof profile.getDataField === 'function') {
              isAI = await profile.getDataField('isAI');
            } else if (profile.dataFields && profile.dataFields.isAI !== undefined) {
              isAI = profile.dataFields.isAI;
            }
            
            console.log(`[DEBUG]   - Is AI: ${isAI ? 'Yes' : 'No'}`);
            
            if (isAI) {
              let llmId;
              if (typeof profile.getDataField === 'function') {
                llmId = await profile.getDataField('llm');
              } else if (profile.dataFields && profile.dataFields.llm !== undefined) {
                llmId = profile.dataFields.llm;
              }
              
              if (llmId) {
                console.log(`[DEBUG]   - LLM ID: ${llmId}`);
              }
            }
          } else {
            console.log(`[DEBUG]   - No profile found`);
          }
        } else {
          console.log(`[DEBUG] No Someone found for person ${personId}`);
          console.log(`[DEBUG] This may indicate a bug in the relationship between Person and Someone`);
        }
      } catch (error) {
        console.error(`[DEBUG] Error retrieving contact details for ${personId}:`, error);
      }
      
      console.log('---');
    }
    
    console.log('===== DEBUG: END CONTACTS LIST =====');
  } catch (error) {
    console.error('[DEBUG] Error getting contacts:', error);
  }
}

/**
 * Inspect the internal Leute object structure 
 * This function looks directly at the internal leute object which contains
 * the contact list that should be persisted
 */
export async function inspectLeuteObject(appModel) {
  console.log('===== DEBUG: LEUTE OBJECT INSPECTION =====');
  if (!appModel || !appModel.leuteModel) {
    console.error('AppModel or LeuteModel not available');
    return;
  }

  try {
    // Access the internal leute object
    const leuteObj = appModel.leuteModel.leute;
    
    if (!leuteObj) {
      console.error('[DEBUG] Internal leute object not found!');
      console.log('[DEBUG] Available properties on leuteModel:', Object.keys(appModel.leuteModel));
      return;
    }
    
    console.log('[DEBUG] Leute object found:');
    console.log('[DEBUG] $type$:', leuteObj.$type$);
    console.log('[DEBUG] appId:', leuteObj.appId);
    console.log('[DEBUG] me:', leuteObj.me);
    
    // Check other array which should contain contacts
    if (Array.isArray(leuteObj.other)) {
      console.log('[DEBUG] other.length:', leuteObj.other.length);
      console.log('[DEBUG] other items:', leuteObj.other);
    } else {
      console.log('[DEBUG] other property is not an array:', leuteObj.other);
    }
    
    // Check group array
    if (Array.isArray(leuteObj.group)) {
      console.log('[DEBUG] group.length:', leuteObj.group.length);
    } else {
      console.log('[DEBUG] group property is not an array:', leuteObj.group);
    }
    
    // Check storage mechanism
    console.log('[DEBUG] Checking if leute object has been stored:');
    if (leuteObj.idHash) {
      console.log('[DEBUG] Leute object has idHash:', leuteObj.idHash);
    } else {
      console.log('[DEBUG] Leute object does not have idHash');
    }
    
    // Check if the Leute object has been saved
    console.log('[DEBUG] Checking for save methods:');
    const leuteModel = appModel.leuteModel;
    if (typeof leuteModel.save === 'function') {
      console.log('[DEBUG] LeuteModel has save() method');
    } else if (typeof leuteModel._save === 'function') {
      console.log('[DEBUG] LeuteModel has _save() method');
    } else if (typeof leuteModel.saveLeute === 'function') {
      console.log('[DEBUG] LeuteModel has saveLeute() method');
    } else {
      console.log('[DEBUG] No obvious save method found on LeuteModel');
    }
    
    console.log('===== DEBUG: END LEUTE OBJECT INSPECTION =====');
  } catch (error) {
    console.error('[DEBUG] Error inspecting leute object:', error);
  }
}

// Enhanced helper function to run from the global context in development
export function runFromGlobal() {
  if (global.appModelInstance) {
    showContacts(global.appModelInstance);
    inspectLeuteObject(global.appModelInstance);
  } else {
    console.error('No global appModelInstance found, cannot show contacts');
  }
} 