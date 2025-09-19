/**
 * Utility to clean up duplicate LLM contacts
 * This fixes the issue where the same LLM model has multiple Person objects
 * and corresponding Someone objects due to inconsistent Person creation.
 */

import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { getPersonIdForLLM, normalizeModelNameToEmail } from './contactUtils';

interface DuplicateContact {
  modelName: string;
  normalizedEmail: string;
  canonicalPersonId: SHA256IdHash<Person>;
  duplicatePersonIds: SHA256IdHash<Person>[];
  duplicateSomeoneIds: string[];
}

/**
 * Identifies and removes duplicate LLM contacts, keeping only the canonical one
 */
export async function cleanupDuplicateLLMContacts(
  leuteModel: LeuteModel
): Promise<{ cleaned: number; preserved: number }> {
  console.log('[cleanupDuplicateLLMContacts] Starting cleanup...');
  
  if (!leuteModel || leuteModel.state?.currentState !== 'Initialised') {
    throw new Error('LeuteModel must be initialized');
  }

  try {
    // Get all existing contacts
    const allContacts = await leuteModel.others();
    console.log(`[cleanupDuplicateLLMContacts] Found ${allContacts.length} total contacts`);

    // Group contacts by model name (detected from display name pattern)
    const llmContactGroups = new Map<string, Array<{
      someone: any;
      personId: SHA256IdHash<Person>;
      displayName: string;
    }>>();

    // Identify LLM contacts and group them
    for (const someone of allContacts) {
      try {
        const personId = await someone.mainIdentity();
        if (!personId) continue;

        const profile = await someone.mainProfile();
        let displayName = 'Unknown';
        
        if (profile?.personDescriptions?.length > 0) {
          const nameDesc = profile.personDescriptions.find((d: any) => 
            d.$type$ === 'PersonName' && d.name
          );
          if (nameDesc?.name) {
            displayName = nameDesc.name;
          }
        }

        // Check if this looks like an LLM contact
        const isLLMPattern = displayName.includes('(AI)') || 
                           displayName.includes('LLM') ||
                           displayName.includes('Q4_K_M');
        
        if (isLLMPattern) {
          // Extract model name from display name
          const modelName = displayName.replace(' (AI)', '').trim();
          
          if (!llmContactGroups.has(modelName)) {
            llmContactGroups.set(modelName, []);
          }
          
          llmContactGroups.get(modelName)!.push({
            someone,
            personId,
            displayName
          });
        }
      } catch (error) {
        console.warn('[cleanupDuplicateLLMContacts] Error processing contact:', error);
      }
    }

    console.log(`[cleanupDuplicateLLMContacts] Found ${llmContactGroups.size} LLM model groups`);

    let cleanedCount = 0;
    let preservedCount = 0;

    // Process each LLM model group
    for (const [modelName, contacts] of llmContactGroups) {
      if (contacts.length <= 1) {
        preservedCount += contacts.length;
        console.log(`[cleanupDuplicateLLMContacts] Model ${modelName}: ${contacts.length} contact (no duplicates)`);
        continue;
      }

      console.log(`[cleanupDuplicateLLMContacts] Model ${modelName}: Found ${contacts.length} duplicate contacts`);

      try {
        // Get the canonical Person ID that should be used for this model
        const canonicalPersonId = await getPersonIdForLLM(modelName);
        if (!canonicalPersonId) {
          console.warn(`[cleanupDuplicateLLMContacts] Could not determine canonical Person ID for ${modelName}`);
          continue;
        }

        // Find which contact has the canonical Person ID
        const canonicalContact = contacts.find(c => c.personId === canonicalPersonId);
        const duplicateContacts = contacts.filter(c => c.personId !== canonicalPersonId);

        if (canonicalContact) {
          console.log(`[cleanupDuplicateLLMContacts] Model ${modelName}: Preserving canonical contact ${canonicalContact.someone.idHash}`);
          preservedCount++;
        } else {
          console.log(`[cleanupDuplicateLLMContacts] Model ${modelName}: No canonical contact found, preserving first one`);
          preservedCount++;
        }

        // Remove duplicate contacts from the address book
        for (const duplicate of duplicateContacts) {
          try {
            console.log(`[cleanupDuplicateLLMContacts] Model ${modelName}: Removing duplicate Someone ${duplicate.someone.idHash}`);
            await leuteModel.removeSomeoneElse(duplicate.someone.idHash);
            cleanedCount++;
          } catch (error) {
            console.warn(`[cleanupDuplicateLLMContacts] Failed to remove duplicate Someone ${duplicate.someone.idHash}:`, error);
          }
        }

      } catch (error) {
        console.error(`[cleanupDuplicateLLMContacts] Error processing model ${modelName}:`, error);
      }
    }

    console.log(`[cleanupDuplicateLLMContacts] Cleanup complete: ${cleanedCount} duplicates removed, ${preservedCount} contacts preserved`);
    
    return { cleaned: cleanedCount, preserved: preservedCount };

  } catch (error) {
    console.error('[cleanupDuplicateLLMContacts] Cleanup failed:', error);
    throw error;
  }
}

/**
 * Quick check to see if there are duplicate LLM contacts
 */
export async function checkForDuplicateLLMContacts(
  leuteModel: LeuteModel
): Promise<{ hasDuplicates: boolean; duplicateCount: number }> {
  if (!leuteModel) {
    return { hasDuplicates: false, duplicateCount: 0 };
  }

  try {
    const allContacts = await leuteModel.others();
    const llmModelNames = new Set<string>();
    let totalLLMContacts = 0;

    for (const someone of allContacts) {
      try {
        const profile = await someone.mainProfile();
        let displayName = 'Unknown';
        
        if (profile?.personDescriptions?.length > 0) {
          const nameDesc = profile.personDescriptions.find((d: any) => 
            d.$type$ === 'PersonName' && d.name
          );
          if (nameDesc?.name) {
            displayName = nameDesc.name;
          }
        }

        const isLLMPattern = displayName.includes('(AI)');
        if (isLLMPattern) {
          const modelName = displayName.replace(' (AI)', '').trim();
          llmModelNames.add(modelName);
          totalLLMContacts++;
        }
      } catch (error) {
        // Ignore errors during check
      }
    }

    const duplicateCount = totalLLMContacts - llmModelNames.size;
    return {
      hasDuplicates: duplicateCount > 0,
      duplicateCount
    };

  } catch (error) {
    console.warn('[checkForDuplicateLLMContacts] Check failed:', error);
    return { hasDuplicates: false, duplicateCount: 0 };
  }
}