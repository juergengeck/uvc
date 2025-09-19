/**
 * Extensions for ProfileModel
 * 
 * Extends the ProfileModel with additional methods for working with AI-related
 * person descriptions.
 */

import ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';

// Extend the ProfileModel type to include our new methods
declare module '@refinio/one.models/lib/models/Leute/ProfileModel.js' {
  interface ProfileModel {
    addAIPersonDescription(isAI: boolean, modelName: string): Promise<void>;
  }
}

/**
 * Add AIPersonDescription to a profile
 * 
 * This method creates an AIPersonDescription object, persists it independently,
 * and then adds a reference to the profile's personDescriptions array.
 * 
 * @param isAI - Whether this profile represents an AI assistant
 * @param modelName - Name of the associated LLM model
 */
ProfileModel.prototype.addAIPersonDescription = async function(isAI: boolean, modelName: string): Promise<void> {
  console.log(`[ProfileModel.addAIPersonDescription] Creating AIPersonDescription for profile ${this.idHash}`);
  
  try {
    // Create the AIPersonDescription object with proper structure
    const aiPersonDescription = {
      $type$: 'AIPersonDescription',
      isAI,
      modelName: modelName
    };
    
    // Store the AIPersonDescription as a versioned object
    console.log(`[ProfileModel.addAIPersonDescription] Storing AIPersonDescription object`);
    const result = await storeVersionedObject(aiPersonDescription);
    console.log(`[ProfileModel.addAIPersonDescription] AIPersonDescription stored with hash: ${result.hash}`);
    
    // Calculate the ID hash for reference
    const aiPersonDescriptionIdHash = await calculateIdHashOfObj(aiPersonDescription);
    console.log(`[ProfileModel.addAIPersonDescription] AIPersonDescription ID hash: ${aiPersonDescriptionIdHash}`);
    
    // Ensure personDescriptions array exists
    if (!this.personDescriptions) {
      this.personDescriptions = [];
    }
    
    // First remove any existing AIPersonDescription to avoid duplicates
    console.log(`[ProfileModel.addAIPersonDescription] Checking for existing AIPersonDescription references`);
    if (Array.isArray(this.personDescriptions)) {
      this.personDescriptions = this.personDescriptions.filter(desc => {
        // If it's an object reference, check its $type$
        if (typeof desc === 'object' && desc !== null && '$type$' in desc) {
          return desc.$type$ !== 'AIPersonDescription';
        }
        // Otherwise keep it (it's likely a hash reference)
        return true;
      });
    }
    
    // Add reference to the AIPersonDescription
    console.log(`[ProfileModel.addAIPersonDescription] Adding AIPersonDescription reference to profile`);
    // We add the object directly first, to ensure immediate representation
    this.personDescriptions.push(aiPersonDescription);
    
    // Save the profile to persist the reference
    console.log(`[ProfileModel.addAIPersonDescription] Saving profile to persist AIPersonDescription reference`);
    
    // IMPORTANT: Verify profile has actual content before saving
    const hasPersonDescriptions = Array.isArray(this.personDescriptions) && 
                                this.personDescriptions.length > 0;
    
    const hasCommunicationEndpoints = Array.isArray(this.communicationEndpoints) && 
                                     this.communicationEndpoints.length > 0;
    
    const hasData = this.data && Object.keys(this.data).length > 0;
    
    if (!hasPersonDescriptions && !hasCommunicationEndpoints && !hasData) {
      const errorMsg = `Cannot save empty profile object with ID: ${this.idHash} - no descriptions, endpoints, or data found`;
      console.error(`[ProfileModel.addAIPersonDescription] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    await this.saveAndLoad();
    
    console.log(`[ProfileModel.addAIPersonDescription] AIPersonDescription added successfully`);
  } catch (error) {
    console.error(`[ProfileModel.addAIPersonDescription] Error adding AIPersonDescription:`, error);
    throw new Error(`Failed to add AIPersonDescription: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export {}; 