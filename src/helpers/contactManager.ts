/**
 * Contact Manager - Uses ContactCreationHelper from refinio.api for proper
 * Person → Profile → Someone creation flow
 */

import {
  ensureContactExists,
  createProfileAndSomeoneForPerson,
  type ProfileOptions
} from '@refinio/api/helpers/ContactCreationHelper.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * Ensure a contact exists for a given Person ID
 *
 * This replaces manual Person/Profile/Someone creation which is error-prone
 * Uses the correct flow from refinio.api
 */
export async function ensureContact(
  leuteModel: LeuteModel,
  personId: SHA256IdHash<any>,
  options?: ProfileOptions
): Promise<any> {
  return await ensureContactExists(personId, leuteModel, options);
}

/**
 * Create a new contact (Profile + Someone) for an existing Person
 *
 * Use this when you know the Person doesn't exist yet in contacts
 */
export async function createContact(
  leuteModel: LeuteModel,
  personId: SHA256IdHash<any>,
  options?: ProfileOptions
): Promise<any> {
  return await createProfileAndSomeoneForPerson(personId, leuteModel, options);
}

/**
 * Handle pairing success callback - creates contact for remote person
 *
 * This should be called in the onPairingSuccess event handler
 */
export async function handlePairingSuccess(
  leuteModel: LeuteModel,
  remotePersonId: SHA256IdHash<any>,
  displayName?: string
): Promise<void> {
  console.log(`[ContactManager] Handling pairing success for person ${remotePersonId.toString().substring(0, 8)}`);

  await ensureContactExists(remotePersonId, leuteModel, {
    displayName
  });

  console.log(`[ContactManager] ✅ Contact created/verified for ${remotePersonId.toString().substring(0, 8)}`);
}
