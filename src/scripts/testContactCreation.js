#!/usr/bin/env node

/**
 * Test Contact Creation Script
 * 
 * This script tests manual contact creation for debugging pairing issues.
 */

import { ModelService } from '../services/ModelService.js';
import { getPairingService } from '../services/PairingService.js';

async function testContactCreation() {
  console.log('🧪 [TestContactCreation] Starting contact creation test...');
  
  try {
    // Get the app model
    const appModel = ModelService.getModel();
    if (!appModel) {
      console.error('❌ [TestContactCreation] AppModel not available');
      return false;
    }
    
    console.log('✅ [TestContactCreation] AppModel available');
    
    // Get PairingService
    const pairingService = getPairingService();
    console.log('✅ [TestContactCreation] PairingService available');
    
    // Test with the Person ID detected in the logs
    const detectedPersonId = '92a01d9854be91fb720721eff51bf7d8d3e978c32c6f4ff38ca6a2fd2e4bc750';
    console.log(`🎯 [TestContactCreation] Testing contact creation for Person ID: ${detectedPersonId.slice(0, 8)}...`);
    
    // Try manual contact creation
    const result = await pairingService.createContactForPersonId(detectedPersonId);
    
    if (result) {
      console.log('🎉 [TestContactCreation] ✅ Contact creation succeeded!');
      
      // Verify the contact was created
      if (appModel.leuteModel) {
        try {
          const contact = await appModel.leuteModel.getSomeone(detectedPersonId);
          if (contact) {
            console.log('✅ [TestContactCreation] Contact verification successful - contact exists');
          } else {
            console.log('⚠️ [TestContactCreation] Contact creation reported success but contact not found');
          }
        } catch (verifyError) {
          console.error('❌ [TestContactCreation] Error verifying contact:', verifyError);
        }
      }
    } else {
      console.log('❌ [TestContactCreation] Contact creation failed');
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ [TestContactCreation] Error during test:', error);
    return false;
  }
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testContactCreation()
    .then(result => {
      console.log(`🏁 [TestContactCreation] Test completed with result: ${result}`);
      process.exit(result ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 [TestContactCreation] Test failed with error:', error);
      process.exit(1);
    });
}

export { testContactCreation }; 