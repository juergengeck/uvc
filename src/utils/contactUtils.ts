/**
 * Contact Utilities
 * 
 * Core utility functions for working with contacts in the ONE system.
 */

import { ModelService } from '../services/ModelService';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { ensureIdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { storeVersionedObject, getObjectByIdHash } from '@refinio/one.core/lib/storage-versioned-objects.js';
import type { Person, Recipe } from '@refinio/one.core/lib/recipes.js';
import type { LLM } from '../types/llm';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';
import type { PersonDescriptionTypes, PersonStatus } from '@refinio/one.models/lib/recipes/Leute/PersonDescriptions.js';
import objectEvents from '@refinio/one.models/lib/misc/ObjectEventDispatcher';
import type { OneVersionedObjectInterfaces } from '@OneObjectInterfaces';
import type { Profile } from '@refinio/one.models/lib/recipes/Leute/Profile.js';
import { AppModel } from '../models/AppModel';
import { getInstanceOwnerIdHash } from '@refinio/one.core/lib/instance.js';
import TopicRoom from '@refinio/one.models/lib/models/Chat/TopicRoom.js';
import { LLMManager } from '../models/ai/LLMManager';
import type { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import messageBusUtils, { debugLog } from '../utils/message-bus';
import { StorageStreams } from '@refinio/one.core/lib/system/expo/storage-streams-impl';

// Temporarily remove problematic imports that cause circular references or path issues
// In a production environment, these should be properly defined using the right paths

// Define minimal interfaces for the models we're working with
interface IChannelManager {
  createChannel(channelId: string, owner?: any): Promise<any>;
  getObjects(options: any): Promise<any[]>;
  postToChannel(channelId: string, data: any, channelOwner?: any, timestamp?: number, author?: any): Promise<void>;
  onUpdated: OEvent<(
    channelInfoIdHash: string,
    channelId: string,
    channelOwner: string | null,
    timeOfEarliestChange: Date,
    changedElements: Array<any>
  ) => void>;
}

interface TopicId {
  id?: string;
  idHash?: string;
  type?: string;
  hash?: string;
}

// Interface for the TopicModel with createGroupTopic method
interface TopicModelWithCreateGroupTopic extends TopicModel {
  createGroupTopic(topicName: string, topicId?: string, channelOwner?: string): Promise<any>;
}

/**
 * Contact utility functions
 * 
 * This file contains utility functions for working with contacts, including:
 * - Creating contacts from LLMs
 * - Creating topics for LLMs
 * - Getting person IDs for LLMs
 * - Normalizing email addresses and model names
 * 
 * IMPORTANT TYPE MISMATCH NOTES:
 * There's a significant mismatch between TypeScript definitions and runtime objects.
 * The ProfileModel definition doesn't match the actual structure of runtime Profile objects.
 * TypeScript errors include:
 * 1. ProfileModel types missing 'data' property that exists at runtime
 * 2. ProfileModel types missing 'name' property that exists at runtime
 * 3. personDescriptions array type mismatch with PersonDescriptionTypes[]
 * 
 * Using @ts-nocheck to bypass TypeScript limitations while preserving runtime behavior.
 * The code works correctly at runtime despite TypeScript errors.
 */

/**
 * Options for contact creation
 */
export interface CreateContactOptions {
  /** Display name for the contact */
  displayName?: string;
  /** Whether this is an AI contact */
  isAI?: boolean;
  /** LLM data for AI contacts */
  llmData?: {
    /** LLM model name */
    name?: string;
    /** LLM provider */
    provider?: string;
    /** LLM type */
    type?: string;
    /** Any additional data */
    [key: string]: any;
  };
}

/**
 * Result of contact creation
 */
export interface CreateContactResult {
  /** ID of the Person object */
  personId: SHA256IdHash<Person>;
  /** ID of the Someone object */
  someoneId: string;
  /** ID of the Profile object */
  profileId: string;
  /** The Profile object itself */
  profile: any;
}

/**
 * Sanitize a topic name and validate it exists
 * @throws {Error} If name is undefined, empty, or contains only whitespace
 */
function sanitizeTopicName(name: string | undefined): string {
  if (typeof name !== 'string') {
    throw new Error(`Topic name must be a string, got ${typeof name}`);
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Topic name cannot be empty or only whitespace');
  }
  return trimmed;
}

/**
 * Generate a topic ID from a name
 * @param name The name to generate a topic ID from
 * @returns A slugified version of the name for use as a topic ID
 */
function generateTopicId(name: string): string {
  return name.toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Slugify a model name consistently for use in IDs and emails
 * This is the CANONICAL way to slugify model names in the system.
 * ALL code paths MUST use this function to ensure content-addressing works.
 * 
 * @param modelName The model name to slugify
 * @returns Consistently slugified name
 */
export function slugifyModelName(modelName: string): string {
  // Convert to lowercase
  // Replace ALL non-alphanumeric characters (including periods, underscores, etc.) with hyphens
  // Replace multiple consecutive hyphens with a single hyphen
  // Remove leading/trailing hyphens
  return modelName.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Normalize a model name to an email address format
 * This ensures consistent email generation for model names
 * 
 * @param modelName The model name to normalize
 * @returns Normalized email address
 */
export function normalizeModelNameToEmail(modelName: string): string {
  return `${slugifyModelName(modelName)}@llama.local`;
}


/**
 * Normalize an email address or model name to a consistent format
 * This function standardizes either emails or model names to be used
 * as identifiers in the contact system
 * 
 * @param emailOrModelName Email address or model name
 * @returns Normalized email or model name
 */
export function normalizeEmailOrModelName(emailOrModelName: string): string {
  // Clean up input
  console.log(`[DEBUG:normalizeEmailOrModelName] Input: "${emailOrModelName}"`);
  const input = (emailOrModelName || '').trim();
  
  // If it's already a valid email address, return it normalized
  if (input.includes('@')) {
    const normalized = input.toLowerCase();
    console.log(`[DEBUG:normalizeEmailOrModelName] Already email, normalized: "${normalized}"`);
    return normalized;
  }
  
  // For model names, use the CANONICAL email normalization function
  // This ensures consistency with getPersonIdForLLM
  return normalizeModelNameToEmail(input);
}

/**
 * Get the Person ID for an email address
 * 
 * @param email Email address
 * @returns The SHA256 hash of the Person ID
 */
export async function getPersonIdByEmail(email: string): Promise<SHA256IdHash<Person>> {
  const normalizedEmail = email.toLowerCase().trim();
  return await calculateIdHashOfObj({ $type$: 'Person', email: normalizedEmail }) as SHA256IdHash<Person>;
}

/**
 * Get Person ID for a model name or email
 * 
 * @param emailOrModelName Email or model name
 * @returns The SHA256 hash of the Person ID
 */
export async function getPersonIdByEmailOrModelName(emailOrModelName: string): Promise<SHA256IdHash<Person>> {
  const normalizedEmail = normalizeEmailOrModelName(emailOrModelName);
  return await calculateIdHashOfObj({ $type$: 'Person', email: normalizedEmail }) as SHA256IdHash<Person>;
}

interface PersonWithEmail extends Person {
  email: string;
  name: string;
}

interface SomeoneInterface extends Someone {
  idHash: SHA256IdHash<Someone>;
  personId: SHA256IdHash<Person>;
  mainProfile: SHA256IdHash<Profile>;
  identities: Map<SHA256IdHash<Person>, Set<SHA256IdHash<Profile>>>;
}

/**
 * Validates if a string is a valid SHA256 hash
 */
function isValidSHA256(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash);
}

/**
 * Validates if a hash is a valid SHA256IdHash for a specific type
 * Uses one.core's ensureIdHash under the hood for consistent validation
 */
function isValidIdHashForType<T>(hash: string | undefined, type: string): hash is SHA256IdHash<T> {
  if (!hash) return false;
  try {
    ensureIdHash(hash);
    return true;
  } catch (error) {
    console.warn(`[isValidIdHashForType] Invalid hash format for type ${type}: ${hash}`, error);
    return false;
  }
}

/**
 * Validates if an object is a valid Person with required fields
 */
function isValidPerson(obj: any): obj is PersonWithEmail {
  return obj && 
    obj.$type$ === 'Person' &&
    typeof obj.email === 'string' &&
    typeof obj.name === 'string';
}

/**
 * Type guard to check if a value is a valid SHA256IdHash (opaque type)
 */
function isValidSHA256IdHash<T>(value: unknown): value is SHA256IdHash<T> {
  // Reverted to basic string check as import failed
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

/**
 * Creates a basic Person object structure for a given model name.
 */
export function createPersonObject(modelName: string): PersonWithEmail {
  return {
    $type$: 'Person',
    email: normalizeModelNameToEmail(modelName), // Use canonical email
    name: `${modelName} (AI)` // Default naming convention
  };
}

/**
 * Calculates the Person ID hash for a Person object structure.
 */
async function createPersonIdHash(person: PersonWithEmail): Promise<SHA256IdHash<Person> | undefined> {
  try {
    const personId = await calculateIdHashOfObj(person) as SHA256IdHash<Person>;
    if (!isValidSHA256IdHash<Person>(personId)) {
      throw new Error('Calculated Person ID is not a valid SHA256IdHash<Person>');
    }
    return personId;
  } catch (error) {
    console.error(`[createPersonIdHash] Failed to calculate Person ID hash:`, error);
    return undefined;
  }
}

/**
 * Get the Person ID for an LLM model name or LLM object.
 * Ensures the Person object exists in storage.
 * @param modelNameOrLLM The LLM model name (string) or LLM object
 * @returns The Person ID hash, or undefined if creation/retrieval failed
 */
export async function getPersonIdForLLM(modelNameOrLLM: string | LLM): Promise<SHA256IdHash<Person> | undefined> {
    const modelName = typeof modelNameOrLLM === 'string' ? modelNameOrLLM : modelNameOrLLM.name;
    if (!modelName) {
    console.warn('[getPersonIdForLLM] Model name is required.');
      return undefined;
    }

  try {
    // 1. Create the deterministic Person object structure
    const personObject = createPersonObject(modelName);

    // 2. Calculate the deterministic Person ID hash
    const personId = await createPersonIdHash(personObject);
    if (!personId) {
      // Error already logged in createPersonIdHash
      return undefined;
    }
    
    // 3. Check if the Person object already exists in storage
    try {
      const existingPerson = await getObjectByIdHash(personId);
      if (existingPerson?.obj?.$type$ === 'Person') {
        console.log(`[getPersonIdForLLM] Person ${personId} already exists for model ${modelName}`);
        return personId; // Person exists, return the ID
      }
      // If getObjectByIdHash resolves but doesn't return a Person, log a warning
      console.warn(`[getPersonIdForLLM] Object found for ID ${personId} but it is not a Person object.`);
    } catch (error: any) {
      // If getObjectByIdHash throws (likely 'not found'), proceed to create
      if (error.code === 'SO-GO1' || error.code === 'SNODE-ENOENT' || error.message?.includes('not found')) {
         console.log(`[getPersonIdForLLM] Person object ${personId} not found for model ${modelName}. Proceeding to create.`);
      } else {
        // Rethrow unexpected errors during the check
        console.error(`[getPersonIdForLLM] Unexpected error checking for existing Person ${personId}:`, error);
        throw error;
      }
    }

    // 4. If Person doesn't exist, create and store it
    console.log(`[getPersonIdForLLM] Creating Person object ${personId} for model ${modelName}`);
    try {
      // TODO: Check if LeuteModel provides a higher-level `createPerson` or similar method
      // If so, prefer using that over direct `storeVersionedObject`.
      await storeVersionedObject(personObject);
      console.log(`[getPersonIdForLLM] Successfully stored Person object ${personId}`);
      return personId;
    } catch (storeError) {
      console.error(`[getPersonIdForLLM] Failed to store Person object ${personId}:`, storeError);
      return undefined; // Return undefined if storage fails
    }

  } catch (error) {
    console.error(`[getPersonIdForLLM] Error processing Person ID for model ${modelName}:`, error);
    return undefined;
  }
}

/**
 * Creates a Profile and Someone object for an existing Person, following the correct ONE object relationship sequence.
 * 
 * @param personId The Person ID to create objects for
 * @param leuteModel The initialized LeuteModel instance.
 * @param profileOptions Options for the profile (displayName, descriptors, AI info).
 * @returns A promise resolving to the newly created Someone object.
 * @throws If Profile or Someone creation fails.
 */
export async function createProfileAndSomeoneForPerson(
  personId: SHA256IdHash<Person>,
  leuteModel: LeuteModel,
  profileOptions: {
    displayName?: string;
    descriptors?: PersonDescriptionTypes[];
    llmData?: { name?: string; provider?: string; type?: string };
  } = {}
): Promise<any> {
  console.log(`[createProfileAndSomeoneForPerson] Creating contact for Person ${personId}`);

  // In a content-addressed database, just create the objects
  // If they already exist, we'll get the same hash back
  
  // 1. Create Profile (content-addressed)
  const ProfileModel = (await import('@refinio/one.models/lib/models/Leute/ProfileModel.js')).default;
  const profile = await ProfileModel.constructWithNewProfile(
    personId,
    await leuteModel.myMainIdentity(),
    'default'
  );
  
  // Add display name if provided
  if (profileOptions.displayName) {
    profile.personDescriptions.push({
      $type$: 'PersonName' as const,
      name: profileOptions.displayName
    });
  }
  
  await profile.saveAndLoad();
  console.log(`[createProfileAndSomeoneForPerson] ✅ Profile: ${profile.idHash.toString().slice(0, 16)}...`);
  
  // 2. Create Someone (content-addressed)
  const SomeoneModel = (await import('@refinio/one.models/lib/models/Leute/SomeoneModel.js')).default;
  const someoneId = `someone-for-${personId}`;
  const someone = await SomeoneModel.constructWithNewSomeone(leuteModel, someoneId, profile);
  console.log(`[createProfileAndSomeoneForPerson] ✅ Someone: ${someone.idHash.toString().slice(0, 16)}...`);
  
  // 3. Add to contacts (idempotent)
  await leuteModel.addSomeoneElse(someone.idHash);
  console.log(`[createProfileAndSomeoneForPerson] ✅ Added to contacts`);
  
  return someone;
}

/**
 * Ensures a contact (Person, Profile, Someone) exists for a given Person ID.
 * Retrieves the existing Someone or creates the full persona if needed.
 * This is the primary function to ensure a full contact exists based on a Person ID.
 *
 * @param personId The ID hash of the Person.
 * @param leuteModel The initialized LeuteModel instance.
 * @param profileOptions Options for creating the profile if needed.
 * @returns A promise resolving to the Someone object (existing or created).
 * @throws If retrieval or creation fails unexpectedly.
 */
export async function ensureContactExists(
  personId: SHA256IdHash<Person>,
  leuteModel: LeuteModel,
  profileOptions: {
    displayName?: string;
    descriptors?: PersonDescriptionTypes[];
    llmData?: { name?: string; provider?: string; type?: string };
  } = {}
): Promise<any> { // Return type 'any' due to model inconsistencies
  console.log(`[ensureContactExists] Ensuring contact for Person ${personId}`);

  // First check all existing contacts to see if any already use this Person ID
  try {
    const others = await leuteModel.others();
    if (others && Array.isArray(others) && others.length > 0) {
      // Find any existing Someone with the same personId (mainIdentity)
      for (const contact of others) {
        if (!contact) continue;
        
        let contactPersonId;
        try {
          // Get the Person ID for this contact using mainIdentity if available
          if (typeof contact.mainIdentity === 'function') {
            contactPersonId = await contact.mainIdentity();
          } else if ('personId' in contact) {
            contactPersonId = (contact as any).personId;
          }
          
          // If this contact has the same Person ID, return it
          if (contactPersonId && contactPersonId.toString() === personId.toString()) {
            console.log(`[ensureContactExists] Found existing Someone ${contact.idHash} with matching Person ID ${personId} in contacts`);
            return contact;
          }
        } catch (identityError) {
          console.warn(`[ensureContactExists] Error getting identity for contact:`, identityError);
        }
      }
    }
  } catch (othersError) {
    console.warn(`[ensureContactExists] Error checking existing contacts:`, othersError);
  }

  // If no matching contact was found in the list, try direct lookup
  let someone: any;
  try {
    someone = await leuteModel.getSomeone(personId);
  } catch (getError) {
    console.warn(`[ensureContactExists] Error calling leuteModel.getSomeone for ${personId}: ${getError instanceof Error ? getError.message : getError}. Assuming Someone not found.`);
    someone = null;
  }

  // If Someone exists, return it
  if (someone && someone.idHash) {
    console.log(`[ensureContactExists] Found existing Someone ${someone.idHash} for Person ${personId}`);
    // Ensure it's in contacts
    try {
      const someoneIdHash = ensureIdHash<Someone>(someone.idHash);
      const others = await leuteModel.others();
      const alreadyInContacts = others.some(contact => {
        if (!contact || !('idHash' in contact)) return false;
        const contactIdHash = contact.idHash as SHA256IdHash;
        return contactIdHash.toString() === someoneIdHash.toString();
      });
      if (!alreadyInContacts) {
        console.log(`[ensureContactExists] Existing Someone ${someoneIdHash} not in contacts, adding...`);
        await leuteModel.addSomeoneElse(someoneIdHash);
        console.log(`[ensureContactExists] Added existing Someone ${someoneIdHash} to contacts.`);
      } else {
        console.log(`[ensureContactExists] Existing Someone ${someoneIdHash} already in contacts.`);
      }
    } catch (contactCheckError) {
      console.error(`[ensureContactExists] Error checking/adding existing Someone ${someone.idHash} to contacts:`, contactCheckError);
    }
    return someone;
  }

  // If Someone does not exist, create the Profile and Someone
  console.log(`[ensureContactExists] Someone not found for Person ${personId}. Creating Profile and Someone...`);
  try {
    someone = await createProfileAndSomeoneForPerson(personId, leuteModel, profileOptions);
    console.log(`[ensureContactExists] Successfully created and added contact for Person ${personId}. Returning Someone ${someone.idHash}`);
    return someone;
  } catch (creationError) {
    console.error(`[ensureContactExists] Failed to create Profile/Someone for Person ${personId}:`, creationError);
    throw creationError;
  }
}

/**
 * Creates a standard contact based on an email address.
 * Ensures the Person, Profile, and Someone objects exist and the Someone is added to contacts.
 *
 * @param email The email address for the contact.
 * @param leuteModel The initialized LeuteModel instance.
 * @param options Additional options for the contact profile (displayName, etc.).
 * @returns A promise resolving to the result including IDs and the Profile object.
 * @throws If Person ID calculation or contact creation fails.
 */
export async function createContact(
  email: string,
  leuteModel: LeuteModel, // Require LeuteModel directly
  options: CreateContactOptions = {}
): Promise<CreateContactResult> {
  console.log(`[createContact] Starting for email: ${email}`);
  
  // Debug information about version and types
  console.log(`[createContact] Debug - LeuteModel type: ${typeof leuteModel}, hasOwnProperty: ${Object.prototype.hasOwnProperty.call(leuteModel, 'getSomeone')}`);
  
  if (!leuteModel) {
    throw new Error("[createContact] LeuteModel instance is required.");
  }

  // 1. Get/Ensure Person ID and Person Object
  const normalizedEmail = normalizeEmailOrModelName(email); // Use consistent normalization
  let personId: SHA256IdHash<Person>;
  
  // CRITICAL FIX: Check if this is an AI/LLM contact and route appropriately
  const isAIContact = normalizedEmail.includes('@llama.local') || normalizedEmail.includes('@ai.local');
  
  try {
     // For AI/LLM contacts, ALWAYS use getPersonIdForLLM to ensure consistent Person object structure
     if (isAIContact) {
       console.log(`[createContact] AI contact detected, using getPersonIdForLLM for consistency`);
       const calculatedPersonId = await getPersonIdForLLM(normalizedEmail); // Creates Person WITH name field
       personId = calculatedPersonId;
     } else {
       // For human contacts, try LeuteModel first, fallback to getPersonIdForLLM
       if (typeof (leuteModel as any).getOrCreatePersonByEmail === 'function') {
          console.log(`[createContact] Using leuteModel.getOrCreatePersonByEmail for ${normalizedEmail}`);
          const personResult = await (leuteModel as any).getOrCreatePersonByEmail(normalizedEmail, options.displayName);
          personId = ensureIdHash<Person>(personResult.idHash); // Assuming it returns { idHash: ... }
       } else {
          console.log(`[createContact] Fallback: Using getPersonIdForLLM for ${normalizedEmail}`);
          personId = await getPersonIdForLLM(normalizedEmail);
       }
     }
  } catch(error) {
      console.error(`[createContact] Failed to get or create Person ID for email ${normalizedEmail}:`, error);
      throw new Error(`[createContact] Failed to get or create Person ID for email ${normalizedEmail}: ${error instanceof Error ? error.message : error}`);
  }

  console.log(`[createContact] Ensured Person object exists with ID ${personId}`);

  // 2. Ensure Profile and Someone exist and Someone is added to contacts
  const profileOptions = {
    displayName: options.displayName,
    descriptors: [] as PersonDescriptionTypes[], // Start empty, add name later if needed
    llmData: options.llmData
  };
  // Add display name if provided and not already in descriptors
  if (options.displayName && !profileOptions.descriptors.some(d => d.$type$ === 'PersonName')) {
     profileOptions.descriptors.push({ $type$: 'PersonName', name: options.displayName });
  }

  const someone = await ensureContactExists(personId, leuteModel, profileOptions);

  if (!someone || !someone.idHash || !someone.mainProfile) {
    // ensureContactExists should throw on failure, but add a check for safety
    throw new Error(`[createContact] Failed to ensure contact exists for Person ${personId}`);
  }

  console.log(`[createContact] Contact ensured for Person ${personId}. Someone: ${someone.idHash}, Profile: ${someone.mainProfile}`);

  // 3. Retrieve the created/existing Profile object to return
  // Fix the profile retrieval by using getMainProfile helper
  let profileObj: any;
  try {
    // Use our helper function to properly handle the case where mainProfile is a function
    profileObj = await getMainProfile(someone);
    if (!profileObj) {
      console.warn(`[createContact] Profile object not found for Someone ${someone.idHash} after ensuring contact exists.`);
    }
  } catch (e) {
    console.error(`[createContact] Could not retrieve final Profile object:`, e);
    // Continue without the profile object if retrieval fails, but log it.
  }

  // 4. Get the profile ID properly - use getProfileIdFromSomeone helper
  let profileId: string;
  try {
    // Use a helper to get the profile ID correctly whether mainProfile is a function or direct ID
    if (typeof someone.mainProfile === 'function') {
      // Call the function to get the profile and extract its ID
      const profile = await someone.mainProfile();
      profileId = profile.idHash.toString();
    } else {
      // Direct ID reference
      profileId = someone.mainProfile.toString();
    }
  } catch (e) {
    console.error(`[createContact] Error getting profile ID:`, e);
    // Use a placeholder if we can't get the actual ID
    profileId = "unknown";
  }

  // 4. Construct and return the result
  const result: CreateContactResult = {
    personId: personId,
    someoneId: someone.idHash.toString(), // Convert hash to string for easier use
    profileId: profileId,
    profile: profileObj || null, // Return the retrieved profile object or null
  };

  console.log(`[createContact] Completed successfully for email ${email}. Result:`, result);
  return result;
}

/**
 * Retrieves or creates a Someone object representing an LLM.
 * This function orchestrates the creation of the necessary Person, Profile,
 * and Someone objects for the LLM's identity using the simplified flow.
 *
 * @param llmNameOrLLM The name of the LLM model (string) or the LLM object itself.
 * @param appModel A container object holding necessary models (leuteModel, llmManager).
 *                 Requires at least `leuteModel`.
 * @returns Promise resolving to the Someone object (type 'any' due to model inconsistencies).
 * @throws If dependent models are missing or creation fails.
 */
export async function getOrCreateSomeoneForLLM(
  llmNameOrLLM: string | LLM,
  appModel: { leuteModel: LeuteModel, llmManager?: LLMManager, [key: string]: any } // Ensure leuteModel is present
): Promise<any> { // Return type 'any' due to model inconsistencies
  const modelName = typeof llmNameOrLLM === 'string' ? llmNameOrLLM : llmNameOrLLM.name;
  console.log(`[getOrCreateSomeoneForLLM] Processing LLM ${modelName}`);
  
  // 1. Validate dependencies
  if (!appModel || !appModel.leuteModel) {
    throw new Error("[getOrCreateSomeoneForLLM] A LeuteModel instance is required within the appModel parameter.");
  }
  const leuteModel = appModel.leuteModel;
  const llmManager = appModel.llmManager; // Optional manager for richer profile info

  // 2. Get/Ensure Person ID and Person Object for the LLM
  const personId = await getPersonIdForLLM(modelName);
  if (!personId) {
    throw new Error(`[getOrCreateSomeoneForLLM] Failed to get or create Person ID for model ${modelName}`);
  }
  console.log(`[getOrCreateSomeoneForLLM] Ensured Person object exists with ID ${personId}`);

  // 3. Ensure Profile and Someone exist and Someone is added to contacts
  // Prepare profile options specific to LLMs
  const profileOptions = {
    displayName: `${modelName} (AI)`,
  };

  // Use the primary function to handle retrieval or creation of Profile/Someone
  const someone = await ensureContactExists(personId, leuteModel, profileOptions);

  if (!someone || !someone.idHash) {
    // ensureContactExists should throw on failure, but add a check for safety
    throw new Error(`[getOrCreateSomeoneForLLM] Failed to ensure contact exists for Person ${personId}`);
  }

  console.log(`[getOrCreateSomeoneForLLM] Contact ensured for LLM ${modelName}. Someone ID: ${someone.idHash}`);

  // 4. Return the Someone object
  return someone;
}

/**
 * Creates a contact entry for a specified LLM model name.
 * This ensures the LLM has a corresponding Person, Profile, and Someone,
 * adds the Someone to the user's contacts, and associates a chat Topic.
 *
 * @param llmName The name of the LLM model.
 * @param appModel An object containing necessary models (leuteModel, llmManager, topicModel, etc.).
 *                 Requires `leuteModel` and `llmManager`.
 * @returns Promise resolving to the Someone ID hash (string) if successful, null otherwise.
 */
export async function createContactForLLM(
  llmName: string,
  appModel: { leuteModel: LeuteModel, llmManager: LLMManager, topicModel: TopicModel, channelManager: IChannelManager, [key: string]: any }, // Ensure required models
): Promise<string | null> {
  console.log(`[createContactForLLM] Attempting to create contact for ${llmName}`);
  
  // 1. Validate dependencies
  if (!appModel || !appModel.leuteModel || !appModel.llmManager) {
    console.error("[createContactForLLM] Missing required models (leuteModel, llmManager) in appModel parameter.");
    return null;
  }
  const { leuteModel, llmManager } = appModel;

  try {
    // 2. Get or create the Someone object representing the LLM
    // This now handles ensuring Person, Profile, Someone exist and Someone is in contacts.
    const someone = await getOrCreateSomeoneForLLM(llmName, appModel);

    if (!someone || !someone.idHash) {
      // getOrCreateSomeoneForLLM should throw on failure, but double-check
      throw new Error(`[createContactForLLM] Failed to get or create Someone for ${llmName}`);
    }
    const someoneIdHash = ensureIdHash<Someone>(someone.idHash);
    console.log(`[createContactForLLM] Ensured Someone ${someoneIdHash} exists and is in contacts for ${llmName}.`);

    // 3. Create or get the chat topic associated with this LLM
    const llmObject = await llmManager.getModelByName(llmName);
    if (!llmObject) {
      // Ensure llmObject itself is valid before proceeding
       throw new Error(`[createContactForLLM] Could not retrieve valid LLM object for ${llmName}`);
    }

    // Ensure AppModel has all necessary components for getOrCreateTopicForLLM
    if (!appModel.topicModel || !appModel.channelManager) {
        throw new Error("[createContactForLLM] AppModel is missing topicModel or channelManager needed for topic creation.");
    }

    // Pass required models explicitly to the getOrCreateTopicForLLM
    await getOrCreateTopicForLLM(llmObject, {
        leuteModel: appModel.leuteModel,
        topicModel: appModel.topicModel,
        channelManager: appModel.channelManager,
        aiAssistantModel: appModel.aiAssistantModel,
     }, llmManager);
    console.log(`[createContactForLLM] Ensured topic exists for ${llmName}`);

    // 4. Return the Someone ID hash as a string
    console.log(`[createContactForLLM] Contact creation and topic association complete for ${llmName}`);
    return someoneIdHash.toString(); // Return string representation

  } catch (error) {
    console.error(`[createContactForLLM] Error creating contact for ${llmName}:`, error);
    return null;
  }
}

/**
 * Creates a chat topic specifically for an LLM.
 * Relies on TopicModel.createGroupTopic to handle creation/retrieval and provide the ID hash.
 * Returns the created/retrieved Topic object.
 *
 * @param llm The LLM object.
 * @param llmIdHash The ID hash of the LLM object (string representation).
 * @param modelContainer Object containing initialized topicModel and channelManager.
 * @param llmManager The LLMManager instance.
 * @param someoneIdHash The ID hash of the LLM's Someone object.
 * @returns A promise resolving to the created or retrieved Topic object (type any).
 * @throws If topic creation or member addition fails.
 */
export async function createTopic(
  llm: LLM,
  llmIdHash: string, // Accept string hash
  modelContainer: { topicModel: TopicModelWithCreateGroupTopic, channelManager: IChannelManager, leuteModel: LeuteModel },
  llmManager: LLMManager,
  someoneIdHash: SHA256IdHash<Someone>
): Promise<any> { // Return the full topic object

  // Extract necessary data
  const { topicModel, channelManager, leuteModel } = modelContainer;
  if (!topicModel || !leuteModel) {
    throw new Error(`[createTopic] TopicModel and LeuteModel are required`);
  }

  // Use the name property rather than displayName which might not exist
  const modelName = typeof llm === 'string' ? llm : llm.name || '';
  console.log(`[createTopic] Creating 1-to-1 topic for AI model ${modelName}`);
  
  // Get the current user's person ID and the AI's person ID
  const myPersonId = await leuteModel.myMainIdentity();
  const aiPersonId = llm.personId ? ensureIdHash<Person>(llm.personId) : undefined;
  
  if (!myPersonId || !aiPersonId) {
    throw new Error(`[createTopic] Missing person IDs: user=${myPersonId}, AI=${aiPersonId}`);
  }

  try {
    // Use createOneToOneTopic - it handles ID sorting and deduplication internally
    console.log(`[createTopic] Creating one-to-one topic between user ${myPersonId.toString().substring(0, 8)}... and AI ${aiPersonId.toString().substring(0, 8)}...`);
    
    const topic = await topicModel.createOneToOneTopic(myPersonId, aiPersonId);
    console.log(`[createTopic] Topic created/found: ${topic.id}`);
    
    // The createOneToOneTopic should handle channel creation and access rights automatically
    // But let's verify the channels exist for both participants
    try {
      console.log(`[createTopic] Verifying channel setup for topic ${topic.id}`);
      
      // Check if channels exist for both participants
      const channelInfos = await channelManager.getMatchingChannelInfos({ 
        channelId: topic.id 
      });
      
      console.log(`[createTopic] Found ${channelInfos.length} channel(s) for topic ${topic.id}`);
      
      // In a proper 1-to-1 setup, we should have 2 channels (one per participant)
      if (channelInfos.length < 2) {
        console.warn(`[createTopic] Expected 2 channels but found ${channelInfos.length}. May need to wait for CHUM sync.`);
      } else {
        console.log(`[createTopic] ✅ Both participant channels exist`);
        channelInfos.forEach((info, idx) => {
          console.log(`[createTopic]   Channel ${idx + 1}: owner=${info.owner?.toString().substring(0, 8) || 'undefined'}...`);
        });
      }
    } catch (channelError) {
      console.warn(`[createTopic] Error verifying channels:`, channelError);
      // Continue - the topic was created successfully
    }
    
    return topic;
  } catch (error) {
    console.error(`[createTopic] Error creating topic for model ${modelName}:`, error);
    throw error;
  }
}


/**
 * Gets the chat topic object associated with an LLM model.
 * If the topic doesn't exist, it attempts to create it using the createTopic function.
 *
 * @param modelNameOrLLM The LLM model name (string) or the LLM object itself.
 * @param appModel The initialized AppModel instance containing required models.
 * @param llmManager The initialized LLMManager instance.
 * @returns Promise resolving to the topic object (type any), or undefined if creation failed.
 */
export async function getTopicForLLM(modelNameOrLLM: string | LLM, appModel: AppModel, llmManager: LLMManager): Promise<any> {
  const modelName = typeof modelNameOrLLM === 'string' ? modelNameOrLLM : modelNameOrLLM.name;
  if (!modelName) {
    console.warn('[getTopicForLLM] Model name required.');
    return undefined;
  }
  
  console.log(`[getTopicForLLM] Finding or creating topic object for ${modelName}`);

  // 1. Get necessary models
  const topicModel = appModel.topicModel as TopicModelWithCreateGroupTopic;
  const channelManager = appModel.channelManager as IChannelManager;
  const leuteModel = appModel.leuteModel;

  if (!topicModel || !channelManager || !leuteModel) {
    console.error('[getTopicForLLM] Missing required models (TopicModel, ChannelManager, LeuteModel) in AppModel.');
    return undefined;
  }

  // 2. Call createTopic - this handles creation/retrieval and returns the object
  console.log(`[getTopicForLLM] Calling createTopic to get/create topic object for AI model ${modelName}...`);
  try {
    // Ensure Someone exists
    const someone = await getOrCreateSomeoneForLLM(modelNameOrLLM, appModel);
    if (!someone || !someone.idHash) {
      throw new Error(`[getTopicForLLM] Could not get or create Someone for ${modelName}, cannot create topic.`);
    }
    const someoneIdHash = ensureIdHash<Someone>(someone.idHash);

    // Get LLM object and hash
    const llmObject = typeof modelNameOrLLM === 'object' ? modelNameOrLLM : await llmManager.getModelByName(modelName);
    if (!llmObject) {
      throw new Error(`[getTopicForLLM] Could not retrieve LLM object for ${modelName}`);
    }
    const llmIdHash = await getModelIdHash(llmObject, llmManager);

    // Call createTopic which now returns the object
    const topicObject = await createTopic(
      llmObject,
      llmIdHash.toString(),
      { topicModel, channelManager, leuteModel },
      llmManager,
      someoneIdHash
    );

    // Trust the topic object returned by the core
    console.log(`[getTopicForLLM] Successfully got/created topic object for AI model ${modelName}`);
    return topicObject;

  } catch (creationError) {
    console.error(`[getTopicForLLM] Error getting/creating topic object for ${modelName}:`, creationError);
    return undefined;
  }
}

/**
 * Gets or creates a chat topic object for a given LLM model.
 * Returns the full topic object.
 *
 * @param modelNameOrLLM The LLM model object or name.
 * @param models An object containing the required model instances (leuteModel, topicModel, channelManager).
 * @param llmManager The LLMManager instance.
 * @returns Promise resolving to the Topic object (type any).
 * @throws If topic creation/retrieval fails.
 */
export async function getOrCreateTopicForLLM(
  modelNameOrLLM: LLM, // Expect LLM object for consistency
  models: { leuteModel: LeuteModel, topicModel: TopicModel, channelManager: IChannelManager, aiAssistantModel?: any },
  llmManager: LLMManager 
): Promise<any> { // Return the full topic object
  const model = modelNameOrLLM;
  const modelName = model.name;

  if (!modelName) {
    throw new Error("[getOrCreateTopicForLLM] LLM model name is required.");
  }
  if (!models || !models.topicModel || !models.channelManager || !models.leuteModel || !llmManager) {
     throw new Error("[getOrCreateTopicForLLM] Required models (Leute, Topic, Channel) and LLMManager are required.");
  }

  console.log(`[getOrCreateTopicForLLM] Ensuring topic object for ${modelName}`);

  try {
    // Construct the temporary AppModel structure needed by getTopicForLLM
    const tempAppModel = {
       leuteModel: models.leuteModel,
       topicModel: models.topicModel,
       channelManager: models.channelManager,
       aiAssistantModel: models.aiAssistantModel,
    } as AppModel;

    // Call getTopicForLLM which now returns the topic object
    const topicObject = await getTopicForLLM(model, tempAppModel, llmManager);

    // Validate the result - check for id property which is what topics have
    if (!topicObject || !topicObject.id) {
       throw new Error(`[getOrCreateTopicForLLM] Failed to get or create topic object for ${modelName}`);
    }

    console.log(`[getOrCreateTopicForLLM] Topic object ensured for ${modelName}:`, topicObject.id);
    
    // CRITICAL: Update the AI assistant's topicModelMap cache
    // This is required for the message listener to recognize this as an AI topic
    try {
      const modelIdHash = await llmManager.getModelIdHash(modelName);
      if (!modelIdHash) {
        console.error(`[getOrCreateTopicForLLM] ❌ Failed to get modelIdHash for ${modelName}`);
        throw new Error(`Failed to get modelIdHash for ${modelName}`);
      }

      // Check if aiAssistantModel is available
      if (!tempAppModel.aiAssistantModel) {
        console.warn(`[getOrCreateTopicForLLM] ⚠️ aiAssistantModel not available - skipping model map initialization`);
        console.warn(`[getOrCreateTopicForLLM] Topic ${topicObject.id} created but won't be recognized by AI message listener`);
        return topicObject; // Return the topic, but skip model map initialization
      }

      // Check if topicManager is available  
      if (!tempAppModel.aiAssistantModel.topicManager) {
        console.warn(`[getOrCreateTopicForLLM] ⚠️ topicManager not available - skipping model map initialization`);
        console.warn(`[getOrCreateTopicForLLM] Topic ${topicObject.id} created but won't be recognized by AI message listener`);
        return topicObject; // Return the topic, but skip model map initialization
      }

      // Ensure topicModelMap is initialized and add the mapping
      tempAppModel.aiAssistantModel.topicManager.ensureTopicModelMapInitialized();
      tempAppModel.aiAssistantModel.topicManager.addTopicModelMapping(topicObject.id, modelIdHash);
      
    } catch (cacheError) {
      console.error(`[getOrCreateTopicForLLM] ❌ Error updating topicModelMap cache:`, cacheError);
      console.warn(`[getOrCreateTopicForLLM] ⚠️ Model map initialization failed - topic created but may not work with AI assistant`);
      // Don't throw here - the topic was created successfully, just the mapping failed
    }
    
    return topicObject; // Return the full object

  } catch (error) {
    console.error(`[getOrCreateTopicForLLM] Failed to ensure topic object for ${modelName}:`, error);
    throw error;
  }
}

/**
 * Retrieves the Someone object for an LLM, if it exists.
 * Does NOT create the Someone if it's missing.
 * 
 * @param modelNameOrLLM The LLM model name or object.
 * @returns Promise resolving to the Someone object or undefined.
 */
export async function getSomeoneForLLM(modelNameOrLLM: string | LLM): Promise<any | undefined> {
    const modelName = typeof modelNameOrLLM === 'string' ? modelNameOrLLM : modelNameOrLLM.name;
    if (!modelName) {
    console.warn('[getSomeoneForLLM] Model name required.');
    return undefined;
  }

  try {
    // 1. Get the Person ID
    const personId = await getPersonIdForLLM(modelName); // Ensures Person exists
    if (!personId) {
      console.log(`[getSomeoneForLLM] Person ID not found or couldn't be created for ${modelName}, cannot get Someone.`);
      return undefined;
    }

    // 2. Get LeuteModel
    const leuteModel = ModelService.getLeuteModel(); // Use service locator/getter
  if (!leuteModel) {
       console.error('[getSomeoneForLLM] LeuteModel not available.');
    return undefined;
}

    // 3. Attempt to get Someone using LeuteModel
      const someone = await leuteModel.getSomeone(personId);
    if (someone && someone.idHash) { // Check if a valid someone object was returned
       console.log(`[getSomeoneForLLM] Found Someone ${someone.idHash} for ${modelName}`);
    } else {
       console.log(`[getSomeoneForLLM] Someone not found for Person ${personId}`);
    }
    return someone; // Return found someone or null/undefined

  } catch (error) {
    // Catch errors specifically from leuteModel.getSomeone if possible
    if (error instanceof Error && error.message.includes("Someone not found")) {
        console.log(`[getSomeoneForLLM] leuteModel.getSomeone confirmed Someone not found for Person associated with ${modelName}.`);
    return undefined;
    }
    // Log other unexpected errors
    console.error(`[getSomeoneForLLM] Error retrieving Someone for ${modelName}:`, error);
    return undefined;
  }
}

/**
 * Logs the current state of a registry map (e.g., modelToTopicMap)
 */
function logRegistryState(registry?: Map<string, string>) {
  if (!registry) {
    console.log("[logRegistryState] Registry is undefined.");
    return;
  }
  if (registry.size === 0) {
     console.log("[logRegistryState] Registry is empty.");
     return;
  }
  console.log("[logRegistryState] Current registry state:");
  registry.forEach((value, key) => {
     console.log(`  - ${key}: ${value}`);
  });
}

/**
 * DEBUGGING FUNCTION: Checks for duplicate Someone objects for a given Person ID.
 * This should theoretically not happen if creation logic is correct.
 */
async function checkForDuplicateSomeones(leuteModel: LeuteModel, personId: SHA256IdHash<Person>): Promise<any[]> {
  // Assuming LeuteModel might have a method to list all Someone objects,
  // or we might need to query the channel directly if available.
  // This is a placeholder for a more robust check if needed.
  console.warn("[checkForDuplicateSomeones] Functionality not fully implemented - requires method to list all Someone objects.");
  return [];

  /* Example implementation if leuteModel.getAllSomeoneObjects exists:
  if (!leuteModel || typeof leuteModel.getAllSomeoneObjects !== 'function') {
     console.warn("[checkForDuplicateSomeones] LeuteModel missing or doesn't support getAllSomeoneObjects.");
      return [];
    }
    
  try {
     const allSomeones = await leuteModel.getAllSomeoneObjects();
     const duplicates = allSomeones.filter((s: any) => s.personId && s.personId.toString() === personId.toString());

     if (duplicates.length > 1) {
       console.warn(`[checkForDuplicateSomeones] Found ${duplicates.length} Someone objects for Person ${personId}:`, duplicates.map((d:any) => d.idHash));
     } else if (duplicates.length === 1) {
       console.log(`[checkForDuplicateSomeones] Found exactly one Someone ${duplicates[0].idHash} for Person ${personId}.`);
     } else {
       console.log(`[checkForDuplicateSomeones] Found no Someone objects for Person ${personId}.`);
     }
     return duplicates;
          } catch (error) {
     console.error(`[checkForDuplicateSomeones] Error checking for duplicates for Person ${personId}:`, error);
    return [];
  }
  */
}

/**
 * Utility to get model ID hash, handling potential errors.
 */
async function getModelIdHash(llm: LLM, llmManager: LLMManager): Promise<SHA256IdHash<LLM>> {
    if (!llmManager || typeof llmManager.getModelIdHash !== 'function') {
       // Fallback or throw if manager is not available/capable
       console.warn("[getModelIdHash] LLMManager missing or doesn't support getModelIdHash. Attempting calculation.");
       // Attempt direct calculation as a fallback
       try {
          // Ensure LLM object has necessary fields for hashing (e.g., $type$, name, etc.)
          if (!llm.$type$ || !llm.name /* Linter Fix: Removed check for non-existent idHash */) { // Add other necessary fields
             throw new Error("LLM object missing required fields for hash calculation.")
          }
          const hash = await calculateIdHashOfObj(llm as any); // Cast needed if LLM isn't directly usable
          return ensureIdHash<LLM>(hash);
       } catch(calcError) {
           console.error(`[getModelIdHash] Fallback hash calculation failed for LLM ${llm.name}:`, calcError);
           throw new Error(`Failed fallback hash calculation for LLM ${llm.name}`);
       }
    }
    // Use manager if available
    try {
      const hash = await llmManager.getModelIdHash(llm.name); // Assumes getModelIdHash takes name
      return ensureIdHash<LLM>(hash); // Ensure correct type
    } catch (error) {
       console.error(`[getModelIdHash] Error getting ID hash via manager for LLM ${llm.name}:`, error);
       throw new Error(`Failed to get ID hash via manager for LLM ${llm.name}: ${error instanceof Error ? error.message : error}`);
    }
}

/**
 * Get the main profile from a Someone object properly
 * This handles the case where mainProfile is a function or direct reference
 */
async function getMainProfile(someone: any): Promise<any> {
  if (!someone || !someone.mainProfile) {
    throw new Error('Invalid Someone object or missing mainProfile');
  }
  
  // If mainProfile is a function, call it to get the profile
  if (typeof someone.mainProfile === 'function') {
    return await someone.mainProfile();
  }
  
  // Otherwise, it should be a direct profile reference or ID
  return someone.mainProfile;
}

/**
 * Detects and fixes duplicate contacts by analyzing the Someone objects that point to the same Person.
 * This is a diagnostic and repair utility for fixing contact display issues.
 * 
 * @param leuteModel The initialized LeuteModel instance
 * @returns A promise resolving to an object containing counts of issues found and fixed
 */
export async function detectAndFixDuplicateContacts(
  leuteModel: LeuteModel
): Promise<{
  duplicatesFound: number;
  duplicatesFixed: number;
  orphanedProfiles: number;
  missingNames: number;
  namesFixed: number;
}> {
  if (!leuteModel || !leuteModel.state || leuteModel.state.currentState !== 'Initialised') {
    throw new Error('LeuteModel must be initialized before detecting duplicates');
  }

  console.log('[detectAndFixDuplicateContacts] Starting duplicate contact detection');
  
  // Result counters
  const result = {
    duplicatesFound: 0,
    duplicatesFixed: 0,
    orphanedProfiles: 0,
    missingNames: 0,
    namesFixed: 0
  };

  try {
    // 1. Get all contacts (Someone objects)
    const allContacts = await leuteModel.others();
    console.log(`[detectAndFixDuplicateContacts] Found ${allContacts.length} contacts`);
    
    // 2. Group Someone objects by Person ID to find duplicates
    const personIdToSomeoneMap = new Map<string, Array<any>>();
    
    // Track Someone objects by their hash IDs
    const someoneIdToPersonIdMap = new Map<string, string>();
    
    // Process all Someone objects
    for (const someone of allContacts) {
      try {
        // Get the person ID for this Someone
        let personId: string;
        
        // Try mainIdentity method first
        if (someone.mainIdentity && typeof someone.mainIdentity === 'function') {
          personId = (await someone.mainIdentity()).toString();
        } 
        // Try getting from main profile
        else if (someone.mainProfile && typeof someone.mainProfile === 'function') {
          const profile = await someone.mainProfile();
          if (profile && profile.personId) {
            personId = profile.personId.toString();
          } else {
            console.log(`[detectAndFixDuplicateContacts] Someone ${someone.idHash} has no valid personId, skipping`);
            continue;
          }
        } else {
          console.log(`[detectAndFixDuplicateContacts] Someone ${someone.idHash} has no valid personId, skipping`);
          continue;
        }
        
        // Store mapping from Someone ID to Person ID
        someoneIdToPersonIdMap.set(someone.idHash.toString(), personId);
        
        // Group Someone objects by Person ID
        if (!personIdToSomeoneMap.has(personId)) {
          personIdToSomeoneMap.set(personId, []);
        }
        personIdToSomeoneMap.get(personId)?.push(someone);
      } catch (error) {
        console.error(`[detectAndFixDuplicateContacts] Error processing Someone ${someone.idHash}:`, error);
      }
    }
    
    // 3. Process each Person to detect duplicates
    for (const [personId, someones] of personIdToSomeoneMap.entries()) {
      // Skip if there's only one Someone for this Person
      if (someones.length <= 1) {
        continue;
      }
      
      // We found duplicates
      result.duplicatesFound += someones.length - 1;
      console.log(`[detectAndFixDuplicateContacts] Found ${someones.length} duplicates for Person ${personId}`);
      
      // Sort by creation time or idHash to find the "primary" Someone to keep
      const primarySomeone = someones[0]; // Just use the first one for now
      const duplicateSomeones = someones.slice(1);
      
      // Remove duplicate Someones from contact list
      for (const duplicate of duplicateSomeones) {
        try {
          console.log(`[detectAndFixDuplicateContacts] Removing duplicate Someone ${duplicate.idHash} for Person ${personId}`);
          await leuteModel.removeSomeoneElse(duplicate.idHash);
          result.duplicatesFixed++;
        } catch (error) {
          console.error(`[detectAndFixDuplicateContacts] Error removing duplicate Someone ${duplicate.idHash}:`, error);
        }
      }
    }
    
    // 4. Check for and fix missing names
    for (const someone of allContacts) {
      try {
        // Get the main profile - properly handle function vs direct reference
        const profile = await getMainProfile(someone);
        if (!profile) continue;
        
        // Check if profile has a name descriptor
        const hasName = profile.descriptionsOfType && 
                      typeof profile.descriptionsOfType === 'function' && 
                      profile.descriptionsOfType('PersonName').length > 0;
        
        // Fix missing names
        if (!hasName) {
          result.missingNames++;
          
          // Try to get personId safely
          let personId;
          if (someone.mainIdentity && typeof someone.mainIdentity === 'function') {
            personId = await someone.mainIdentity();
          } else if (profile.personId) {
            personId = profile.personId;
          }
          
          if (!personId) {
            console.log(`[detectAndFixDuplicateContacts] Cannot fix name for Someone ${someone.idHash} - no personId`);
            continue;
          }
          
          try {
            // Check if this is an AI contact by looking for patterns in the email
            let isAI = false;
            let displayName = "Unnamed Contact";
            
            try {
              // Get the person object to check email
              const personResult = await getObjectByIdHash(personId);
              const person = extractPerson(personResult);
              
              if (person && person.email) {
                const email = person.email.toLowerCase();
                
                // Check if this looks like an AI email
                if (email.includes('ai.') || email.includes('llm.') || email.includes('assistant')) {
                  isAI = true;
                  // Try to extract model name from email
                  const match = email.match(/ai\.(.*?)@/);
                  if (match && match[1]) {
                    const modelName = match[1].replace(/-/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
                    displayName = `${modelName} (AI)`;
                  } else {
                    displayName = "AI Assistant";
                  }
                } else {
                  // Use email as display name if we have it
                  displayName = person.email.split('@')[0].replace(/[._-]/g, ' ');
                  displayName = displayName.replace(/\b\w/g, (letter: string) => letter.toUpperCase());
                }
              }
            } catch (e) {
              console.log(`[detectAndFixDuplicateContacts] Error checking person for ${personId}:`, e);
            }
            
            // Add a name descriptor to the profile
            const personName = {
              $type$: 'PersonName' as const,
              name: displayName
            };
            
            profile.personDescriptions.push(personName);
            await profile.saveAndLoad();
            
            console.log(`[detectAndFixDuplicateContacts] Added name "${displayName}" to profile ${profile.idHash}`);
            result.namesFixed++;
          } catch (nameError) {
            console.error(`[detectAndFixDuplicateContacts] Error fixing name for Someone ${someone.idHash}:`, nameError);
          }
        }
      } catch (profileError) {
        console.error(`[detectAndFixDuplicateContacts] Error checking/fixing profile for Someone ${someone.idHash}:`, profileError);
      }
    }
    
    return result;
  } catch (error) {
    console.error('[detectAndFixDuplicateContacts] Error detecting/fixing duplicates:', error);
    throw error;
  }
}

/**
 * Detect and fix issues in the person object returned by getObjectByIdHash
 * This handles the case where the Person object structure doesn't match expectations
 * 
 * @param personResult The result returned by getObjectByIdHash
 * @returns A valid Person object with email and name properties
 */
function extractPerson(personResult: any): PersonWithEmail | undefined {
  if (!personResult) return undefined;
  
  // Try to get the person object from different potential structures
  let person: any = null;
  
  if (personResult.obj && personResult.obj.$type$ === 'Person') {
    // Regular structure from getObjectByIdHash
    person = personResult.obj;
  } else if (personResult.$type$ === 'Person') {
    // Direct Person object
    person = personResult;
  } else if (personResult.data && personResult.data.$type$ === 'Person') {
    // Channel object structure
    person = personResult.data;
  }
  
  if (!person) return undefined;
  
  // Ensure person has email and name properties
  return {
    $type$: 'Person',
    email: person.email || '',
    name: person.name || 'Unknown Person'
  };
}

// NOTE: removeDuplicateContacts function removed as it's no longer needed.
// With proper content addressing using deterministic someoneId values,
// duplicate Someone objects for the same Person should not occur.