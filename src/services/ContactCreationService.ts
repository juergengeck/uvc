/**
 * ContactCreationService - Handles automatic contact creation during pairing
 * 
 * This service fixes the issue where PairingManager's automatic contact creation
 * doesn't work properly, causing leuteModel.others() to return empty results
 * despite successful network connections.
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';

export class ContactCreationService {
    private leuteModel: LeuteModel;

    constructor(leuteModel: LeuteModel) {
        this.leuteModel = leuteModel;
    }

    /**
     * Create a contact for a Person ID after successful pairing
     * This follows the proper one.models contact creation pattern
     */
    public async createContactFromPairing(
        remotePersonId: SHA256IdHash<Person>,
        remoteInstanceId?: string,
        token?: string
    ): Promise<boolean> {
        console.log('[ContactCreationService] Creating contact for paired Person:', remotePersonId.toString().slice(0, 16) + '...');

        try {
            // Check if contact already exists
            const existingContacts = await this.leuteModel.others();
            
            // Check each contact to see if one already exists for this Person ID
            for (const contact of existingContacts) {
                try {
                    const contactPersonId = await contact.mainIdentity();
                    if (contactPersonId.toString() === remotePersonId.toString()) {
                        console.log('[ContactCreationService] Contact already exists for Person ID');
                        
                        // Even if contact exists, ensure topic exists for messaging
                        await this.ensureTopicExists(remotePersonId);
                        
                        return true; // Already exists, success
                    }
                } catch (error) {
                    console.warn('[ContactCreationService] Error checking existing contact:', error);
                }
            }

            console.log('[ContactCreationService] Creating new contact for paired Person...');

            // Try to get the Person object first - but don't fail if it's not available yet
            const { getObjectByIdHash } = await import('@refinio/one.core/lib/storage-versioned-objects.js');
            let personResult;
            try {
                personResult = await getObjectByIdHash(remotePersonId);
                if (personResult?.obj) {
                    console.log('[ContactCreationService] ✅ Person object found in storage');
                } else {
                    console.log('[ContactCreationService] ⚠️ Person object not found in storage yet - will create contact anyway and let ONE protocol sync it');
                }
            } catch (error) {
                console.log('[ContactCreationService] ⚠️ Person object not available yet - will create contact anyway and let ONE protocol sync it:', error);
                // This is expected during pairing - the Person object will be synced by the ONE protocol
                // We should still create the contact so the user can see it in the UI
            }

            // FIXED: Use existing Someone object for this Person ID instead of creating duplicates
            console.log('[ContactCreationService] Looking for existing Someone for Person...');
            let someoneIdHash;
            
            try {
                // First, try to get existing Someone object for this Person ID
                const existingSomeone = await this.leuteModel.getSomeone(remotePersonId);
                
                if (existingSomeone) {
                    someoneIdHash = existingSomeone.idHash;
                    console.log('[ContactCreationService] ✅ Found existing Someone object:', someoneIdHash.toString().slice(0, 16) + '...');
                } else {
                    // Create Someone using the fixed contactUtils function
                    console.log('[ContactCreationService] Creating Someone for Person...');
                    const { createProfileAndSomeoneForPerson } = await import('../utils/contactUtils');
                    const someone = await createProfileAndSomeoneForPerson(remotePersonId, this.leuteModel, {});
                    someoneIdHash = someone.idHash;
                    console.log('[ContactCreationService] ✅ Someone created:', someoneIdHash.toString().slice(0, 16) + '...');
                }
                
            } catch (getSomeoneError) {
                // If getSomeone fails, try to create Someone using the fixed contactUtils function
                console.log('[ContactCreationService] Someone not found, creating new one...');
                
                const { createProfileAndSomeoneForPerson } = await import('../utils/contactUtils');
                const someone = await createProfileAndSomeoneForPerson(remotePersonId, this.leuteModel, {});
                someoneIdHash = someone.idHash;
                console.log('[ContactCreationService] ✅ Someone created:', someoneIdHash.toString().slice(0, 16) + '...');
            }
            
            if (!someoneIdHash) {
                throw new Error('Failed to get or create Someone for Person');
            }
            
            // Add the Someone to contacts
            console.log('[ContactCreationService] Adding Someone to contacts...');
            await this.leuteModel.addSomeoneElse(someoneIdHash);
            console.log('[ContactCreationService] ✅ Contact added to LeuteModel');
            
            // Note: Connection enabling is handled automatically by the pairing process
            
            // Create one-to-one topic for messaging  
            await this.ensureTopicExists(remotePersonId);
            
            // CRITICAL: Enable persistent connection for CHUM replication
            // After pairing, we need a long-lived connection to stream objects between devices
            
            try {
                const connectionsModel = await this.waitForLeuteConnectionsModule();
                if (connectionsModel) {
                    await connectionsModel.leuteConnectionsModule.enableConnectionsForPerson(remotePersonId);
                    
                    // Note: CHUM protocol connections should be established automatically by ConnectionsModel
                    // We don't need to manually call connectToInstance - that's not how one.leute does it
                    
                    // Connection verification removed - trust the platform
                } else {
                    console.error('[ContactCreationService] ❌ LeuteConnectionsModule.enableConnectionsForPerson not available (timeout)');
                    throw new Error('Cannot enable persistent connection - LeuteConnectionsModule not available');
                }
            } catch (connectionError) {
                console.error('[ContactCreationService] ❌ Failed to enable persistent connection:', connectionError);
                throw connectionError;
            }
            
            console.log('[ContactCreationService] ✅ Contact and topic creation completed successfully');
            return true;

        } catch (error) {
            console.error('[ContactCreationService] ❌ Contact creation failed:', error);
            return false;
        }
    }
    
    /**
     * Ensure a one-to-one topic exists for messaging with the given Person
     */
    private async ensureTopicExists(remotePersonId: SHA256IdHash<Person>): Promise<void> {
        try {
            console.log('[ContactCreationService] Ensuring topic exists for messaging...');
            
            // Get the app model to access TopicModel
            const { ModelService } = await import('../services/ModelService');
            const appModel = ModelService.getModel();
            
            if (appModel?.topicModel) {
                // Get my Person ID
                const myPersonId = await this.leuteModel.myMainIdentity();
                
                if (myPersonId) {
                    // TopicModel.createOneToOneTopic already handles ID sorting internally
                    // Let it create the proper topic ID: [personId1]<->[personId2] where IDs are sorted
                    console.log(`[ContactCreationService] 🔍 TOPIC CREATION DEBUG:`);
                    console.log(`[ContactCreationService] 🔍 My Person ID: ${myPersonId.toString()}`);
                    console.log(`[ContactCreationService] 🔍 Remote Person ID: ${remotePersonId.toString()}`);
                    console.log(`[ContactCreationService] 🔍 My Person ID (short): ${myPersonId.toString().substring(0, 8)}...${myPersonId.toString().substring(myPersonId.toString().length - 8)}`);
                    console.log(`[ContactCreationService] 🔍 Remote Person ID (short): ${remotePersonId.toString().substring(0, 8)}...${remotePersonId.toString().substring(remotePersonId.toString().length - 8)}`);
                    
                    // Use createOneToOneTopic directly - it handles sorting and deduplication internally
                    let topic;
                    try {
                        console.log(`[ContactCreationService] Creating one-to-one topic with person IDs`);
                        topic = await appModel.topicModel.createOneToOneTopic(
                            myPersonId,
                            remotePersonId
                        );
                        console.log(`[ContactCreationService] ✅ Topic created/found: ${topic?.id}`);
                        console.log(`[ContactCreationService] 🔍 Expected topic contains my ID: ${topic?.id?.includes(myPersonId.toString()) ? '✅' : '❌'}`);
                        console.log(`[ContactCreationService] 🔍 Expected topic contains remote ID: ${topic?.id?.includes(remotePersonId.toString()) ? '✅' : '❌'}`);
                    } catch (error) {
                        console.error(`[ContactCreationService] Error creating topic:`, error);
                        throw error;
                    }
                    
                    // CRITICAL: Apply access rights to the channel so both participants can send messages
                    console.log('[ContactCreationService] 🔐 Applying channel access rights...');
                    if (appModel.applyChatChannelAccessRights) {
                        try {
                            await appModel.applyChatChannelAccessRights([topic.id]);
                            console.log('[ContactCreationService] ✅ Channel access rights applied successfully');
                        } catch (accessError) {
                            console.error('[ContactCreationService] ❌ Failed to apply channel access rights:', accessError);
                            throw accessError;
                        }
                    } else {
                        console.error('[ContactCreationService] ❌ applyChatChannelAccessRights method not available');
                        throw new Error('Cannot apply channel access rights - method not available');
                    }
                } else {
                    console.error('[ContactCreationService] ❌ Cannot get my Person ID');
                    throw new Error('Cannot get my Person ID for topic creation');
                }
            } else {
                console.error('[ContactCreationService] ❌ TopicModel not available');
                throw new Error('TopicModel not available for topic creation');
            }
        } catch (error: any) {
            console.error('[ContactCreationService] ❌ Failed to ensure topic exists:', error);
            throw error;
        }
    }

    /**
     * Scan for Person IDs with connections but no contacts and create missing contacts
     * This can fix the "connections exist but no contacts" situation
     */
    public async fixMissingContactsForConnections(connectionMap: Map<string, any[]>): Promise<number> {
        console.log('[ContactCreationService] Scanning for missing contacts...');
        
        let fixedCount = 0;
        const existingContacts = await this.leuteModel.others();
        const existingPersonIds = new Set<string>();

        // Get all existing Person IDs from contacts
        for (const contact of existingContacts) {
            try {
                const personId = await contact.mainIdentity();
                existingPersonIds.add(personId.toString());
            } catch (error) {
                console.warn('[ContactCreationService] Error getting Person ID from contact:', error);
            }
        }

        // Check each connected Person ID
        for (const [personIdString, connections] of Array.from(connectionMap.entries())) {
            if (!existingPersonIds.has(personIdString)) {
                console.log(`[ContactCreationService] Found connected Person without contact: ${personIdString.slice(0, 16)}...`);
                
                try {
                    // Convert string back to SHA256IdHash<Person>
                    const personId = personIdString as SHA256IdHash<Person>;
                    const success = await this.createContactFromPairing(personId);
                    if (success) {
                        fixedCount++;
                        console.log(`[ContactCreationService] ✅ Created missing contact for Person ${personIdString.slice(0, 16)}...`);
                    }
                } catch (error) {
                    console.error(`[ContactCreationService] ❌ Failed to create contact for Person ${personIdString.slice(0, 16)}...:`, error);
                }
            }
        }

        console.log(`[ContactCreationService] Fixed ${fixedCount} missing contacts`);
        return fixedCount;
    }

    /**
     * Get diagnostic information about contacts vs connections
     */
    public async getDiagnosticInfo(): Promise<{
        contactsCount: number;
        connectionsCount: number;
        missingContacts: string[];
        status: 'ok' | 'mismatch' | 'empty';
    }> {
        try {
            const contacts = await this.leuteModel.others();
            const contactsCount = contacts.length;

            // This would need to be passed in or accessed from AppModel
            // For now, return basic info
            return {
                contactsCount,
                connectionsCount: 0, // Would need ConnectionsModel access
                missingContacts: [],
                status: contactsCount === 0 ? 'empty' : 'ok'
            };
        } catch (error) {
            console.error('[ContactCreationService] Error getting diagnostic info:', error);
            return {
                contactsCount: 0,
                connectionsCount: 0,
                missingContacts: [],
                status: 'empty'
            };
        }
    }

    /**
     * Enable persistent connections for all existing contacts
     * Should be called during app initialization to ensure all contacts have active connections
     */
    public async enableConnectionsForAllExistingContacts(): Promise<number> {
        console.log('[ContactCreationService] 🌐 Enabling persistent connections for all existing contacts...');
        
        try {
            const contacts = await this.leuteModel.others();
            console.log(`[ContactCreationService] Found ${contacts.length} existing contacts`);
            
            if (contacts.length === 0) {
                console.log('[ContactCreationService] No existing contacts found, skipping connection enablement');
                return 0;
            }

            // Get a ready ConnectionsModel (wait if necessary)
            const connectionsModel = await this.waitForLeuteConnectionsModule();
            if (!connectionsModel) {
                console.error('[ContactCreationService] ❌ LeuteConnectionsModule not available for existing contacts (timeout)');
                return 0;
            }

            let enabledCount = 0;
            
            for (const contact of contacts) {
                try {
                    // Get the person ID for this contact
                    const personId = await contact.mainIdentity();
                    if (!personId) {
                        console.warn('[ContactCreationService] ⚠️ Contact has no person ID, skipping');
                        continue;
                    }

                    console.log(`[ContactCreationService] Enabling connection for existing contact: ${personId.toString().slice(0, 16)}...`);
                    
                    // Enable persistent connection for this person
                    await connectionsModel.leuteConnectionsModule.enableConnectionsForPerson(personId);
                    
                    // Note: CHUM should be established automatically by ConnectionsModel
                    
                    enabledCount++;
                    
                    console.log(`[ContactCreationService] ✅ Connection enabled for existing contact: ${personId.toString().slice(0, 16)}...`);
                    
                } catch (contactError) {
                    console.error('[ContactCreationService] ❌ Failed to enable connection for contact:', contactError);
                }
            }

            console.log(`[ContactCreationService] ✅ Enabled persistent connections for ${enabledCount}/${contacts.length} existing contacts`);
            return enabledCount;
            
        } catch (error) {
            console.error('[ContactCreationService] ❌ Failed to enable connections for existing contacts:', error);
            return 0;
        }
    }

    /**
     * Wait until ConnectionsModel.leuteConnectionsModule is available (max 10s)
     */
    private async waitForLeuteConnectionsModule(): Promise<any | null> {
        const { ModelService } = await import('../services/ModelService');
        const maxAttempts = 20; // 20 * 500ms = 10s
        const delay = 500;

        for (let i = 0; i < maxAttempts; i++) {
            const appModel = ModelService.getModel();
            // Access ConnectionsModel through TransportManager
            const connectionsModel: any = appModel?.transportManager?.getConnectionsModel();
            if (connectionsModel?.leuteConnectionsModule?.enableConnectionsForPerson) {
                console.log('[ContactCreationService] ✅ LeuteConnectionsModule found and ready');
                return connectionsModel;
            }
            console.log(`[ContactCreationService] Waiting for LeuteConnectionsModule... attempt ${i + 1}/${maxAttempts}`);
            await new Promise(res => setTimeout(res, delay));
        }
        console.error('[ContactCreationService] ❌ LeuteConnectionsModule not available after timeout');
        return null;
    }
} 