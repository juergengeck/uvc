import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { Organisation, Department, Room } from '@OneObjectInterfaces';

/**
 * Name-based registry for organizations, departments, and rooms.
 * Since objects get new hashes when updated, we use names as stable identifiers
 * and track the current hash for each named entity.
 */

const ORG_NAME_REGISTRY_KEY = 'org_name_registry';
const DEPT_NAME_REGISTRY_KEY = 'dept_name_registry';
const ROOM_NAME_REGISTRY_KEY = 'room_name_registry';

interface NamedEntity {
  name: string;
  hash: SHA256Hash;
  parentName?: string; // For departments and rooms
}

// Organisation name -> hash mapping
export async function setOrganisationByName(name: string, hash: SHA256Hash): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(ORG_NAME_REGISTRY_KEY);
    const registry: Record<string, SHA256Hash> = stored ? JSON.parse(stored) : {};
    registry[name] = hash;
    await AsyncStorage.setItem(ORG_NAME_REGISTRY_KEY, JSON.stringify(registry));
    console.log('[NameRegistry] Set organisation', name, 'to hash', hash);
  } catch (error) {
    console.error('[NameRegistry] Error setting organisation by name:', error);
  }
}

export async function getOrganisationByName(name: string): Promise<Organisation | null> {
  try {
    const stored = await AsyncStorage.getItem(ORG_NAME_REGISTRY_KEY);
    const registry: Record<string, SHA256Hash> = stored ? JSON.parse(stored) : {};
    const hash = registry[name];
    
    if (!hash) {
      console.log('[NameRegistry] No hash found for organisation:', name);
      return null;
    }
    
    const org = await getObject<Organisation>(hash);
    return org;
  } catch (error) {
    console.error('[NameRegistry] Error getting organisation by name:', error);
    return null;
  }
}

export async function getAllOrganisationNames(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(ORG_NAME_REGISTRY_KEY);
    const registry: Record<string, SHA256Hash> = stored ? JSON.parse(stored) : {};
    return Object.keys(registry);
  } catch (error) {
    console.error('[NameRegistry] Error getting organisation names:', error);
    return [];
  }
}

export async function getOrganisationHashByName(name: string): Promise<SHA256Hash | null> {
  try {
    const stored = await AsyncStorage.getItem(ORG_NAME_REGISTRY_KEY);
    const registry: Record<string, SHA256Hash> = stored ? JSON.parse(stored) : {};
    return registry[name] || null;
  } catch (error) {
    console.error('[NameRegistry] Error getting organisation hash by name:', error);
    return null;
  }
}

// Department name -> hash mapping (with organisation context)
export async function setDepartmentByName(orgName: string, deptName: string, hash: SHA256Hash): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(DEPT_NAME_REGISTRY_KEY);
    const registry: Record<string, NamedEntity> = stored ? JSON.parse(stored) : {};
    const key = `${orgName}:${deptName}`;
    registry[key] = {
      name: deptName,
      hash: hash,
      parentName: orgName
    };
    await AsyncStorage.setItem(DEPT_NAME_REGISTRY_KEY, JSON.stringify(registry));
    console.log('[NameRegistry] Set department', key, 'to hash', hash);
  } catch (error) {
    console.error('[NameRegistry] Error setting department by name:', error);
  }
}

export async function getDepartmentByName(orgName: string, deptName: string): Promise<Department | null> {
  try {
    const stored = await AsyncStorage.getItem(DEPT_NAME_REGISTRY_KEY);
    const registry: Record<string, NamedEntity> = stored ? JSON.parse(stored) : {};
    const key = `${orgName}:${deptName}`;
    const entity = registry[key];
    
    if (!entity) {
      console.log('[NameRegistry] No hash found for department:', key);
      return null;
    }
    
    const dept = await getObject<Department>(entity.hash);
    return dept;
  } catch (error) {
    console.error('[NameRegistry] Error getting department by name:', error);
    return null;
  }
}

export async function getDepartmentHashByName(orgName: string, deptName: string): Promise<SHA256Hash | null> {
  try {
    const stored = await AsyncStorage.getItem(DEPT_NAME_REGISTRY_KEY);
    const registry: Record<string, NamedEntity> = stored ? JSON.parse(stored) : {};
    const key = `${orgName}:${deptName}`;
    const entity = registry[key];
    return entity?.hash || null;
  } catch (error) {
    console.error('[NameRegistry] Error getting department hash by name:', error);
    return null;
  }
}

export async function getDepartmentsByOrganisation(orgName: string): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(DEPT_NAME_REGISTRY_KEY);
    const registry: Record<string, NamedEntity> = stored ? JSON.parse(stored) : {};
    
    return Object.entries(registry)
      .filter(([_, entity]) => entity.parentName === orgName)
      .map(([_, entity]) => entity.name);
  } catch (error) {
    console.error('[NameRegistry] Error getting departments by organisation:', error);
    return [];
  }
}

// Room name -> hash mapping (with department context)
export async function setRoomByName(orgName: string, deptName: string, roomName: string, hash: SHA256Hash): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(ROOM_NAME_REGISTRY_KEY);
    const registry: Record<string, NamedEntity> = stored ? JSON.parse(stored) : {};
    const key = `${orgName}:${deptName}:${roomName}`;
    registry[key] = {
      name: roomName,
      hash: hash,
      parentName: `${orgName}:${deptName}`
    };
    await AsyncStorage.setItem(ROOM_NAME_REGISTRY_KEY, JSON.stringify(registry));
    console.log('[NameRegistry] Set room', key, 'to hash', hash);
  } catch (error) {
    console.error('[NameRegistry] Error setting room by name:', error);
  }
}

export async function getRoomByName(orgName: string, deptName: string, roomName: string): Promise<Room | null> {
  try {
    const stored = await AsyncStorage.getItem(ROOM_NAME_REGISTRY_KEY);
    const registry: Record<string, NamedEntity> = stored ? JSON.parse(stored) : {};
    const key = `${orgName}:${deptName}:${roomName}`;
    const entity = registry[key];
    
    if (!entity) {
      console.log('[NameRegistry] No hash found for room:', key);
      return null;
    }
    
    const room = await getObject<Room>(entity.hash);
    return room;
  } catch (error) {
    console.error('[NameRegistry] Error getting room by name:', error);
    return null;
  }
}

export async function getRoomsByDepartment(orgName: string, deptName: string): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(ROOM_NAME_REGISTRY_KEY);
    const registry: Record<string, NamedEntity> = stored ? JSON.parse(stored) : {};
    const parentKey = `${orgName}:${deptName}`;
    
    return Object.entries(registry)
      .filter(([_, entity]) => entity.parentName === parentKey)
      .map(([_, entity]) => entity.name);
  } catch (error) {
    console.error('[NameRegistry] Error getting rooms by department:', error);
    return [];
  }
}