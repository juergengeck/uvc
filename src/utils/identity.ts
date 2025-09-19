/**
 * Identity and Group Utilities
 * 
 * Uses one.core utilities for object manipulation and type checking.
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { Group } from '@refinio/one.core/lib/recipes';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object';
import { exists } from '@refinio/one.core/lib/system/storage-base';
import type { Identity } from '@refinio/one.models/lib/misc/IdentityExchange';
import { convertIdentityToProfile } from '@refinio/one.models/lib/misc/IdentityExchange';
import GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import type { PersonDescriptionTypes } from '@refinio/one.models/lib/recipes/Leute/PersonDescriptions';

export interface InitialIopPeerInfo {
    identityFile: string;
    identity: Identity; // Will be set automatically on loading
    initialName?: string;
    group?: string;
}

/**
 * Adds an IoP peer to the instance by creating a matching profile.
 */
export async function addIopPeer(leute: LeuteModel, iopPeer: InitialIopPeerInfo): Promise<void> {
    const personDescriptions: PersonDescriptionTypes[] = [];

    if (iopPeer.initialName) {
        personDescriptions.push({
            $type$: 'PersonName',
            name: iopPeer.initialName
        });
    }

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

    await leute.trust.certify('TrustKeysCertificate', {
        profile: profile.loadedVersion
    });

    if (iopPeer.group) {
        const replicantGroup = await GroupModel.constructWithNewGroup(iopPeer.group);
        if (!replicantGroup.persons.includes(profile.personId)) {
            replicantGroup.persons.push(profile.personId);
            await replicantGroup.saveAndLoad();
        }
    }

    await leute.addProfile(profile.idHash);
}

/**
 * Gets the hash for a group by name.
 * Uses GroupModel's static method to handle group lookup.
 */
export async function getGroupHash(groupName: string): Promise<SHA256IdHash<Group> | undefined> {
    try {
        const group = await GroupModel.constructFromLatestProfileVersionByGroupName(groupName);
        return group.groupIdHash;
    } catch (error) {
        // Group doesn't exist
        return undefined;
    }
} 