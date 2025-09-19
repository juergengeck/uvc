import type { Group, Person } from '@refinio/one.core/lib/recipes';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object';
import { exists } from '@refinio/one.core/lib/system/storage-base';
import GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel';
import type { LeuteModel } from '@refinio/one.models/lib/models';

async function getGroupHashId(groupName: string): Promise<SHA256IdHash<Group> | undefined> {
    const group: Group = {$type$: 'Group', name: groupName, person: []};
    const groupHash = await calculateIdHashOfObj(group);

    if (await exists(groupHash)) {
        return groupHash as SHA256IdHash<Group>;
    }

    return undefined;
}

export async function getGroup(name: string): Promise<GroupModel> {
    const groupIdHash = await getGroupHashId(name);

    if (groupIdHash === undefined) {
        return GroupModel.constructWithNewGroup(name);
    } else {
        return GroupModel.constructFromLatestProfileVersion(groupIdHash);
    }
}

export async function getPersonIdsForRole(
    leuteModel: LeuteModel,
    isRole: (personId: SHA256IdHash<Person>) => Promise<boolean>,
    exclude?: Array<SHA256IdHash<Person>>
): Promise<Array<SHA256IdHash<Person>>> {
    const someones = [...(await leuteModel.others()), await leuteModel.me()];

    const role: Array<SHA256IdHash<Person>> = [];

    for (const someone of someones) {
        for (const identity of someone.identities()) {
            if (exclude === undefined || !exclude.includes(identity)) {
                if (await isRole(identity)) {
                    role.push(identity);
                }
            }
        }
    }

    return role;
} 