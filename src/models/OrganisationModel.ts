import { StateMachine } from '@refinio/one.models/lib/misc/StateMachine.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { Organisation, Department, Room } from '@OneObjectInterfaces';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { getInstanceOwnerIdHash } from '@refinio/one.core/lib/instance.js';

const ORGANISATIONS_CHANNEL_NAME = 'organisations-registry';

// Define state and event types for consistency with AppModel pattern
export type OrganisationModelState = 'Uninitialised' | 'Initialising' | 'Initialised';
export type OrganisationModelEvent = 'init' | 'ready' | 'error';

/**
 * Model for managing organizations, departments, and rooms
 * Uses ONE.core channels to store and query organizational structure
 */
export default class OrganisationModel extends StateMachine<OrganisationModelState, OrganisationModelEvent> {
  private channelManager: ChannelManager;
  private organisationsChannelId?: string;
  private channelOwner?: SHA256IdHash;

  constructor(channelManager: ChannelManager) {
    super();
    
    // Set up states properly following AppModel pattern
    this.addState('Uninitialised');
    this.addState('Initialising');
    this.addState('Initialised');
    this.setInitialState('Uninitialised');
    
    // Set up events
    this.addEvent('init');
    this.addEvent('ready');
    this.addEvent('error');
    
    // Set up transitions
    this.addTransition('init', 'Uninitialised', 'Initialising');
    this.addTransition('ready', 'Initialising', 'Initialised');
    this.addTransition('error', 'Initialising', 'Uninitialised');
    
    this.channelManager = channelManager;
  }

  async init(): Promise<void> {
    if (this.currentState !== 'Uninitialised') {
      console.log('[OrganisationModel] Already initialized, state:', this.currentState);
      return;
    }

    console.log('[OrganisationModel] Starting initialization...');
    this.triggerEvent('init'); // Uninitialised -> Initialising

    try {
      // Wait for channel manager to be ready
      if (!this.channelManager) {
        throw new Error('ChannelManager not provided');
      }
      
      console.log('[OrganisationModel] Creating/getting organisations channel...');
      // Create or get the organisations channel
      const owner = await getInstanceOwnerIdHash();
      if (!owner) {
        throw new Error('Could not get instance owner ID');
      }
      this.channelOwner = owner; // Store for later use in postToChannel
      console.log('[OrganisationModel] Owner for channel:', owner);
      
      // Use the channel name directly as the channel ID (like appJournal does)
      this.organisationsChannelId = ORGANISATIONS_CHANNEL_NAME;
      
      try {
        // Create the channel
        await this.channelManager.createChannel(this.organisationsChannelId, owner);
        console.log('[OrganisationModel] Channel created successfully:', this.organisationsChannelId);
      } catch (channelError) {
        if (!channelError.message?.includes('already exists')) {
          console.error('[OrganisationModel] Error creating channel:', channelError);
          throw channelError;
        }
        console.log('[OrganisationModel] Channel already exists:', this.organisationsChannelId);
      }
      
      console.log('[OrganisationModel] ✅ Initialized with channel ID:', this.organisationsChannelId);
      
      this.triggerEvent('ready'); // Initialising -> Initialised
    } catch (error) {
      console.error('[OrganisationModel] ❌ Failed to initialize:', error);
      this.triggerEvent('error'); // Initialising -> Uninitialised
      throw error;
    }
  }

  /**
   * Create a new organization and store it in the channel
   */
  async createOrganisation(name: string, description?: string, owner?: SHA256IdHash): Promise<SHA256Hash> {
    if (this.currentState !== 'Initialised') {
      throw new Error('OrganisationModel not initialized');
    }

    const organisation: Organisation = {
      $type$: 'Organisation',
      name,
      description,
      owner: owner || getInstanceOwnerIdHash(),
      created: Date.now(),
      modified: Date.now(),
      departments: [],
      settings: {}
    };

    const result = await storeUnversionedObject(organisation);
    
    // Post to channel so we can query it later
    if (this.organisationsChannelId && this.channelOwner) {
      console.log('[OrganisationModel] About to post to channel:', {
        channelId: this.organisationsChannelId,
        channelIdType: typeof this.organisationsChannelId,
        expectedChannelId: ORGANISATIONS_CHANNEL_NAME,
        hash: result.hash,
        owner: this.channelOwner
      });
      await this.channelManager.postToChannel(this.organisationsChannelId, result.hash, this.channelOwner);
    }
    
    console.log('[OrganisationModel] Created organisation:', name, 'with hash:', result.hash);
    return result.hash;
  }

  /**
   * Get all organizations from the channel with their hashes
   */
  async getAllOrganisations(): Promise<Array<{ hash: SHA256Hash; organisation: Organisation }>> {
    console.log('[OrganisationModel] getAllOrganisations called, state:', this.currentState, 'channelId:', this.organisationsChannelId);
    
    if (this.currentState !== 'Initialised') {
      console.warn('[OrganisationModel] Not initialized, current state:', this.currentState);
      return [];
    }
    
    if (!this.organisationsChannelId) {
      console.warn('[OrganisationModel] No channel ID available');
      return [];
    }

    try {
      console.log('[OrganisationModel] Querying organisations from channel...');
      // Use getObjects instead of getObjectsWithType
      const results = await this.channelManager.getObjects({ 
        channelId: this.organisationsChannelId,
        type: 'Organisation'
      });
      
      console.log('[OrganisationModel] Found', results?.length || 0, 'organisations');
      
      if (results && results.length > 0) {
        console.log('[OrganisationModel] First result keys:', Object.keys(results[0]));
        console.log('[OrganisationModel] First result data:', typeof results[0].data, results[0].dataHash);
      }
      
      // getObjects returns channel entries with data field containing the hash
      const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
      
      const orgsWithHashes = [];
      for (const entry of results || []) {
        try {
          // The data field contains the hash of the actual object
          const orgHash = entry.dataHash || entry.data;
          const org = await getObject<Organisation>(orgHash);
          
          if (org && org.$type$ === 'Organisation') {
            orgsWithHashes.push({
              hash: orgHash,
              organisation: org
            });
          }
        } catch (error) {
          console.warn('[OrganisationModel] Error loading organisation:', error);
        }
      }
      
      console.log('[OrganisationModel] Loaded', orgsWithHashes.length, 'organisations');
      return orgsWithHashes;
    } catch (error) {
      console.error('[OrganisationModel] ❌ Error getting organisations:', error);
      return [];
    }
  }

  /**
   * Create a department within an organization
   */
  async createDepartment(
    organisationHash: SHA256Hash,
    name: string,
    description?: string
  ): Promise<SHA256Hash> {
    if (this.currentState !== 'Initialised') {
      throw new Error('OrganisationModel not initialized');
    }

    const department: Department = {
      $type$: 'Department',
      name,
      description,
      owner: getInstanceOwnerIdHash(),
      organisation: organisationHash,
      created: Date.now(),
      modified: Date.now(),
      rooms: [],
      settings: {}
    };

    const deptResult = await storeUnversionedObject(department);
    
    // Post the department to channel
    if (this.organisationsChannelId && this.channelOwner) {
      await this.channelManager.postToChannel(this.organisationsChannelId, deptResult.hash, this.channelOwner);
    }
    
    console.log('[OrganisationModel] Created department:', name);
    return deptResult.hash;
  }

  /**
   * Get all departments across all organizations with their hashes
   */
  async getAllDepartments(): Promise<Array<{ hash: SHA256Hash; department: Department }>> {
    console.log('[OrganisationModel] getAllDepartments called, state:', this.currentState);
    
    if (this.currentState !== 'Initialised' || !this.organisationsChannelId) {
      console.warn('[OrganisationModel] Not ready for departments query');
      return [];
    }

    try {
      const results = await this.channelManager.getObjects({
        channelId: this.organisationsChannelId,
        type: 'Department'
      });
      
      console.log('[OrganisationModel] Found', results?.length || 0, 'departments');
      
      // getObjects returns channel entries with data field containing the hash
      const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
      
      const deptsWithHashes = [];
      for (const entry of results || []) {
        try {
          const deptHash = entry.dataHash || entry.data;
          const dept = await getObject<Department>(deptHash);
          
          if (dept && dept.$type$ === 'Department') {
            deptsWithHashes.push({
              hash: deptHash,
              department: dept
            });
          }
        } catch (error) {
          console.warn('[OrganisationModel] Error loading department:', error);
        }
      }
      
      return deptsWithHashes;
    } catch (error) {
      console.error('[OrganisationModel] ❌ Error getting departments:', error);
      return [];
    }
  }

  /**
   * Get a specific organization by hash
   */
  private async getOrganisation(hash: SHA256Hash): Promise<Organisation | null> {
    try {
      const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
      return await getObject<Organisation>(hash);
    } catch (error) {
      console.error('[OrganisationModel] Error getting organisation:', error);
      return null;
    }
  }

  /**
   * Create a room within a department
   */
  async createRoom(
    departmentHash: SHA256Hash,
    name: string,
    description?: string
  ): Promise<SHA256Hash> {
    if (this.currentState !== 'Initialised') {
      throw new Error('OrganisationModel not initialized');
    }

    const room: Room = {
      $type$: 'Room',
      name,
      description,
      owner: getInstanceOwnerIdHash(),
      department: departmentHash,
      created: Date.now(),
      modified: Date.now(),
      devices: [],
      settings: {}
    };

    const roomResult = await storeUnversionedObject(room);
    
    // Post the room to channel
    if (this.organisationsChannelId && this.channelOwner) {
      await this.channelManager.postToChannel(this.organisationsChannelId, roomResult.hash, this.channelOwner);
    }
    
    console.log('[OrganisationModel] Created room:', name);
    return roomResult.hash;
  }

  /**
   * Get all rooms across all departments with their hashes
   */
  async getAllRooms(): Promise<Array<{ hash: SHA256Hash; room: Room }>> {
    console.log('[OrganisationModel] getAllRooms called, state:', this.currentState);
    
    if (this.currentState !== 'Initialised' || !this.organisationsChannelId) {
      console.warn('[OrganisationModel] Not ready for rooms query');
      return [];
    }

    try {
      const results = await this.channelManager.getObjects({
        channelId: this.organisationsChannelId,
        type: 'Room'
      });
      
      console.log('[OrganisationModel] Found', results?.length || 0, 'rooms from channel');
      
      // getObjects returns channel entries with data field containing the hash
      const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
      
      const roomsWithHashes = [];
      for (const entry of results || []) {
        try {
          const roomHash = entry.dataHash || entry.data;
          const room = await getObject<Room>(roomHash);
          
          if (room && room.$type$ === 'Room') {
            console.log('[OrganisationModel] Loaded room:', room.name, 'department:', room.department);
            roomsWithHashes.push({
              hash: roomHash,
              room: room
            });
          }
        } catch (error) {
          console.warn('[OrganisationModel] Error loading room:', error);
        }
      }
      
      console.log('[OrganisationModel] Returning', roomsWithHashes.length, 'rooms total');
      return roomsWithHashes;
    } catch (error) {
      console.error('[OrganisationModel] ❌ Error getting rooms:', error);
      return [];
    }
  }

  /**
   * Add a device to a room
   */
  async addDeviceToRoom(roomHash: SHA256Hash, deviceId: string): Promise<void> {
    if (this.currentState !== 'Initialised') {
      throw new Error('OrganisationModel not initialized');
    }

    const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
    const room = await getObject<Room>(roomHash);
    
    if (!room || room.$type$ !== 'Room') {
      throw new Error('Room not found');
    }

    // Add device to room if not already present
    const devices = room.devices || [];
    if (!devices.includes(deviceId)) {
      room.devices = [...devices, deviceId];
      room.modified = Date.now();
      
      // Store updated room
      const updatedResult = await storeUnversionedObject(room);
      
      // Post update to channel
      if (this.organisationsChannelId && this.channelOwner) {
        await this.channelManager.postToChannel(this.organisationsChannelId, updatedResult.hash, this.channelOwner);
      }
      
      console.log('[OrganisationModel] Added device', deviceId, 'to room', room.name);
    }
  }

  /**
   * Remove a device from a room
   */
  async removeDeviceFromRoom(roomHash: SHA256Hash, deviceId: string): Promise<void> {
    if (this.currentState !== 'Initialised') {
      throw new Error('OrganisationModel not initialized');
    }

    const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
    const room = await getObject<Room>(roomHash);
    
    if (!room || room.$type$ !== 'Room') {
      throw new Error('Room not found');
    }

    // Remove device from room
    if (room.devices && room.devices.includes(deviceId)) {
      room.devices = room.devices.filter(id => id !== deviceId);
      room.modified = Date.now();
      
      // Store updated room
      const updatedResult = await storeUnversionedObject(room);
      
      // Post update to channel
      if (this.organisationsChannelId && this.channelOwner) {
        await this.channelManager.postToChannel(this.organisationsChannelId, updatedResult.hash, this.channelOwner);
      }
      
      console.log('[OrganisationModel] Removed device', deviceId, 'from room', room.name);
    }
  }

  /**
   * Get the full organisation path for a device (Organisation - Department - Room)
   * Returns null if device is not assigned to a room
   */
  async getDeviceOrganisationPath(deviceId: string): Promise<{
    organisation: Organisation;
    department: Department;
    room: Room;
    path: string;
  } | null> {
    if (this.currentState !== 'Initialised') {
      return null;
    }

    try {
      // Find room containing the device
      const rooms = await this.getAllRooms();
      const roomEntry = rooms.find(r => r.room.devices?.includes(deviceId));
      
      if (!roomEntry) {
        return null;
      }

      const room = roomEntry.room;
      
      // Get department
      const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
      const department = await getObject<Department>(room.department);
      
      if (!department || department.$type$ !== 'Department') {
        return null;
      }

      // Get organisation
      const organisation = await getObject<Organisation>(department.organisation);
      
      if (!organisation || organisation.$type$ !== 'Organisation') {
        return null;
      }

      const path = `${organisation.name} - ${department.name} - ${room.name}`;
      
      return {
        organisation,
        department,
        room,
        path
      };
    } catch (error) {
      console.error('[OrganisationModel] Error getting device path:', error);
      return null;
    }
  }

  /**
   * Get all rooms a device is assigned to
   */
  async getDeviceRooms(deviceId: string): Promise<Array<{ hash: SHA256Hash; room: Room }>> {
    if (this.currentState !== 'Initialised') {
      return [];
    }

    const rooms = await this.getAllRooms();
    return rooms.filter(r => r.room.devices?.includes(deviceId));
  }
}