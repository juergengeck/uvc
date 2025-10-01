/*
 * AppModel - Main application model
 * Clean, simplified architecture that delegates networking to TransportManager
 */

import { StateMachine } from '@refinio/one.models/lib/misc/StateMachine.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';

// Core model imports with correct paths and default import syntax
import LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel';
import ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import JournalModel from '@refinio/one.models/lib/models/JournalModel';
import Notifications from '@refinio/one.models/lib/models/Notifications';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';

import { TransportManager } from './network/TransportManager';
import CommServerManager from './network/transports/CommServerManager';
import BlacklistModel from './BlacklistModel';
import { InviteManager } from './contacts/InviteManager';
import type AIAssistantModel from './ai/assistant/AIAssistantModel';
import { SettingsModel } from '../models/SettingsModel';
import { LLMManager } from './ai/LLMManager';
import {initAccessManager} from '@refinio/one.core/lib/accessManager.js';
import { debugMessageTransfer } from '../utils/messageTransferDebug';
import { DeviceDiscoveryModel } from './network/DeviceDiscoveryModel';
import DeviceModel from './device/DeviceModel';
import { initializeAppJournal, logAppStart } from '../utils/appJournal';
import OrganisationModel from './OrganisationModel';

export type AppModelState = 'Uninitialised' | 'Initialising' | 'Initialised' | 'ShuttingDown';
export type AppModelEvent = 'init' | 'shutdown';

// Define the constructor options type
export interface AppModelOptions {
    leuteModel: InstanceType<typeof LeuteModel>;
    channelManager: InstanceType<typeof ChannelManager>;
    transportManager: TransportManager;
    authenticator: any; // Replace 'any' with a more specific type if available
    leuteAccessRightsManager: any; // Replace 'any' with a more specific type
    llmManager?: LLMManager; // Optional - will be created in init() if not provided
}

let appModelInstance: AppModel | null = null;

export function getAppModelInstance(): AppModel | null {
    return appModelInstance;
}

export class AppModel extends StateMachine<AppModelState, AppModelEvent> {
    public readonly onUpdated: OEvent<any> = new OEvent();
    public readonly onReady = new OEvent<() => void>();
    
    // Core models
    public leuteModel: InstanceType<typeof LeuteModel>;
    public everyoneGroup!: GroupModel;
    private _channelManager: InstanceType<typeof ChannelManager>;
    public readonly topicModel: InstanceType<typeof TopicModel>;
    public readonly journalModel: InstanceType<typeof JournalModel>;
    public readonly notifications: InstanceType<typeof Notifications>;
    
    // Optional models
    public aiAssistantModel?: AIAssistantModel;
    public inviteManager!: InviteManager;
    
    // Settings and LLM management
    private _settingsModel!: SettingsModel;
    private _llmManager?: LLMManager; // Optional - created in init() if not provided in constructor
    public mcpManager?: any; // MCP Manager for tool management
    
    // Access rights management
    public leuteAccessRightsManager: any;
    
    // Auth
    public auth: any;
    public authState?: any;
    
    // Network management - simplified architecture
    public transportManager: TransportManager;
    public deviceDiscoveryModel?: DeviceDiscoveryModel;
    public deviceModel?: DeviceModel;
    
    // Organisation management
    public organisationModel?: OrganisationModel;
    
    private isInitialized = false;

    constructor(options: AppModelOptions) {
        super();
        
        if (appModelInstance) {
            console.warn("[AppModel] Duplicate AppModel created. This should not happen.");
        }
        appModelInstance = this;

        // Destructure options for clarity and safety
        const {
            leuteModel,
            channelManager,
            transportManager,
            authenticator,
            leuteAccessRightsManager, // This is now available from options
            llmManager
        } = options;

        this.leuteModel = leuteModel;
        this._channelManager = channelManager;
        this.transportManager = transportManager;
        this.auth = authenticator;
        this.leuteAccessRightsManager = leuteAccessRightsManager;
        this._llmManager = llmManager || undefined; // Will be set in init() if not provided
        
        // Initialize TopicModel and JournalModel
        this.topicModel = new TopicModel(this._channelManager, this.leuteModel);
        this.journalModel = new JournalModel([]); // Initialize with empty array, will add inputs dynamically
        this.notifications = new Notifications(this._channelManager);
        
        // TransportManager is now passed in, not created here.
        // This was a major source of issues.
        
        // Set up states and transitions
        this.addState('Uninitialised');
        this.addState('Initialising');
        this.addState('Initialised');
        this.addState('ShuttingDown');
        this.setInitialState('Uninitialised');
        this.addEvent('init');
        this.addEvent('shutdown');
        this.addTransition('init', 'Uninitialised', 'Initialising');
        this.addTransition('init', 'Initialising', 'Initialised');
        this.addTransition('shutdown', 'Initialising', 'ShuttingDown');
        this.addTransition('shutdown', 'Initialised', 'Uninitialised');
        this.addTransition('shutdown', 'ShuttingDown', 'Uninitialised');

        console.log("[AppModel] Constructor: Basic setup complete.");
    }

    /**
     * Initialize the model
     */
    public async init(): Promise<void> {
        const initStartTime = Date.now();
        console.log('[AppModel] Starting init...');

        // First transition: Uninitialised -> Initialising
        this.triggerEvent('init');

        try {
            // ChannelManager already initialized in initModel
            
            // Initialize SettingsModel
            const settingsStartTime = Date.now();
            this._settingsModel = new SettingsModel('lama');
            await this._settingsModel.init();
            console.log(`[PERF] SettingsModel.init: ${Date.now() - settingsStartTime}ms`);
            
            // LLMManager and AIAssistantModel will be created in initModel after LeuteModel is ready
            
            // Initialize TopicModel and JournalModel
            const topicStartTime = Date.now();
            await this.topicModel.init();
            console.log(`[PERF] TopicModel.init: ${Date.now() - topicStartTime}ms`);

            const journalStartTime = Date.now();
            await this.journalModel.init();
            console.log(`[PERF] JournalModel.init: ${Date.now() - journalStartTime}ms`);
            
            // TransportManager already initialized
            // Networking will be started later in initModel() AFTER LeuteAccessRightsManager is ready
            
            // Create everyone group for legacy compatibility (using static import)
            const groupStartTime = Date.now();
            this.everyoneGroup = await GroupModel.constructFromLatestProfileVersionByGroupName('everyone');
            console.log(`[PERF] Everyone group creation: ${Date.now() - groupStartTime}ms`);
            
            // Create and initialize InviteManager
            const inviteStartTime = Date.now();
            this.inviteManager = new InviteManager(this.leuteModel, this.transportManager);
            await this.inviteManager.init();
            console.log(`[PERF] InviteManager.init: ${Date.now() - inviteStartTime}ms`);

            // Initialize DeviceModel
            const deviceStartTime = Date.now();
            this.deviceModel = await DeviceModel.ensureInitialized(this.leuteModel);
            console.log(`[PERF] DeviceModel.init: ${Date.now() - deviceStartTime}ms`);

            // Initialize DeviceDiscoveryModel
            this.deviceDiscoveryModel = DeviceDiscoveryModel.getInstance();
            // DeviceDiscoveryModel will be fully configured later in initModel() after TrustModel is available

            // Initialize OrganisationModel
            const orgStartTime = Date.now();
            this.organisationModel = new OrganisationModel(this._channelManager);
            await this.organisationModel.init();
            console.log(`[PERF] OrganisationModel.init: ${Date.now() - orgStartTime}ms`);
            
            // Create system topics
            const systemTopicsStartTime = Date.now();
            await this.createSystemTopics();
            console.log(`[PERF] System topics creation: ${Date.now() - systemTopicsStartTime}ms`);
            
            // Setup connection monitoring
            const chumStartTime = Date.now();
            this.setupChumSyncHandlers();
            console.log(`[PERF] CHUM sync handlers: ${Date.now() - chumStartTime}ms`);
            
            this.isInitialized = true;

            // Second transition: Initialising -> Initialised
            this.triggerEvent('init');

            // Emit the onReady event
            this.onReady.emit();

            console.log(`[PERF] AppModel.init TOTAL: ${Date.now() - initStartTime}ms`);
            
            // Initialize debugging utilities
            try {
              // Make appModel available globally for debugging
              const globalObj = typeof window !== 'undefined' ? window : global;
              (globalObj as any).appModel = this;
              
              // Initialize message transfer debugger
              const { initMessageTransferDebugger } = await import('../utils/messageTransferDebug');
              initMessageTransferDebugger(this._channelManager);
            } catch (debugError) {
                console.error('[AppModel] Debug setup failed:', debugError);
            }
            
        } catch (error) {
            console.error('❌ [AppModel] Initialization failed', error);
            // Stay in Uninitialised state on failure
            throw error;
        }
    }

    /**
     * Enable persistent connections for all existing contacts
     * Should be called after the networking stack is fully ready
     */
    public async enableConnectionsForExistingContacts(): Promise<number> {
        console.log('[AppModel] 🌐 Enabling connections for existing contacts...');
        try {
            const { ContactCreationService } = await import('../services/ContactCreationService');
            const contactService = new ContactCreationService(this.leuteModel);
            const enabledCount = await contactService.enableConnectionsForAllExistingContacts();
            console.log(`[AppModel] ✅ Enabled connections for ${enabledCount} existing contacts`);
            return enabledCount;
        } catch (connectionError) {
            console.error('[AppModel] ❌ Failed to enable connections for existing contacts:', connectionError);
            return 0;
        }
    }

    public async shutdown(): Promise<void> {
        if (this.currentState === 'Uninitialised' || this.currentState === 'ShuttingDown') {
            return;
        }
        
        // Stop all event listeners first to prevent errors during shutdown
        try {
            // Disconnect journal listeners if they exist
            if (this.journalModel && (this.journalModel as any).oEventListeners) {
                const listeners = (this.journalModel as any).oEventListeners;
                for (const [event, listener] of listeners) {
                    if (listener?.disconnect) {
                        try {
                            listener.disconnect();
                        } catch (e) {
                            console.warn('[AppModel] Error disconnecting journal listener:', e);
                        }
                    }
                }
                listeners.clear();
            }
        } catch (error) {
            console.warn('[AppModel] Error cleaning up journal listeners:', error);
        }
        
        // Stop AI Assistant first to prevent new operations
        if (this.aiAssistantModel) {
            console.log('[AppModel] Stopping AI Assistant...');
            try {
                await this.aiAssistantModel.stop();
                console.log('[AppModel] AI Assistant stopped');
            } catch (error) {
                console.error('[AppModel] Error stopping AI Assistant:', error);
                // Continue shutdown even if AI Assistant fails
            }
        }
        
        // Stop organisation model if it exists
        if (this.organisationModel) {
            console.log('[AppModel] Stopping Organisation Model...');
            try {
                // Just clear the reference, no specific shutdown needed
                this.organisationModel = undefined;
            } catch (error) {
                console.error('[AppModel] Error clearing Organisation Model:', error);
            }
        }
        
        // Stop QUIC VC Connection Manager
        if (this.quicVCConnectionManager) {
            console.log('[AppModel] Stopping QUIC VC Connection Manager...');
            try {
                await this.quicVCConnectionManager.stopDiscovery();
                this.quicVCConnectionManager = undefined;
            } catch (error) {
                console.error('[AppModel] Error stopping QUIC VC:', error);
            }
        }
        
        // Shutdown transports
        try {
            await this.transportManager.shutdownAllTransports();
        } catch (transportError) {
            console.error('[AppModel] Error shutting down transports:', transportError);
            // Continue shutdown even if transport shutdown fails
        }
        
        // Shutdown DeviceDiscoveryModel if it exists
        if (this.deviceDiscoveryModel) {
            console.log('[AppModel] Shutting down DeviceDiscoveryModel...');
            try {
                await this.deviceDiscoveryModel.shutdown();
                this.deviceDiscoveryModel = undefined;
            } catch (error) {
                console.error('[AppModel] Error shutting down DeviceDiscoveryModel:', error);
            }
        }

        // Shutdown DeviceModel if it exists
        if (this.deviceModel) {
            try {
                await this.deviceModel.shutdown();
                this.deviceModel = undefined;
            } catch (error) {
                console.error('[AppModel] Error shutting down DeviceModel:', error);
            }
        }

        // Clear all model references
        this.leuteModel = undefined;
        this.channelManager = undefined;
        this.transportManager = undefined;
        this.authenticator = undefined;
        this.topicModel = undefined;
        this.journalModel = undefined;
        this.quicModel = undefined;
        this.settingsModel = undefined;
        
        // Force state to Uninitialised
        // Transition to ShuttingDown state if we're initialized
        if (this.currentState === 'Initialised') {
            try {
                this.triggerEvent('shutdown');
            } catch (stateError) {
                console.warn('[AppModel] State transition error:', stateError);
            }
        }
    }

    /**
     * Sets up listeners to synchronize the app's network state
     * with the underlying connection model's state.
     */
    public setupNetworkStateSynchronization(): void {
        const connections = this.connections;
        if (!connections) {
            console.warn('[AppModel] Cannot setup network sync, connections model not available.');
          return;
        }
        
        let connectionsEnabled = false;
        connections.onOnlineStateChange.listen(async (isOnline: boolean) => {
            if (isOnline) {
                console.log('✅ NETWORK ONLINE');

                if (!connectionsEnabled) {
                    console.log('[AppModel] 🔄 Network online – enabling connections for existing contacts');
                    try {
                        const count = await this.enableConnectionsForExistingContacts();
                        console.log(`[AppModel] ✅ Connections enabled for ${count} existing contacts`);
                    } catch (err) {
                        console.error('[AppModel] ❌ Failed to enable existing-contact connections:', err);
                    }
                    connectionsEnabled = true; // run once per app session
                }
            } else {
                console.warn('❌ NETWORK OFFLINE');
            }
        });

        console.log('[AppModel] ✅ Network state synchronization is set up.');
    }

    public setAuth(auth: any): void {
        this.auth = auth;
        this.authState = auth.state;
    }

    public getTransportManager(): TransportManager {
        if (!this.transportManager) {
            throw new Error("TransportManager not initialized");
        }
        return this.transportManager;
    }

    public get channelManager(): InstanceType<typeof ChannelManager> {
        return this._channelManager;
    }

    public getCommServerUrl(): string {
        // Return the URL from the transport manager's config
        const commServerManager = this.transportManager.getCommServerManager();
        return commServerManager.config.options.commServerUrl;
    }

    public get commServerManager(): CommServerManager {
        if (!this.transportManager) {
            throw new Error("CommServerManager not initialized");
        }
        return this.transportManager.getCommServerManager();
    }

    // Create system topics (Everyone and Glue topics)
    public async createSystemTopics(): Promise<boolean> {
        // No state assertion - this is called during init
        try {
            console.log('[AppModel] Creating system topics (Everyone and Glue)...');
            
            // Create Everyone topic
            console.log('[AppModel] Creating Everyone topic...');
            const everyoneStartTime = Date.now();
            const everyoneTopic = await this.topicModel.createEveryoneTopic();
            console.log(`[AppModel] ✅ Everyone topic created: ${everyoneTopic?.id} (${Date.now() - everyoneStartTime}ms)`);
            
            // Create Glue topic
            console.log('[AppModel] Creating Glue topic...');
            const glueStartTime = Date.now();
            const glueTopic = await this.topicModel.createGlueTopic();
            console.log(`[AppModel] ✅ Glue topic created: ${glueTopic?.id} (${Date.now() - glueStartTime}ms)`);
            
            // Create AI Subjects topic for IoM knowledge sharing
            console.log('[AppModel] Creating AI Subjects topic...');
            try {
                const aiStartTime = Date.now();
                // Create the AISubjectsChannel as a system topic
                const subjectsTopicId = 'AISubjectsChannel';
                const subjectsTopic = await this.topicModel.createGroupTopic(
                    'AI Knowledge Base', // Display name
                    subjectsTopicId,     // Topic ID
                    null                 // No owner for system topic
                );
                console.log(`[AppModel] ✅ AI Subjects topic created: ${subjectsTopic?.id} (${Date.now() - aiStartTime}ms)`);
            } catch (error) {
                // Topic might already exist
                console.log('[AppModel] AI Subjects topic may already exist:', error);
            }
            
            console.log('[AppModel] ✅ System topics creation completed successfully');
            return true;
        } catch (error) {
            console.error('[AppModel] ❌ Failed to create system topics:', error);
            return false;
        }
    }

    // Access to ConnectionsModel through CommServerManager
    public get connections() {
        return this.commServerManager.getConnectionsModel();
    }

    // PropertyTree access through SettingsModel
    public get propertyTree() {
        if (!this._settingsModel) {
            throw new Error('SettingsModel not initialized');
        }
        return this._settingsModel.propertyTree;
    }

    // LLM Manager access (lazy loading)
    public getModelManager(): LLMManager {
        if (!this._llmManager) {
            console.warn('[AppModel] LLMManager not yet initialized - this may cause issues');
            // For now, return a placeholder that will be replaced when properly initialized
            throw new Error('LLMManager not yet initialized - please wait for full app initialization');
        }
        return this._llmManager;
    }

    // REMOVED: repairContactsAndTopics - we don't mitigate, we fix root causes
    // If data is corrupt, we must fix the problem at the source, not paper over it

    // AI Assistant access
    public getAIAssistantModel(): AIAssistantModel | undefined {
        return this.aiAssistantModel;
    }

    // Connect chat with AI (placeholder implementation)
    public async connectChatWithAI(topicId: string): Promise<void> {
        console.log('[AppModel] Connecting chat with AI for topic:', topicId);
        // TODO: Implement actual AI connection logic
        console.log('[AppModel] AI connection completed (placeholder)');
    }

    // LLM Manager access via property (for compatibility)
    public get llmManager(): LLMManager | undefined {
        return this._llmManager;
    }

    // Convenience methods for backward compatibility
    getCommServerManager(): CommServerManager {
        return this.transportManager.getCommServerManager();
    }

    getConnectionsModel(): ConnectionsModel {
        return this.transportManager.getConnectionsModel();
    }
    
    getPairingManager(): any {
        return this.transportManager.getCommServerManager().getPairingManager();
    }

    /**
     * Apply access rights for chat channels to enable message transfer between participants
     * This is critical for one-to-one topics where both participants need access to the channel
     */
    public async applyChatChannelAccessRights(topicIds: string[]): Promise<void> {
        try {
            // Process access rights for topics
            
            // Import createAccess function directly
            const { createAccess } = await import('@refinio/one.core/lib/access.js');
            const { buildAccessGrant } = await import('../utils/access');
            
            // Get my main identity
            const myPersonId = await this.leuteModel.myMainIdentity();
            if (!myPersonId) {
                console.error('[AppModel] Cannot get my person ID for access rights');
                return;
            }
            
            // Process each topic
            for (const topicId of topicIds) {
                try {
                    // Check if this is a 1-to-1 channel (contains <-> separator)
                    const isOneToOneChannel = topicId.includes('<->');
                    
                    if (isOneToOneChannel) {
                        // For 1-to-1 channels, extract participant IDs from the topic ID
                        // Format: personId1<->personId2
                        const participantIds = topicId.split('<->');
                        if (participantIds.length === 2) {
                            // Get the topic from the database
                            const topic = await this.topicModel.topics.queryById(topicId);
                            if (!topic) {
                                console.warn(`[AppModel] Topic not found: ${topicId}`);
                                continue;
                            }
                            
                            // Apply access rights for both participants (convert strings to proper person IDs)
                            const personIds = participantIds.map(id => id as any); // Cast to proper type
                            // topic.channel is a SHA256IdHash<ChannelInfo>, so we need IdAccess
                            await createAccess(buildAccessGrant(topic.channel, personIds, [], true));
                        } else {
                            console.warn(`[AppModel] Invalid 1-to-1 topic ID format: ${topicId}`);
                        }
                    } else {
                        // For group topics, use the existing logic
                        const topic = await this.topicModel.topics.queryById(topicId);
                        if (!topic) {
                            console.warn(`[AppModel] Topic not found: ${topicId}`);
                            continue;
                        }
                        
                        // Enter the topic room to get participants from the database
                        const topicRoom = await this.topicModel.enterTopicRoom(topicId);
                        if (!topicRoom) {
                            console.warn(`[AppModel] Could not enter topic room: ${topicId}`);
                            continue;
                        }
                        
                        // Get participants from the database via TopicRoom
                        let participants: any[] = [];
                        try {
                            if (typeof (topicRoom as any).getParticipants === 'function') {
                                participants = await (topicRoom as any).getParticipants() || [];
                                console.log(`[AppModel] Found ${participants.length} participants for topic ${topicId}:`, participants);
                            } else {
                                console.warn(`[AppModel] TopicRoom.getParticipants() not available for topic ${topicId}`);
                            }
                        } catch (participantError) {
                            console.warn(`[AppModel] Error getting participants for topic ${topicId}:`, participantError);
                        }
                        
                        // Apply access rights based on actual participants
                        if (participants.length > 0) {
                            // Apply access rights for all participants to the channel
                            // topic.channel is a SHA256IdHash<ChannelInfo>, so we need IdAccess
                            await createAccess(buildAccessGrant(topic.channel, participants, [], true));
                            
                            console.log(`[AppModel] ✅ Applied access rights for ${participants.length} participants: ${participants.join(', ')}`);
                        } else {
                            // Fallback: Apply everyone group access for topics without specific participants
                            console.log(`[AppModel] No specific participants found, applying everyone group access for topic: ${topicId}`);
                            
                            // Get the everyone group for fallback access
                            const { default: GroupModel } = await import('@refinio/one.models/lib/models/Leute/GroupModel');
                            const everyoneGroup = await GroupModel.constructFromLatestProfileVersionByGroupName('everyone');
                            
                            // topic.channel is a SHA256IdHash<ChannelInfo>, so we need IdAccess
                            await createAccess(buildAccessGrant(topic.channel, [], [everyoneGroup.groupIdHash], true));
                            
                            console.log(`[AppModel] ✅ Applied everyone group access rights for topic: ${topicId}`);
                        }
                    }
                } catch (topicError) {
                    console.error(`[AppModel] Error applying access rights for topic ${topicId}:`, topicError);
                }
            }
            
            // Access rights application complete
        } catch (error) {
            console.error('[AppModel] ❌ Failed to apply chat channel access rights:', error);
            throw error;
        }
    }

    /**
     * Setup CHUM sync handlers for message synchronization between paired devices
     */
    private setupChumSyncHandlers(): void {
        const connectionsModel = this.connections;
        if (!connectionsModel) {
            return;
        }

        // The ONE protocol handles CHUM sync automatically
        // We just monitor events for debugging if needed
        
        if (connectionsModel.onConnectionOpened) {
            connectionsModel.onConnectionOpened.listen((connection: any) => {
                // Connection opened - CHUM sync handled automatically
            });
        }

        if (connectionsModel.onConnectionClosed) {
            connectionsModel.onConnectionClosed.listen((connection: any) => {
                // Connection closed
            });
        }

        if (connectionsModel.pairing && connectionsModel.pairing.onPairingSuccess) {
            connectionsModel.pairing.onPairingSuccess.listen((
                isOutgoing: boolean,
                localPersonId: string,
                _localInstanceId: string,
                remotePersonId: string,
                _remoteInstanceId: string
            ) => {
                // Pairing success - CHUM sync enabled automatically
            });
        }
    }

    /**
     * Add journal input to existing JournalModel
     * This allows other models to contribute to the journal system
     */
    public addJournalInput(journalInput: any): void {
        if (!this.journalModel) {
            console.error('[AppModel] Cannot add journal input - JournalModel not available');
            return;
        }

        // Access the internal modelsDictionary and add the new input
        const modelsDictionary = (this.journalModel as any).modelsDictionary;
        if (!Array.isArray(modelsDictionary)) {
            console.error('[AppModel] Cannot add journal input - modelsDictionary not accessible');
            return;
        }

        // Check if this input type already exists
        const existingIndex = modelsDictionary.findIndex((input: any) => input.eventType === journalInput.eventType);
        if (existingIndex !== -1) {
            console.log(`[AppModel] Replacing existing journal input for type: ${journalInput.eventType}`);
            modelsDictionary[existingIndex] = journalInput;
        } else {
            console.log(`[AppModel] Adding new journal input for type: ${journalInput.eventType}`);
            modelsDictionary.push(journalInput);
        }

        // Set up event handler for the new input if JournalModel is already initialized
        if (this.journalModel.state?.currentState === 'Initialised') {
            const oEventListeners = (this.journalModel as any).oEventListeners;
            const event = journalInput.eventType;
            
            // Remove existing listener if it exists
            const existingListener = oEventListeners.get(event);
            if (existingListener && existingListener.disconnect) {
                existingListener.disconnect();
            }

            // Add new listener
            const oEventHandler = (timeOfEarliestChange: Date) => {
                this.journalModel.onUpdated.emit(timeOfEarliestChange);
            };
            const disconnectFn = journalInput.event.listen(oEventHandler.bind(this));
            oEventListeners.set(event, { listener: oEventHandler, disconnect: disconnectFn });

            console.log(`[AppModel] ✅ Journal input added and event handler set up for type: ${journalInput.eventType}`);
        }
    }
}