import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {Group, Person} from '@refinio/one.core/lib/recipes.js';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {VersionedObjectResult} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {
    getObjectByIdHash,
    storeVersionedObject
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {exists} from '@refinio/one.core/lib/system/storage-base.js';
import objectEvents from '@refinio/one.models/lib/misc/ObjectEventDispatcher';

// ######## Name based interface ########

/**
 * Event that will fire when the group members change.
 *
 * @param groupName
 * @param cb
 * @param cbDescription
 */
export async function onGroupChangeByName(
    groupName: string,
    cb: (result: VersionedObjectResult<Group>) => Promise<void> | void,
    cbDescription: string
): Promise<() => void> {
    return onGroupChange(
        await calculateIdHashOfObj<Group>({$type$: 'Group', name: groupName, person: []}),
        cb,
        cbDescription
    );
}

/**
 * Create a new group if it does not exist.
 *
 * @param groupName
 * @param initialPersons
 */
export async function createGroupIfNotExist(
    groupName: string,
    initialPersons: SHA256IdHash<Person>[] = []
) {
    const groupId = await getGroupIdByName(groupName);

    if (await exists(groupId, 'vmaps')) {
        return;
    }

    await storeVersionedObject({$type$: 'Group', name: groupName, person: initialPersons});
}

/**
 * Get group members or empty list if it does not exist.
 *
 * @param groupName
 */
export async function getGroupMembersByName(groupName: string): Promise<SHA256IdHash<Person>[]> {
    try {
        return getGroupMembers(await getGroupIdByName(groupName));
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'FileNotFoundError') {
            throw new Error(`getGroupMembersByName: Group ${groupName} does not exist.`);
        }
        throw error;
    }
}

/**
 * Add person to group.
 *
 * @throws if group does not exist.
 * @param groupName
 * @param person
 */
export async function addPersonToGroupByName(
    groupName: string,
    person: SHA256IdHash<Person>
): Promise<void> {
    try {
        await addPersonToGroup(await getGroupIdByName(groupName), person);
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'FileNotFoundError') {
            throw new Error(`addPersonToGroupByName: Group ${groupName} does not exist.`);
        }
        throw error;
    }
}

/**
 * Remove person from group or do nothing if it does not exist.
 *
 * @param groupName
 * @param person
 */
export async function removePersonFromGroupByName(
    groupName: string,
    person: SHA256IdHash<Person>
): Promise<void> {
    try {
        await removePersonFromGroup(await getGroupIdByName(groupName), person);
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'FileNotFoundError') {
            throw new Error(`removePersonFromGroupByName: Group ${groupName} does not exist.`);
        }
        throw error;
    }
}

// ######## Id based interface ########

/**
 * Event that will fire when the group members change.
 *
 * @param groupId
 * @param cb
 * @param cbDescription
 */
export function onGroupChange(
    groupId: SHA256IdHash<Group>,
    cb: (result: VersionedObjectResult<Group>) => Promise<void> | void,
    cbDescription: string
): () => void {
    return objectEvents.onNewVersion(cb, cbDescription, 'Group', groupId);
}

/**
 * Get group members or empty list if it does not exist.
 *
 * @param groupId
 */
export async function getGroupMembers(
    groupId: SHA256IdHash<Group>
): Promise<SHA256IdHash<Person>[]> {
    const group = await getObjectByIdHash(groupId);
    return group.obj.person;
}

/**
 * Add person to group or throw if group does not exist.
 *
 * @param groupId
 * @param person
 */
export async function addPersonToGroup(
    groupId: SHA256IdHash<Group>,
    person: SHA256IdHash<Person>
): Promise<void> {
    const group = await getObjectByIdHash(groupId);

    if (!group.obj.person.includes(person)) {
        group.obj.person.push(person);
        await storeVersionedObject(group.obj);
    }
}

/**
 * Remove person from group or throw if group does not exist.
 *
 * @param groupId
 * @param person
 */
export async function removePersonFromGroup(
    groupId: SHA256IdHash<Group>,
    person: SHA256IdHash<Person>
): Promise<void> {
    const group = await getObjectByIdHash(groupId);

    if (group.obj.person.includes(person)) {
        group.obj.person = group.obj.person.filter(p => p !== person);
        await storeVersionedObject(group.obj);
    }
}

/**
 * Get the group id from the group name.
 *
 * @param groupName
 */
export async function getGroupIdByName(groupName: string): Promise<SHA256IdHash<Group>> {
    return calculateIdHashOfObj<Group>({$type$: 'Group', name: groupName, person: []});
}

/**
 * Get the hash of a group by name, if it exists.
 *
 * @param groupName - The name of the group
 * @returns The group hash if it exists, undefined otherwise
 */
export async function getGroupHash(groupName: string): Promise<SHA256IdHash<Group> | undefined> {
    const groupHash = await calculateIdHashOfObj<Group>({$type$: 'Group', name: groupName, person: []});
    if (await exists(groupHash)) {
        return groupHash;
    }
}

export default {
    onGroupChange,
    onGroupChangeByName,
    createGroupIfNotExist,
    getGroupMembers,
    getGroupMembersByName,
    addPersonToGroup,
    addPersonToGroupByName,
    removePersonFromGroup,
    removePersonFromGroupByName,
    getGroupIdByName
};