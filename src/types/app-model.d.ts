/**
 * AppModel declaration file
 * 
 * This file defines the TypeScript types for the AppModel class.
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';

// Use interface augmentation instead of class redeclaration to prevent 'duplicate identifier' error
declare module '@src/models/AppModel' {
  interface AppModel {
    /**
     * Add a contact directly to the leute.other array and save it
     * @param someoneId The Someone ID to add to contacts
     * @returns True if successful, false otherwise
     */
    addContact(someoneId: string): Promise<boolean>;

    /**
     * Explicitly save the LeuteModel state to persist contacts
     * This ensures that any contacts added via addSomeoneElse are stored persistently
     */
    saveLeuteState(): Promise<void>;
    
    /**
     * Force the contacts in the leute.other array to be correctly populated and saved
     * @returns True if successful, false otherwise
     */
    ensureContactsArray(): Promise<boolean>;
  }
} 