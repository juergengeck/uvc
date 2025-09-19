import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

const ORGANISATION_REGISTRY_KEY = 'organisation_registry';
const DEPARTMENT_REGISTRY_KEY = 'department_registry';
const ROOM_REGISTRY_KEY = 'room_registry';

/**
 * Registry for tracking organization, department, and room hashes
 * Since ONE.core doesn't provide query-by-type functionality,
 * we maintain our own registry of object hashes
 */

export async function addOrganisationHash(hash: SHA256Hash): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(ORGANISATION_REGISTRY_KEY);
    const hashes: string[] = stored ? JSON.parse(stored) : [];
    
    if (!hashes.includes(hash)) {
      hashes.push(hash);
      await AsyncStorage.setItem(ORGANISATION_REGISTRY_KEY, JSON.stringify(hashes));
    }
  } catch (error) {
    console.error('[OrganisationRegistry] Error adding organisation hash:', error);
  }
}

export async function getOrganisationHashes(): Promise<SHA256Hash[]> {
  try {
    const stored = await AsyncStorage.getItem(ORGANISATION_REGISTRY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[OrganisationRegistry] Error getting organisation hashes:', error);
    return [];
  }
}

export async function addDepartmentHash(hash: SHA256Hash): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(DEPARTMENT_REGISTRY_KEY);
    const hashes: string[] = stored ? JSON.parse(stored) : [];
    
    if (!hashes.includes(hash)) {
      hashes.push(hash);
      await AsyncStorage.setItem(DEPARTMENT_REGISTRY_KEY, JSON.stringify(hashes));
    }
  } catch (error) {
    console.error('[OrganisationRegistry] Error adding department hash:', error);
  }
}

export async function getDepartmentHashes(): Promise<SHA256Hash[]> {
  try {
    const stored = await AsyncStorage.getItem(DEPARTMENT_REGISTRY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[OrganisationRegistry] Error getting department hashes:', error);
    return [];
  }
}

export async function addRoomHash(hash: SHA256Hash): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(ROOM_REGISTRY_KEY);
    const hashes: string[] = stored ? JSON.parse(stored) : [];
    
    if (!hashes.includes(hash)) {
      hashes.push(hash);
      await AsyncStorage.setItem(ROOM_REGISTRY_KEY, JSON.stringify(hashes));
    }
  } catch (error) {
    console.error('[OrganisationRegistry] Error adding room hash:', error);
  }
}

export async function getRoomHashes(): Promise<SHA256Hash[]> {
  try {
    const stored = await AsyncStorage.getItem(ROOM_REGISTRY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[OrganisationRegistry] Error getting room hashes:', error);
    return [];
  }
}

export async function removeOrganisationHash(hash: SHA256Hash): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(ORGANISATION_REGISTRY_KEY);
    const hashes: string[] = stored ? JSON.parse(stored) : [];
    const filtered = hashes.filter(h => h !== hash);
    await AsyncStorage.setItem(ORGANISATION_REGISTRY_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('[OrganisationRegistry] Error removing organisation hash:', error);
  }
}

export async function removeDepartmentHash(hash: SHA256Hash): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(DEPARTMENT_REGISTRY_KEY);
    const hashes: string[] = stored ? JSON.parse(stored) : [];
    const filtered = hashes.filter(h => h !== hash);
    await AsyncStorage.setItem(DEPARTMENT_REGISTRY_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('[OrganisationRegistry] Error removing department hash:', error);
  }
}

export async function removeRoomHash(hash: SHA256Hash): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(ROOM_REGISTRY_KEY);
    const hashes: string[] = stored ? JSON.parse(stored) : [];
    const filtered = hashes.filter(h => h !== hash);
    await AsyncStorage.setItem(ROOM_REGISTRY_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('[OrganisationRegistry] Error removing room hash:', error);
  }
}