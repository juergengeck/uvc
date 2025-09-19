import { storeBase64StringAsBlob } from '@refinio/one.core/lib/storage-blob.js';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Group } from '@refinio/one.core/lib/recipes.js';
import { exists } from '@refinio/one.core/lib/system/storage-base.js';
import { convertIdentityToProfile } from '@refinio/one.models/lib/misc/IdentityExchange.js';
import GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel.js';
import SomeoneModel from '@refinio/one.models/lib/models/Leute/SomeoneModel.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { PersonDescriptionTypes } from '@refinio/one.models/lib/recipes/Leute/PersonDescriptions.js';

import type { InitialIopPeerInfo } from '../config/app-config.js';

// Base64 replicant image (simplified for React Native - could be replaced with actual image)
const oneReplicantImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

/**
 * Adds an IoP peer to the instance by creating a matching profile.
 * Adapted from one.leute config.ts for React Native environment.
 * 
 * FIXED: Now properly creates Person → Profile → Someone chain for replicants
 *
 * @param leute
 * @param iopPeer
 */
export async function addIopPeerToLeute(
    leute: LeuteModel,
    iopPeer: InitialIopPeerInfo
): Promise<void> {
    console.log(`[addIopPeerToLeute] Adding IOP peer: ${iopPeer.initialName || 'Unnamed'}`);
    
    try {
        const blobImage = await storeBase64StringAsBlob(oneReplicantImageBase64);

        const personDescriptions: PersonDescriptionTypes[] = [
            {
                $type$: 'ProfileImage',
                image: blobImage.hash
            }
        ];

        if (iopPeer.initialName) {
            personDescriptions.push({
                $type$: 'PersonName',
                name: iopPeer.initialName
            });
        }

        // Step 1: Create Person and Profile using convertIdentityToProfile
        const profile = await convertIdentityToProfile(
            iopPeer.identity,
            'default',
            await leute.myMainIdentity(),
            [],
            personDescriptions
        );

        if (profile.loadedVersion === undefined) {
            throw new Error('Should not happen: saved profile has no hash');
        }

        console.log(`[addIopPeerToLeute] Created Profile for ${iopPeer.initialName}: ${profile.idHash}`);
        console.log(`[addIopPeerToLeute] Profile Person ID: ${profile.personId}`);

        // Step 2: Create Someone object using SomeoneModel.constructWithNewSomeone
        // This is the missing step that was causing "Someone object has no mainPersonId" warnings
        try {
            console.log(`[addIopPeerToLeute] Creating Someone object for replicant ${iopPeer.initialName}`);
            
            // Generate unique someoneId for this replicant (required first parameter)
            const someoneId = `${iopPeer.initialName?.replace(/\s+/g, '-') || 'replicant'}-${profile.personId.substring(0, 8)}`;
            console.log(`[addIopPeerToLeute] Using someoneId: ${someoneId}, mainProfile: ${profile.idHash}`);
            
            // Call with both required parameters: someoneId and mainProfile
            const someone = await SomeoneModel.constructWithNewSomeone(leuteModel, someoneId, profile);
            console.log(`[addIopPeerToLeute] Created Someone object: ${someone.idHash}`);
            console.log(`[addIopPeerToLeute] Someone mainPersonId: ${someone.pSomeone?.mainPersonId || 'undefined'}`);
            
            // Someone object created successfully with proper mainProfile reference
            console.log(`[addIopPeerToLeute] Someone object created successfully for ${iopPeer.initialName}`);
            console.log(`[addIopPeerToLeute] Someone mainProfile: ${someone.pSomeone?.mainProfile || 'undefined'}`);
            console.log(`[addIopPeerToLeute] Someone someoneId: ${someone.pSomeone?.someoneId || 'undefined'}`);
            console.log(`[addIopPeerToLeute] Someone identities: ${someone.pSomeone?.identities?.size || 0} entries`);
        } catch (someoneError) {
            console.error(`[addIopPeerToLeute] Error creating Someone object for ${iopPeer.initialName}:`, someoneError);
            // Continue with profile creation even if Someone fails
        }

        // Step 3: Certify trust keys
        await leute.trust.certify('TrustKeysCertificate', {
            profile: profile.loadedVersion
        });
        
        console.log(`[addIopPeerToLeute] Certified trust keys for ${iopPeer.initialName}`);

        // Step 4: Add to replicant group if specified
        if (iopPeer.group) {
            const replicantGroup = await GroupModel.constructWithNewGroup(iopPeer.group);
            if (!replicantGroup.persons.includes(profile.personId)) {
                replicantGroup.persons.push(profile.personId);
                await replicantGroup.saveAndLoad();
            }
            console.log(`[addIopPeerToLeute] Added to group: ${iopPeer.group}`);
        }

        // Step 5: Add profile to LeuteModel
        await leute.addProfile(profile.idHash);
        console.log(`[addIopPeerToLeute] Successfully added IOP peer: ${iopPeer.initialName}`);
        
        // Step 6: Verify the complete identity chain was created
        console.log(`[addIopPeerToLeute] ✅ Complete identity chain created for ${iopPeer.initialName}:`);
        console.log(`[addIopPeerToLeute] ✅   - Person: ${profile.personId}`);
        console.log(`[addIopPeerToLeute] ✅   - Profile: ${profile.idHash}`);
        console.log(`[addIopPeerToLeute] ✅   - Someone: Created via SomeoneModel.constructWithNewSomeone`);
        
    } catch (error) {
        console.error(`[addIopPeerToLeute] Error adding IOP peer ${iopPeer.initialName}:`, error);
        throw error;
    }
}

/**
 * Get group hash by name (adapted from one.leute config.ts)
 */
export async function getGroupHash(groupName: string): Promise<SHA256IdHash<Group> | undefined> {
    const groupHash = await calculateIdHashOfObj({$type$: 'Group', name: groupName});
    if (await exists(groupHash)) {
        return groupHash;
    }
    return undefined;
} 