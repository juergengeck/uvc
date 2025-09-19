import type { ProfileModel } from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import type AIAssistantModel from '../../models/ai/assistant/AIAssistantModel';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

/**
 * Safely check if a profile belongs to an AI assistant
 * Handles error cases and initialization states gracefully
 * @param profile The profile to check
 * @param aiAssistant The AI assistant model instance
 * @returns Promise resolving to true if the profile belongs to an AI assistant, false otherwise
 */
export const isAIProfileAsync = async (
  profile: ProfileModel, 
  aiAssistant?: AIAssistantModel
): Promise<boolean> => {
  try {
    // If no AI assistant or profile, it's not an AI
    if (!aiAssistant || !profile) {
      return false;
    }
    
    // Check if AI assistant is ready
    if (aiAssistant.isReady && typeof aiAssistant.isReady === 'function') {
      const isReady = aiAssistant.isReady();
      if (!isReady) {
        console.log('[isAIProfileAsync] AIAssistantModel not ready');
        return false;
      }
    }
    
    // Get profile ID and person ID
    const profileId = profile.idHash;
    let personId: SHA256IdHash<Person> | undefined;
    
    try {
      // Try to get personId from the profile if available
      if ((profile as any).personId) {
        personId = (profile as any).personId;
      } else if (profile.person) {
        personId = typeof profile.person === 'string' ? profile.person : profile.person.idHash;
      }
    } catch (error) {
      console.warn('[isAIProfileAsync] Error getting personId from profile:', error);
    }
    
    // Check Person ID first (most direct method)
    if (personId) {
      try {
        // First try synchronous method for speed
        const isPersonAI = aiAssistant.isAIContact(personId);
        if (isPersonAI) return true;
        
        // Then fall back to async method for more thorough check
        const isPersonAIAsync = await aiAssistant.isAIContactAsync(personId);
        if (isPersonAIAsync) return true;
      } catch (error) {
        console.warn(`[isAIProfileAsync] Error checking person ID ${personId}:`, error);
      }
    }
    
    // Then check profile ID
    if (profileId) {
      try {
        // First try synchronous method for speed
        const isProfileAI = aiAssistant.isAIContact(profileId);
        if (isProfileAI) return true;
        
        // Then fall back to async method for more thorough check
        const isProfileAIAsync = await aiAssistant.isAIContactAsync(profileId);
        if (isProfileAIAsync) return true;
      } catch (error) {
        console.warn(`[isAIProfileAsync] Error checking profile ID ${profileId}:`, error);
      }
    }
    
    // Try to detect AI nature from profile data if available
    try {
      // Check profile descriptors for AI metadata
      if (profile.descriptors && Array.isArray(profile.descriptors)) {
        for (const descriptor of profile.descriptors) {
          if (!descriptor) continue;
          
          // Check for PersonStatus with AI metadata
          if (descriptor.$type$ === 'PersonStatus' && descriptor.value) {
            try {
              const statusValue = JSON.parse(descriptor.value);
              if (statusValue && (statusValue.isAI === true || statusValue.type === 'llm')) {
                return true;
              }
            } catch (e) {
              // Just continue if we can't parse this value
            }
          }
          
          // Check for OrganisationName with AI indicators
          if (descriptor.$type$ === 'OrganisationName' && descriptor.name) {
            const orgName = descriptor.name.toLowerCase();
            if (orgName.includes('ai model') || orgName.includes('assistant') || 
                orgName.includes('llm') || orgName.includes('language model')) {
              return true;
            }
          }
        }
      }
      
      // Check profile data directly
      const profileData = (profile as any).data;
      if (profileData) {
        // Check explicit isAI flag
        if (profileData.isAI === true) {
          return true;
        }
        
        // Check for LLM data
        if (profileData.llm || profileData.modelName || profileData.architecture || 
            profileData.modelType || profileData.isAIAssistant) {
          return true;
        }
        
        // Check for AI in the name
        const nameCheck = profileData.name || profileData.firstName || '';
        if (typeof nameCheck === 'string') {
          const normalizedName = nameCheck.toLowerCase();
          if (normalizedName.includes('gpt') || normalizedName.includes('ai assistant') || 
              normalizedName.includes('llama') || normalizedName.includes('claude') ||
              normalizedName.includes('llm') || normalizedName.includes('deepseek') ||
              normalizedName.includes('mistral') || normalizedName.includes('model')) {
            return true;
          }
        }
      }
    } catch (error) {
      console.warn('[isAIProfileAsync] Error checking profile data:', error);
    }
    
    return false;
  } catch (error) {
    console.error('[isAIProfileAsync] Error checking if profile is AI:', error);
    return false;
  }
}; 