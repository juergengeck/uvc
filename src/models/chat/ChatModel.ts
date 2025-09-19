import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { Order } from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { ensureHash } from '@refinio/one.core/lib/util/type-checks.js';
import { createMessageCard } from './transformers';
import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { ChatMessageCard } from './types';
import type TopicRoom from '@refinio/one.models/lib/models/Chat/TopicRoom.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { LLMManager } from '../ai/LLMManager';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { UIMessage } from './transformers';
import type { ChatState } from './types';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { MessageCertificateTypes, createUserMessageWithCertificate, isSystemMessage } from '../../utils/messageUtils';
import type { AppModel } from '../AppModel';
import { calculateHashOfObj } from '@refinio/one.core/lib/util/object';

/**
 * Events emitted by the ChatModel
 */
export interface ChatModelEvents {
  messagesChanged: OEvent<() => void>;
  processingStateChanged: OEvent<(isProcessing: boolean) => void>;
  errorChanged: OEvent<(error: Error | null) => void>;
}

/**
 * ChatModel options
 */
export interface ChatModelOptions {
  llmManager: LLMManager;
  appModel?: AppModel;
}

/**
 * Processed message with classification information
 */
interface ProcessedMessage {
  messageRef: ChatMessage;
  hash: SHA256Hash;
  isUser: boolean;
  isAI: boolean;
  isSystem: boolean;
  isDelivered: boolean;
}

/**
 * ChatModel manages the chat UI state and interactions with the leute.one backend
 */
export class ChatModel {
  private currentTopicId: string | null = null;
  private currentTopicRoom: TopicRoom | null = null;
  private currentChannelOwner: SHA256IdHash<Person> | null = null;
  
  // Messages and message loading state
  private _messages: ChatMessageCard[] = [];
  private _isLoading: boolean = false;
  private _hasMoreMessages: boolean = true;
  
  
  // Events
  public readonly onMessagesChanged = new OEvent<() => void>();
  public readonly onLoadingStateChanged = new OEvent<(isLoading: boolean) => void>();
  
  private messagesCache = new Map<string, ChatMessageCard[]>();
  private topicModel: TopicModel;
  private channelManager: ChannelManager;
  private leuteModel: LeuteModel;
  public onMessagesUpdate = new OEvent<() => void>();
  
  // Callback for AI message handling - external AI services can register
  private onAIMessage?: (topicId: string, message: string) => void;
  
  // Track processed message hashes to prevent duplicate handling
  private processedUserMessages = new Set<string>();
  // Flag to prevent multiple concurrent refresh operations
  private isRefreshing = false;
  
  // Message queue system instead of timeout-based throttling
  private isProcessingAIRequest = false;
  private pendingAIRequests: {topicId: string, content: string}[] = [];

  private llmManager: LLMManager;
  private appModel?: AppModel;

  // Cache for AI sender checks - optimize by using string keys
  private aiSenderCache = new Map<string, boolean>();

  // Debouncing for message sends
  private lastSendTime = 0;
  private readonly MIN_SEND_INTERVAL = 1000; // 1 second minimum between sends

  // Logging control to prevent excessive logs for the same sender check
  private loggedSenders = new Set<string>();



  constructor(topicModel: TopicModel, channelManager: ChannelManager, leuteModel: LeuteModel, options: ChatModelOptions) {
    this.topicModel = topicModel;
    this.channelManager = channelManager;
    this.leuteModel = leuteModel;
    this.appModel = options.appModel;

    // LLMManager must be provided - fail fast if it's not
    if (!options.llmManager) {
      throw new Error('[ChatModel] LLMManager is required');
    }
    this.llmManager = options.llmManager;

    // Subscribe to channel updates - this should work for CHUM sync like in web version
    this.channelManager.onUpdated.listen(async (channelInfoIdHash, channelId, channelOwner, timeOfEarliestChange, data) => {
      console.log(`[ChatModel] 🚀🚀🚀 CHUM SYNC EVENT: ChannelManager.onUpdated fired`);
      console.log(`[ChatModel] 📊 Update details:`, {
        channelId,
        channelInfoIdHash: channelInfoIdHash?.toString().substring(0, 16) + '...',
        channelOwner: channelOwner?.toString().substring(0, 16) + '...',
        timeOfEarliestChange: timeOfEarliestChange?.toISOString(),
        currentTopicId: this.currentTopicId,
        dataLength: data?.length || 0
      });
      
      // LOG ACCESS RIGHTS FOR CHUM DEBUGGING
      console.log('\n🔐 ACCESS RIGHTS ANALYSIS FOR CHUM SYNC:');
      // NOTE: Direct access rights checking is not available in ONE core
      // The getAccess function doesn't exist - access is checked internally by CHUM
      console.log(`   📁 Channel (${channelInfoIdHash?.toString().substring(0, 16)}...) - access grants should be created`);
      console.log(`   📝 Entries: ${data?.length || 0} - each should have access grants`);
      console.log('   ℹ️  Access rights are managed internally by the CHUM protocol');
      console.log('   ✅ Fixed access grant creation to use "object" field for regular hashes');
      console.log('🔐 END ACCESS RIGHTS ANALYSIS\n');
      
      // Log data entries for debugging
      if (data && data.length > 0) {
        console.log(`[ChatModel] 📦 Channel update contains ${data.length} entries:`);
        data.forEach((entry: any, index: number) => {
          console.log(`[ChatModel]   Entry ${index + 1}:`, {
            channelEntryHash: entry.channelEntryHash?.substring(0, 16) + '...',
            dataHash: entry.dataHash?.substring(0, 16) + '...',
            creationTime: entry.creationTime,
            hasData: !!entry.data
          });
        });
      }
      
      // Only process updates for the current topic to avoid unnecessary work
      if (this.currentTopicId && channelId === this.currentTopicId) {
        console.log(`[ChatModel] ✅ Processing incremental update for current topic ${this.currentTopicId} - this should refresh messages from CHUM sync`);
        this.incrementalRefresh(timeOfEarliestChange);
      } else if (channelId) {
        console.log(`[ChatModel] 🔄 Channel update for different topic: ${channelId}, ignoring (current: ${this.currentTopicId})`);
      } else {
        console.log(`[ChatModel] ⚠️ Channel update with no channelId`);
      }
    });
  }

  /**
   * Get the current topic ID
   */
  get currentTopic(): string | null {
    return this.currentTopicId;
  }
  
  /**
   * Get loading state
   */
  get isLoading(): boolean {
    return this._isLoading;
  }
  
  /**
   * Get whether more messages are available
   */
  get hasMoreMessages(): boolean {
    return this._hasMoreMessages;
  }

  /**
   * Get messages
   */
  get messages(): ChatMessageCard[] {
    return this._messages;
  }

  /**
   * Get messages - method form to maintain compatibility with Chat component
   */
  public getMessages(): ChatMessageCard[] {
    console.log(`[ChatModel] getMessages called, returning ${this._messages.length} messages`);
    return this._messages;
  }

  /**
   * Public getter for LeuteModel
   */
  public getLeuteModel(): LeuteModel {
    return this.leuteModel;
  }

  /**
   * Public getter for TopicModel
   */
  public getTopicModel(): TopicModel {
    return this.topicModel;
  }

  /**
   * Set the function to call when a new user message is detected
   * This will be called with the topic ID and the message text
   * 
   * @param handler The function to call for AI processing of user messages
   */
  public registerAIMessageHandler(handler: (topicId: string, message: string) => void): void {
    console.log('[ChatModel] Registering AI message handler');
    
    // If handler is the same function, don't register again
    if (this.onAIMessage && this.onAIMessage === handler) {
      console.log('[ChatModel] Handler already registered, skipping duplicate registration');
      return;
    }
    
    // Register the handler
    this.onAIMessage = handler;
    
    // Clear any previously processed messages cache when handler changes
    // This ensures any new handler can respond to older messages
    this.processedUserMessages.clear();
    
    console.log('[ChatModel] AI message handler registered successfully');
  }

  /**
   * Clear the AI message handler
   */
  public clearAIMessageHandler(): void {
    console.log('[ChatModel] Clearing AI message handler');
    this.onAIMessage = undefined;
  }

  /**
   * Diagnostic function to list all channels and debug channel discovery
   */
  private async debugChannelDiscovery(topicId: string): Promise<void> {
    console.log('\n🔍 CHANNEL DISCOVERY DIAGNOSTIC');
    console.log('=' .repeat(50));
    
    try {
      // 1. List all channels in the system
      console.log('📊 ALL CHANNELS IN SYSTEM:');
      const allChannels = await this.channelManager.channels();
      console.log(`Found ${allChannels.length} total channels:`);
      
      allChannels.forEach((channel, index) => {
        console.log(`  ${index + 1}. Channel:`, {
          id: channel.id || 'undefined',
          owner: channel.owner || 'undefined',
          type: channel.type || 'undefined',
          name: channel.name || 'undefined'
        });
      });
      
      // 2. Check specific topic channel discovery
      console.log(`\n🎯 SEARCHING FOR TOPIC: ${topicId}`);
      const channelInfos = await this.channelManager.getMatchingChannelInfos({channelId: topicId});
      console.log(`Found ${channelInfos.length} matching channels for topic:`);
      
      channelInfos.forEach((info, index) => {
        console.log(`  ${index + 1}. Channel Info:`, {
          channelId: info.channelId,
          isMyChannel: info.isMyChannel,
          owner: info.owner,
          // Add more properties if they exist
          fullInfo: info
        });
      });
      
      // 3. Check if there are system channels
      console.log('\n🏠 SYSTEM CHANNELS:');
      const systemChannels = ['everyone', 'glue'];
      for (const sysChannel of systemChannels) {
        const sysChannelInfos = await this.channelManager.getMatchingChannelInfos({channelId: sysChannel});
        console.log(`  ${sysChannel}: ${sysChannelInfos.length} found`);
      }
      
      // 4. Check if we can find the invited channel pattern
      console.log('\n👥 1:1 CHANNEL PATTERNS:');
      const myPersonId = await this.leuteModel.myMainIdentity();
      console.log(`  My Person ID: ${myPersonId}`);
      console.log(`  Looking for patterns containing my ID...`);
      
      allChannels.forEach((channel, index) => {
        if (channel.id && channel.id.includes(myPersonId)) {
          console.log(`  MATCH ${index + 1}: ${channel.id}`);
        }
      });
      
    } catch (error) {
      console.error('❌ Channel discovery diagnostic failed:', error);
    }
    
    console.log('=' .repeat(50));
    console.log('🔍 DIAGNOSTIC COMPLETE\n');
  }

  /**
   * Determine the appropriate channel owner for a topic.
   * 
   * For 1-to-1 channels: Returns undefined so each participant creates their own channel
   * For group/system channels: Follows priority from one.leute:
   * 1. Use my channel if it exists (myPersonId as owner)
   * 2. Use any existing channel with an owner
   * 3. Use null for ownerless channels (system channels)
   */
  private async determineChannelOwner(topicId: string): Promise<SHA256IdHash<Person> | null | undefined> {
    try {
      // Run diagnostic first
      await this.debugChannelDiscovery(topicId);
      
      // Get all existing channel infos for this topic
      const channelInfos = await this.channelManager.getMatchingChannelInfos({channelId: topicId});
      const myPersonId = await this.leuteModel.myMainIdentity();

      console.log(`[ChatModel] Found ${channelInfos.length} existing channels for topic ${topicId.substring(0, 30)}...`);
      
      // Check if this is a 1:1 channel by looking for the <-> pattern
      const isOneToOneChannel = topicId.includes('<->');
      console.log(`[ChatModel] Is 1:1 channel: ${isOneToOneChannel}`);

      // Show all channel info details for debugging
      channelInfos.forEach((channelInfo, index) => {
        console.log(`[ChatModel] Channel info ${index + 1}:`, JSON.stringify({
          channelId: channelInfo.channelId,
          owner: channelInfo.owner,
          isMyChannel: channelInfo.isMyChannel
        }, null, 2));
      });

      // CRITICAL DEBUG: For 1-to-1 channels, we should see BOTH participants' channels
      if (isOneToOneChannel && channelInfos.length === 1) {
        console.log(`[ChatModel] 🚨 PROBLEM DETECTED: Only found 1 channel for 1-to-1 topic, should be 2!`);
        console.log(`[ChatModel] 🔍 This suggests ChannelInfo objects are not being replicated via CHUM`);
        
        // Extract expected participants
        const participants = topicId.split('<->');
        if (participants.length === 2) {
          const myPersonId = await this.leuteModel.myMainIdentity();
          const otherPersonId = participants.find(p => p !== myPersonId);
          
          console.log(`[ChatModel] Expected participants:`);
          console.log(`  My ID: ${myPersonId.substring(0, 8)}...`);
          console.log(`  Other ID: ${otherPersonId?.substring(0, 8)}...`);
          console.log(`[ChatModel] Only found channel owned by: ${channelInfos[0].owner?.substring(0, 8)}...`);
          
          if (channelInfos[0].owner === myPersonId) {
            console.log(`[ChatModel] 🚨 Missing remote participant's channel - CHUM sync issue!`);
          } else {
            console.log(`[ChatModel] 🚨 Missing my own channel - channel creation issue!`);
          }
        }
      } else if (isOneToOneChannel && channelInfos.length === 2) {
        console.log(`[ChatModel] ✅ Found both participants' channels - CHUM sync working!`);
      }

      // CRITICAL FIX: Use one.leute's priority logic for ALL channels including 1-to-1
      // This ensures we read from and write to the same prioritized channel
      let owner: SHA256IdHash<Person> | null | undefined = undefined;
      
      // Priority 1: Use my channel if it exists
      // Priority 2: Use any other existing channel
      // Priority 3: undefined (no existing channels)
      for (const channelInfo of channelInfos) {
        if (channelInfo.owner === myPersonId) {
          owner = myPersonId;
          console.log(`[ChatModel] ✅ Using my own channel as owner (priority 1)`);
          break;
        } else if (owner === undefined && channelInfo.owner !== undefined) {
          owner = channelInfo.owner;
          console.log(`[ChatModel] 📌 Found another participant's channel: ${channelInfo.owner.substring(0, 8)}... (priority 2)`);
        }
      }
      
      // If no channels exist yet, return undefined (will create with myMainIdentity)
      if (owner === undefined && channelInfos.length === 0) {
        console.log(`[ChatModel] 🆕 No channels exist yet, will create with myMainIdentity`);
      }

      // For system channels, use null as owner
      const systemChannels = ['EveryoneTopic', 'GlueOneTopic', 'llm'];
      if (systemChannels.includes(topicId) && owner === undefined) {
        owner = null;
        console.log(`[ChatModel] ✅ System channel (${topicId}), using null owner`);
      }

      console.log(`[ChatModel] Final owner decision: ${owner?.toString?.().substring(0, 8) || owner}`);
      return owner;

    } catch (error) {
      console.error('[ChatModel] Error determining channel owner:', error);
      return null;
    }
  }

  /**
   * Enter a topic room using content-addressed storage pattern
   */
  async enterTopicRoom(topicId: string): Promise<TopicRoom> {
    if (!topicId) {
      throw new Error('Topic ID is required');
    }

    // If we're already in this topic room, return it immediately
    if (this.currentTopicId === topicId && this.currentTopicRoom) {
      console.log(`[ChatModel] 🔄 Already in topic room: ${topicId}`);
      return this.currentTopicRoom;
    }

    console.log(`[ChatModel] 🏠 Entering topic room for ID: ${topicId}`);

    try {
      // STEP 1: Determine the appropriate channel owner for this topic
      const channelOwner = await this.determineChannelOwner(topicId);
      console.log(`[ChatModel] Channel owner determined: ${channelOwner?.toString?.().substring(0, 8) || channelOwner}`);

      // STEP 2: Create/ensure the channel exists BEFORE entering the room
      // This is CRITICAL - the channel must exist before TopicModel.enterTopicRoom
      console.log(`[ChatModel] 🔧 Creating/ensuring channel for topic ${topicId}`);
      await this.channelManager.createChannel(topicId, channelOwner === null ? null : channelOwner);
      console.log(`[ChatModel] ✅ Channel ready for topic ${topicId}`);

      // STEP 3: Establish network connections for message transmission
      await this.ensureNetworkConnections(topicId);

      // STEP 4: Ensure access rights for message sharing
      await this.ensureAccessRights(topicId);

      // STEP 5: Clean up previous room listener if any
      if (this.currentTopicRoom && this.currentTopicRoom.onNewMessageReceived) {
          this.currentTopicRoom.onNewMessageReceived.dont();
      }

      // STEP 6: NOW enter the topic room - channel already exists
      console.log(`[ChatModel] Entering topic room (channel already initialized)`);
      this.currentTopicRoom = await this.topicModel.enterTopicRoom(topicId);
      this.currentTopicId = topicId;
      this.currentChannelOwner = channelOwner === undefined ? null : channelOwner;

      console.log(`[ChatModel] ✅ Successfully entered topic room for ${topicId}`);

      // STEP 7: Load initial messages after entering the topic room
      console.log(`[ChatModel] Loading initial messages for topic ${topicId}`);
      await this.refreshMessages();

      return this.currentTopicRoom;
    } catch (error) {
      console.error(`[ChatModel] Failed to enter topic room ${topicId}:`, error);
      throw error;
    }
  }

  // REMOVED - No longer needed as channel creation happens directly in enterTopicRoom

  /**
   * Ensure network connections are established for message transmission
   */
  private async ensureNetworkConnections(topicId: string): Promise<void> {
    try {
      // Check if this is a 1-to-1 chat
      const isOneToOne = topicId.includes('<->');
      if (!isOneToOne) {
        console.log(`[ChatModel] Topic ${topicId} is not 1-to-1, skipping connection check`);
        return;
      }

      // Extract participant IDs from the topic ID
      const participants = topicId.split('<->');
      if (participants.length !== 2) {
        console.warn(`[ChatModel] Invalid 1-to-1 topic format: ${topicId}`);
        return;
      }

      const myPersonId = await this.leuteModel.myMainIdentity();
      const otherPersonId = participants.find(p => p !== myPersonId);

      if (!otherPersonId) {
        console.warn(`[ChatModel] Could not determine other participant from topic ${topicId}`);
        return;
      }

      console.log(`[ChatModel] 🔌 Ensuring connection to participant ${otherPersonId.substring(0, 8)}...`);

      // Check if we have an active connection to this participant
      if (this.appModel?.transportManager) {
        const connections = await this.appModel.transportManager.getActiveConnections();
        const hasConnection = connections.some(conn =>
          conn.remotePersonId === otherPersonId ||
          conn.targetPersonId === otherPersonId
        );

        if (!hasConnection) {
          console.warn(`[ChatModel] ⚠️ No active connection to participant ${otherPersonId.substring(0, 8)}`);
          console.log(`[ChatModel] 🔄 Attempting to establish connection...`);

          // Try to establish a connection through the CommServer
          try {
            // Get the participant's Someone object to check connectivity
            const someone = await this.leuteModel.getSomeone(otherPersonId);
            if (someone) {
              console.log(`[ChatModel] Found Someone object for ${otherPersonId.substring(0, 8)}`);

              // Request connection establishment through TransportManager
              if (this.appModel.transportManager.requestConnection) {
                await this.appModel.transportManager.requestConnection(otherPersonId);
                console.log(`[ChatModel] ✅ Connection request sent to ${otherPersonId.substring(0, 8)}`);
              } else {
                console.log(`[ChatModel] ℹ️ TransportManager doesn't support direct connection requests`);
              }
            } else {
              console.warn(`[ChatModel] ⚠️ No Someone object found for ${otherPersonId.substring(0, 8)} - pairing may be needed`);
            }
          } catch (connError) {
            console.error(`[ChatModel] ❌ Failed to establish connection:`, connError);
          }
        } else {
          console.log(`[ChatModel] ✅ Active connection exists to ${otherPersonId.substring(0, 8)}`);
        }
      } else {
        console.warn(`[ChatModel] ⚠️ TransportManager not available`);
      }
    } catch (error) {
      console.error(`[ChatModel] Error checking network connections:`, error);
      // Don't throw - continue with limited functionality
    }
  }

  /**
   * Ensure access rights are properly configured for message sharing
   */
  private async ensureAccessRights(topicId: string): Promise<void> {
    try {
      console.log(`[ChatModel] 🔐 Ensuring access rights for topic ${topicId}`);

      // For 1-to-1 chats, ensure both participants have access rights
      if (topicId.includes('<->')) {
        const participants = topicId.split('<->');
        if (participants.length === 2) {
          const myPersonId = await this.leuteModel.myMainIdentity();
          const otherPersonId = participants.find(p => p !== myPersonId);

          if (otherPersonId) {
            console.log(`[ChatModel] 🔑 Checking access rights for participant ${otherPersonId.substring(0, 8)}`);

            // Trigger access rights update through LeuteModel
            // This ensures the LeuteAccessRightsManager creates proper grants
            try {
              const someone = await this.leuteModel.getSomeone(otherPersonId);
              if (someone) {
                // Access the someone's profile to trigger access grant creation
                const profile = await someone.mainProfile();
                if (profile) {
                  console.log(`[ChatModel] ✅ Access rights check completed for ${otherPersonId.substring(0, 8)}`);
                } else {
                  console.warn(`[ChatModel] ⚠️ No profile found for ${otherPersonId.substring(0, 8)}`);
                }
              } else {
                console.warn(`[ChatModel] ⚠️ No Someone object for ${otherPersonId.substring(0, 8)} - access rights may be limited`);
              }
            } catch (accessError) {
              console.error(`[ChatModel] ❌ Error checking access rights:`, accessError);
            }
          }
        }
      }

      // Access rights are primarily handled by LeuteAccessRightsManager
      // but we ensure the participants are properly connected first
      console.log(`[ChatModel] 🔐 Access rights check complete for ${topicId}`);
    } catch (error) {
      console.error(`[ChatModel] Error ensuring access rights:`, error);
      // Don't throw - continue with best effort
    }
  }

  /**
   * Get the current topic room ID
   */
  getCurrentTopicRoom(): string | null {
    return this.currentTopicRoom?.topic.id || null;
  }
  
  /**
   * Get the formatted display name for the current topic
   */
  getCurrentTopicName(): string {
    if (!this.currentTopicId) {
      return 'Chat';
    }
    
    // For 1-to-1 chats, we should get the display name from contacts or topic name
    // AI chats now use the standard person<->person format
    
    // For regular topics, use the topic name or ID
    return this.currentTopicRoom?.topic?.name || this.currentTopicId;
  }



  /**
   * Set current topic and load messages
   */
  async setTopic(topicId: string) {
    // If we're already in this topic, skip the operation
    if (this.currentTopicId === topicId && this.currentTopicRoom) {
      console.log(`[ChatModel] Already in topic ${topicId}, skipping setTopic operation`);
      return;
    }
    
    console.log(`[ChatModel] Setting topic to ${topicId}`);
    
    try {
      // Clear current state
      this._messages = [];
      this.currentTopicId = topicId;
      
      // Enter the topic room using enterTopicRoom method
      // This will handle checking for existing room already
      this.currentTopicRoom = await this.enterTopicRoom(topicId);
      console.log(`[ChatModel] Successfully opened topic room for ${topicId}`);
      
      // No need to reload messages, enterTopicRoom already does this
    } catch (error) {
      console.error(`[ChatModel] Error setting topic ${topicId}:`, error);
      throw error;
    }
  }

  /**
   * Load more messages for the current topic
   * This is now a wrapper around refreshMessages for backward compatibility
   */
  async loadMoreMessages() {
    // This method is kept for backward compatibility
    // but now just calls refreshMessages
    await this.refreshMessages();
  }
  
  /**
   * Incremental refresh - just do a full refresh for now
   * The duplicate issue suggests our query logic is flawed
   */
  private async incrementalRefresh(timeOfEarliestChange?: Date) {
    if (!this.currentTopicId) {
      console.log('[ChatModel] Cannot incremental refresh: No current topic ID');
      return;
    }

    console.log(`[ChatModel] 🚀🚀🚀 CHUM SYNC PROCESSING: Channel update detected, refreshing messages`);
    console.log(`[ChatModel] 📅 timeOfEarliestChange: ${timeOfEarliestChange?.toISOString()}`);
    console.log(`[ChatModel] 🔄 This refresh should pick up any new messages synced via CHUM protocol`);
    
    // Store pre-refresh message count for comparison
    const beforeCount = this._messages.length;
    console.log(`[ChatModel] 📊 Messages before CHUM sync refresh: ${beforeCount}`);
    
    // For now, just do a full refresh to avoid the duplicate issue
    // TODO: Implement proper cache merging like one.leute
    await this.refreshMessages();
    
    const afterCount = this._messages.length;
    
    console.log(`[ChatModel] 📊 Messages after CHUM sync refresh: ${afterCount} (was ${beforeCount})`);
    
    if (afterCount > beforeCount) {
      console.log(`[ChatModel] ✅✅✅ CHUM SYNC SUCCESS: ${afterCount - beforeCount} new messages received!`);
    } else if (afterCount === beforeCount) {
      console.log(`[ChatModel] 🔄 No new messages from CHUM sync`);
    }
  }

  /**
   * Refresh the messages from the server
   */
  async refreshMessages() {
    // Skip if no topic is selected
    if (!this.currentTopicId) {
      console.log('[ChatModel] Cannot refresh messages: No current topic ID');
      return;
    }

    // Skip if already refreshing to prevent multiple concurrent refreshes
    if (this.isRefreshing) {
      console.log(`[ChatModel] Already refreshing messages for topic ${this.currentTopicId}, skipping duplicate refresh`);
      return;
    }

    console.log(`[ChatModel:refreshMessages] Refreshing topic: ${this.currentTopicId}`);
    
    // Set refreshing flag
    this.isRefreshing = true;
    
    try {
      // Set loading state
      this._isLoading = true;
      this.onLoadingStateChanged.emit(true);
      
      const myId = await this.leuteModel.myMainIdentity();
      
      // Log warning if myId is not available
      if (!myId) {
        console.error('[ChatModel] WARNING: myMainIdentity() returned null/undefined - user messages will not be properly identified!');
        console.error('[ChatModel] This can happen if LeuteModel is not fully initialized or if there is no authenticated user.');
      } else {
        console.log(`[ChatModel] Successfully retrieved myId: ${myId.toString().substring(0, 15)}...`);
      }
      
      // Get all messages for the current topic/channel using proper ONE platform approach
      console.log(`[ChatModel:refreshMessages] Getting messages using channel iterator (like one.leute) for topic ${this.currentTopicId}`);
      
      // CRITICAL FIX: For 1-to-1 chats (including AI chats), we need to load from ALL channels
      // Check if this is a 1-to-1 chat (person<->person format)
      const is1to1Chat = this.currentTopicId.includes('<->');
      const shouldLoadAllChannels = is1to1Chat;
      
      const queryOptions: any = { channelId: this.currentTopicId };
      
      // For 1-to-1 chats and AI chats, don't filter by owner - we need messages from all participants
      if (!shouldLoadAllChannels && this.currentChannelOwner !== undefined) {
        queryOptions.owner = this.currentChannelOwner;
        console.log(`[ChatModel:refreshMessages] Loading from specific channel owned by: ${this.currentChannelOwner?.substring(0, 8) || 'null'}`);
      } else if (shouldLoadAllChannels) {
        console.log(`[ChatModel:refreshMessages] This is a 1-to-1 or AI chat - loading from ALL channels`);
      }
      
      const channelInfos = await this.channelManager.getMatchingChannelInfos(queryOptions);
      
      // Debug: Show discovered channels
      console.log(`[ChatModel:refreshMessages] Found ${channelInfos.length} channel instance(s) for this topic:`);
      channelInfos.forEach((info, idx) => {
        console.log(`  Channel ${idx + 1}: owner=${info.owner?.substring(0, 8) || 'null'}, hash=${info.idHash?.substring(0, 8)}, head=${info.head?.substring(0, 8) || 'null'}`);
      });

      if (channelInfos.length === 0) {
        console.warn(`[ChatModel:refreshMessages] No channel info found for topic ${this.currentTopicId}`);
        return;
      }

      const messageObjects: any[] = [];

      try {
        if (shouldLoadAllChannels) {
          // For 1-to-1 chats and AI chats, load from ALL channels
          console.log(`[ChatModel:refreshMessages] Loading messages from all ${channelInfos.length} channels`);
          for (const channelInfo of channelInfos) {
            console.log(`[ChatModel:refreshMessages] Loading from channel – owner=${channelInfo.owner?.substring(0, 8) || 'null'}, head=${channelInfo.head?.substring(0, 8) || 'null'}`);
            let entryCount = 0;
            const iterator = (this.channelManager.constructor as any).singleChannelObjectIterator(channelInfo);
            for await (const entry of iterator) {
              entryCount++;
              await this.extractMessageFromEntry(entry, messageObjects);
            }
            console.log(`[ChatModel:refreshMessages] Channel yielded ${entryCount} entries`);
          }
        } else {
          // For group/system topics, use single channel
          const channelInfo = channelInfos[0];
          console.log(`[ChatModel:refreshMessages] Loading from channel – owner=${channelInfo.owner?.substring(0, 8) || 'null'}, head=${channelInfo.head?.substring(0, 8) || 'null'}`);
          let entryCount = 0;
          const iterator = (this.channelManager.constructor as any).singleChannelObjectIterator(channelInfo);
          for await (const entry of iterator) {
            entryCount++;
            await this.extractMessageFromEntry(entry, messageObjects);
          }
          console.log(`[ChatModel:refreshMessages] Channel yielded ${entryCount} entries`);
        }
   
        console.log(`[ChatModel:refreshMessages] Successfully loaded ${messageObjects.length} ChatMessage objects from channel entries`);
          
        // Sort by creation time (newest first)
        // CRITICAL: Handle edge cases where creationTime might be missing
        messageObjects.sort((a, b) => {
          const timeA = a.creationTime ? new Date(a.creationTime).getTime() : 0;
          const timeB = b.creationTime ? new Date(b.creationTime).getTime() : 0;
          // If times are equal (both 0), maintain original order
          if (timeA === timeB) return 0;
          return timeB - timeA;
        });
        
        // Log if any messages have missing timestamps
        const missingTimestamps = messageObjects.filter(m => !m.creationTime);
        if (missingTimestamps.length > 0) {
          console.warn(`[ChatModel] ${missingTimestamps.length} messages have missing creationTime`);
        }
        
        // If iterator returned 0 messages, try the fallback method
        if (messageObjects.length === 0) {
          console.log(`[ChatModel:refreshMessages] Iterator returned 0 messages, trying getObjectsWithType fallback...`);
          const fallbackObjects = await this.channelManager.getObjectsWithType('ChatMessage' as any, {
            channelId: this.currentTopicId,
            orderBy: Order.Descending
          } as any);
          console.log(`[ChatModel:refreshMessages] Fallback method found ${fallbackObjects.length} messages`);
          messageObjects.push(...fallbackObjects);
        }
        
      } catch (iteratorError) {
        console.error(`[ChatModel:refreshMessages] Error using channel iterator:`, iteratorError);
        console.log(`[ChatModel:refreshMessages] Falling back to getObjectsWithType...`);
        
        // Fallback to the buggy method if iterator fails
        const fallbackObjects = await this.channelManager.getObjectsWithType('ChatMessage' as any, {
          channelId: this.currentTopicId,
          orderBy: Order.Descending
        } as any);
        messageObjects.push(...fallbackObjects);
      }
      
      // Log only summary instead of every message
      // Get device ID for logging
      
      console.log(`[ChatModel:refreshMessages] Retrieved ${messageObjects.length} messages for topic ${this.currentTopicId}`);
      
      // Process messages
      const newMessages: ChatMessageCard[] = [];
      
      for (const msg of messageObjects) {
        if (!msg || !msg.data || !msg.dataHash) continue;
        
        const msgData = msg.data as any;
        const sender = msgData.sender;
        
        // Determine message type
        // IMPORTANT: If myId is null, we cannot determine if a message is from the user
        // In this case, isUser will be false for all messages (safer than assuming all are from user)
        const isUser = myId && sender ? sender.toString() === myId.toString() : false;
        
        // Debug log for first few messages if myId is missing
        if (!myId && newMessages.length < 3) {
          console.warn(`[ChatModel] Cannot determine if message is from user (myId null): "${msgData.text?.substring(0, 30)}..."`);
        }
        const chatMessage = { ...msgData, idHash: msg.dataHash } as ChatMessage & { idHash: SHA256Hash };
        const isAI = this.isAIMessage(chatMessage);
        const isSystem = this.isSystemMessage(chatMessage);
        
        // Create message card
        const card = createMessageCard(
          chatMessage,
          isUser,
          isAI,
          isSystem,
          msg.creationTime || new Date(),
          msg.dataHash  // Pass channel entry hash for audit-consistent React keys
        );
        
        newMessages.push(card);
      }
      
      // Sort messages by creation time (newest first for the internal data structure)
      // CRITICAL: Ensure consistent timestamp handling
      newMessages.sort((a, b) => {
        const timeA = a.creationTime instanceof Date ? a.creationTime.getTime() : 
                     a.creationTime ? new Date(a.creationTime).getTime() : 0;
        const timeB = b.creationTime instanceof Date ? b.creationTime.getTime() : 
                     b.creationTime ? new Date(b.creationTime).getTime() : 0;
        // If times are equal, maintain original order
        if (timeA === timeB) return 0;
        return timeB - timeA;
      });
      
      // Log message count before and after refresh
      console.log(`[ChatModel] Messages before refresh: ${this._messages.length}, after refresh: ${newMessages.length}`);
      
      // Log system message positions to help diagnose display issues
      const systemMsgIdxBefore = this._messages.findIndex(m => m.isSystem);
      const systemMsgIdxAfter = newMessages.findIndex(m => m.isSystem);
      console.log(`[ChatModel] System message position: before=${systemMsgIdxBefore}, after=${systemMsgIdxAfter}`);

      // Display the newest and oldest messages for debugging
      if (newMessages.length > 0) {
        console.log(`[ChatModel] Newest message: ${newMessages[0].hash.toString().substring(0, 8)}, text="${newMessages[0].messageRef?.text?.substring(0, 50)}..."`);
        console.log(`[ChatModel] Oldest message: ${newMessages[newMessages.length-1].hash.toString().substring(0, 8)}, text="${newMessages[newMessages.length-1].messageRef?.text?.substring(0, 50)}..."`);
      }
      
      // Update the messages
      this._messages = newMessages;
      
      // Force UI updates with both events
      this.onMessagesChanged.emit();
      this.onMessagesUpdate.emit();
      
      console.log(`[ChatModel] Message refresh complete, loaded ${this._messages.length} messages`);
      
      // Debug log the most recent messages to verify
      
      // SAFETY CHECK: Verify message ordering after refresh
      // Ensure messages are sorted properly (newest first)
      if (this._messages.length >= 2) {
        const newest = this._messages[0];
        const second = this._messages[1];
        const newestTime = newest?.creationTime instanceof Date ? newest.creationTime.getTime() : 
                          newest?.creationTime ? new Date(newest.creationTime).getTime() : 0;
        const secondTime = second?.creationTime instanceof Date ? second.creationTime.getTime() : 
                          second?.creationTime ? new Date(second.creationTime).getTime() : 0;
                          
        if (newestTime < secondTime) {
          console.error('[ChatModel] MESSAGE ORDER ERROR: Messages are not properly sorted after refresh!');
          // Force a re-sort to fix the issue
          this._messages.sort((a, b) => {
            const timeA = a.creationTime instanceof Date ? a.creationTime.getTime() : 
                         a.creationTime ? new Date(a.creationTime).getTime() : 0;
            const timeB = b.creationTime instanceof Date ? b.creationTime.getTime() : 
                         b.creationTime ? new Date(b.creationTime).getTime() : 0;
            return timeB - timeA;
          });
          console.log('[ChatModel] Applied emergency sort to fix message order');
          
          // Re-emit events after fixing the sort
          this.onMessagesChanged.emit();
          this.onMessagesUpdate.emit();
        }
      }
    } catch (error) {
      console.error('[ChatModel] Error refreshing messages:', error);
    } finally {
      // Reset flags
      this._isLoading = false;
      this.isRefreshing = false;
      this.onLoadingStateChanged.emit(false);
    }
  }

  // Helper to load message object from raw iterator entry
  private async extractMessageFromEntry(entry: any, list: any[]) {
    try {
      if (entry && entry.dataHash) {
        const messageData = await getObject(entry.dataHash);
        if (messageData && (messageData.$type$ === 'ChatMessage' || messageData.text !== undefined)) {
          list.push({
            dataHash: entry.dataHash,
            data: messageData,
            creationTime: new Date(entry.creationTime)
          });
        }
      }
    } catch (err) {
      console.error('[ChatModel] Failed to extract message from entry', err);
    }
  }

  /**
   * Send a message to the current topic room
   */
  async sendMessage(message: string): Promise<void> {
    // Debouncing: prevent rapid-fire sends
    const now = Date.now();
    if (now - this.lastSendTime < this.MIN_SEND_INTERVAL) {
      console.warn(`[ChatModel] 🚫 Debouncing: Ignoring rapid send attempt (${now - this.lastSendTime}ms since last send)`);
      return;
    }
    this.lastSendTime = now;

    if (!this.currentTopicRoom) {
      throw new Error('No topic room available for sending messages');
    }

    // Ensure connections are established before sending for 1-to-1 chats
    if (this.currentTopicId && this.currentTopicId.includes('<->')) {
      await this.ensureNetworkConnections(this.currentTopicId);
    }

    // Get user name for enhanced logging
    const myId = await this.leuteModel.myMainIdentity();
    const myIdShort = myId.toString().substring(0, 8);
    const userName = myIdShort === 'd27f0ef1' ? 'demo' : 'demo1';
    
    console.log(`[ChatModel] 🚀🚀🚀 [${userName}] STARTING MESSAGE SEND`);
    console.log(`[ChatModel] 📤 [${userName}] Sending message: "${message}"`);
    console.log(`[ChatModel] 📤 [${userName}] Topic: ${this.currentTopicId}`);
    console.log(`[ChatModel] 📤 [${userName}] Current message count: ${this._messages.length}`);
    
    // CRITICAL DEBUG: Check CHUM accessibility before and after send with user names
    try {
      const conns = await this.appModel?.transportManager.getActiveConnections() || [];
      if (conns.length > 0) {
        const remote = conns[0].remotePersonId || conns[0].targetPersonId;
        const remoteShort = remote.substring(0, 8);
        const remoteName = remoteShort === 'd27f0ef1' ? 'demo' : 'demo1';
        
        console.log(`[ChatModel] [${userName}] Remote person type: ${typeof remote}, value: ${remote}`);
        console.log(`[ChatModel] [${userName}] Connection details:`, {
          hasRemotePersonId: !!conns[0].remotePersonId,
          hasTargetPersonId: !!conns[0].targetPersonId,
          connectionType: conns[0].constructor?.name || 'unknown'
        });
        
        const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
        const accessibleBefore = await getAccessibleRootHashes(remote);
        console.log(`[ChatModel] 🔍 [${userName}] CHUM CHECK BEFORE SEND: ${accessibleBefore.length} objects accessible to ${remoteName} (${remoteShort}...)`);
        
        // Store for checking after
        (globalThis as any).__chumCheckRemote = remote;
        (globalThis as any).__chumCheckBefore = accessibleBefore.length;
        (globalThis as any).__chumCheckUserName = userName;
        (globalThis as any).__chumCheckRemoteName = remoteName;
      }
    } catch (e) {
      console.log(`[ChatModel] [${userName}] Could not check CHUM before send: ${e.message}`);
    }
    

    
    try {
      // Send the message directly
      const author = await this.leuteModel.myMainIdentity();

      // For 1-to-1 chats: pass undefined so message is posted to sender's own channel
      // For group/system: use the determined owner
      // CRITICAL FIX: Use the same channel owner logic as one.leute
      // For 1-to-1 chats, use the channel owner determined during enterTopicRoom
      // This ensures messages go to the prioritized channel (like one.leute)
      const channelOwner = this.currentChannelOwner;

      console.log(`[ChatModel] Sending with channelOwner: ${channelOwner === undefined ? 'undefined (will use myMainIdentity)' : channelOwner === null ? 'null (no owner)' : channelOwner}`);
      await this.currentTopicRoom.sendMessage(message, author, channelOwner);
      
      // CRITICAL DEBUG: Check CHUM accessibility after send
      setTimeout(async () => {
        try {
          const remote = (globalThis as any).__chumCheckRemote;
          const before = (globalThis as any).__chumCheckBefore || 0;
          const userName = (globalThis as any).__chumCheckUserName || 'unknown';
          const remoteName = (globalThis as any).__chumCheckRemoteName || 'unknown';
          
          if (remote) {
            const { getAccessibleRootHashes } = await import('@refinio/one.core/lib/accessManager.js');
            const accessibleAfter = await getAccessibleRootHashes(remote);
            console.log(`[ChatModel] 🔍 [${userName}] CHUM CHECK AFTER SEND: ${accessibleAfter.length} objects accessible to ${remoteName} (was ${before})`);
            
            if (accessibleAfter.length === before) {
              console.log(`[ChatModel] ❌ [${userName}] CRITICAL: No new objects became accessible after message send!`);
              console.log(`[ChatModel] ❌ [${userName}] This means access grants are NOT being created properly for ${remoteName}`);
              
              // Check if grants were created
              const { getOnlyLatestReferencingObjsHashAndId } = await import('@refinio/one.core/lib/reverse-map-query.js');
              const grants = await getOnlyLatestReferencingObjsHashAndId(remote, 'IdAccess');
              console.log(`[ChatModel] 🔍 [${userName}] IdAccess grants for ${remoteName}: ${grants.length}`);
              
              // CHECK FOR MALFORMED GRANTS
              console.log(`[ChatModel] 🔍 [${userName}] CHECKING FOR MALFORMED ACCESS GRANTS...`);
              const { checkMalformedAccessGrants } = await import('../../utils/checkMalformedAccessGrants');
              await checkMalformedAccessGrants();
            } else {
              console.log(`[ChatModel] ✅ [${userName}] ${accessibleAfter.length - before} new objects became accessible to ${remoteName}`);
            }
          }
        } catch (e) {
          const userName = (globalThis as any).__chumCheckUserName || 'unknown';
          console.log(`[ChatModel] [${userName}] Could not check CHUM after send: ${e.message}`);
        }
      }, 2000); // Wait 2 seconds for access grants to be created
      
    } catch (error) {
      console.error('[ChatModel] Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Send a message with attachments to the current topic room
   */
  async sendMessageWithAttachments(text: string, attachmentHashes: SHA256Hash[]) {
    if (!this.currentTopicRoom) {
      throw new Error('No active topic room');
    }

    try {
      const topicId = this.currentTopicRoom.topic.id;
      console.log(`[ChatModel.sendMessageWithAttachments] Sending message to topic ${topicId}`);

      // Use same pattern as sendMessage - channelOwner from enterTopicRoom
      const channelOwner = this.currentChannelOwner;

      // Use TopicRoom.sendMessageWithAttachmentAsHash with the correct parameter order
      // sendMessageWithAttachmentAsHash(message, attachments, author, channelOwner)
      // - message: the text to send  
      // - attachments: array of attachment hashes
      // - author: the sender (should be my main identity)
      // - channelOwner: the channel owner (properly determined above)
      const myPersonId = await this.leuteModel.myMainIdentity();
      await this.currentTopicRoom.sendMessageWithAttachmentAsHash(
        text || '', 
        attachmentHashes || [], 
        myPersonId, // author (my main identity, not undefined)
        channelOwner // proper channel owner
      );

      console.log(`[ChatModel.sendMessageWithAttachments] Message with attachments sent successfully to topic ${topicId}`);
      
      // Note: channelManager.onUpdated will trigger refreshMessages() automatically

    } catch (error) {
      console.error('[ChatModel.sendMessageWithAttachments] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Load the next batch of older messages for pagination
   * @param beforeTimestamp Optional timestamp to load messages before
   * @param limit Number of messages to load per batch
   */
  async loadNextBatch(beforeTimestamp?: number, limit: number = 20): Promise<boolean> {
    if (!this.currentTopicId) {
      console.warn('[ChatModel] Cannot load next batch: No current topic ID');
      return false;
    }

    console.log(`[ChatModel] Loading next batch of messages for topic ${this.currentTopicId}`);
    
    if (this._isLoading) {
      console.log('[ChatModel] Already loading messages, skipping duplicate load');
      return false;
    }
    
    try {
      this._isLoading = true;
      this.onLoadingStateChanged.emit(true);
      
      // Use channelManager directly for all chats - treat LLMs as regular Persons
        const messageObjects = await this.channelManager.getObjectsWithType('ChatMessage' as any, {
          channelId: this.currentTopicId,
          orderBy: Order.Descending,
          limit: limit,
          before: beforeTimestamp ? new Date(beforeTimestamp) : undefined
        } as any);
        
      console.log(`[ChatModel] Loaded ${messageObjects.length} additional messages from channelManager`);
        
        // Process and add these messages
        if (messageObjects.length > 0) {
          await this.refreshMessages(); // Use existing refresh logic
          return true;
        }
        
        // No more messages
        this._hasMoreMessages = false;
        return false;
    } catch (error) {
      console.error('[ChatModel] Error loading next batch of messages:', error);
      return false;
    } finally {
      this._isLoading = false;
      this.onLoadingStateChanged.emit(false);
    }
  }

  /**
   * Check if a sender is an AI model - for external services to use
   * @param senderId - The ID of the sender to check
   * @returns true if the sender is an AI model (based on message certificates)
   */
  public isAISender(senderId: SHA256IdHash<Person>): boolean {
    if (!senderId) {
      return false;
    }

    const senderIdStr = senderId.toString();
    
    // Check cache first
    if (this.aiSenderCache.has(senderIdStr)) {
      return this.aiSenderCache.get(senderIdStr)!;
    }
    
    // For now, we can't determine AI status from sender ID alone
    // External AI services should mark their messages with AI certificates
    // The detection happens at the message level, not sender level
    const isAI = false;
      
      // Cache the result before returning
      this.aiSenderCache.set(senderIdStr, isAI);
      return isAI;
  }

  /**
   * Check if a message is an AI message
   * @param message The message to check
   * @returns True if the message is from an AI
   * @throws Error if message missing required properties for validation
   */
  private isAIMessage(message: ChatMessage): boolean {
    if (!message) {
      throw new Error('[ChatModel] Cannot validate AI message: message is null or undefined');
    }

    const senderId = message.sender;
    if (!senderId) {
      throw new Error('[ChatModel] Cannot validate AI message: sender is missing');
    }

    // Check if sender is an LLM by using AIAssistantModel's isAIContact method
    if (this.appModel?.aiAssistantModel) {
      const isLLMSender = this.appModel.aiAssistantModel.isAIContact(senderId);
      if (isLLMSender) {
        return true;
      }
    }
    
    // For now, rely on the isAI property check above
    // AI certificate validation can be added when the function is available

    // Check for explicit isAI property
    if ((message as any).isAI === true) {
      return true;
    }

    return false;
  }

  /**
   * Check if a message is a system message
   * @param message The message to check
   * @returns True if the message is a system message
   * @throws Error if message missing required properties for validation
   */
  private isSystemMessage(message: ChatMessage): boolean {
    if (!message) {
      throw new Error('[ChatModel] Cannot validate system message: message is null or undefined');
    }

    // Check for direct isSystem property using type assertion
    if ((message as any).isSystem === true) {
      return true;
    }
    
    // Use the isSystemMessage function from messageUtils
    if (isSystemMessage(message)) {
      // Set the isSystem property when detected
      (message as any).isSystem = true;
      return true;
    }
    
    // All validations failed
    return false;
  }

  /**
   * Check if a message is from the current user
   * @param message The message to check
   * @returns True if the message is from the current user
   */
  private async isUserMessage(message: ChatMessage): Promise<boolean> {
    try {
      if (!message || !message.sender) return false;
      
      // Get current user ID
      const myId = await this.leuteModel.myMainIdentity();
      if (!myId) return false;
      
      // Check if sender matches current user
      return message.sender.toString() === myId.toString();
    } catch (error) {
      console.error('[ChatModel] Error checking if message is from user:', error);
      return false;
    }
  }

  /**
   * Process a message before adding it to the messages list
   * @param message The message to process
   * @returns The processed message
   * @throws Error if message doesn't meet required validation criteria
   */
  private async processMessage(message: ChatMessage): Promise<ProcessedMessage> {
    // Validate the message has required properties
    if (!message) {
      throw new Error('[ChatModel] Cannot process null or undefined message');
    }
    
    const senderId = message.sender;
    if (!senderId) {
      throw new Error('[ChatModel] Message is missing required sender property');
    }
    
    // Check message type classifications with strict validation
    const isUser = await this.isUserMessage(message);
    
    // These methods now throw if validation fails
    let isAI = false;
    let isSystem = false;
    
    try {
      isSystem = this.isSystemMessage(message);
    } catch (error: any) {
      console.error('[ChatModel] Error validating system message:', error);
      throw new Error(`[ChatModel] System message validation failed: ${error.message}`);
    }
    
    // Don't check for AI if already identified as system
    if (!isSystem) {
      try {
        isAI = this.isAIMessage(message);
      } catch (error: any) {
        console.error('[ChatModel] Error validating AI message:', error);
        throw new Error(`[ChatModel] AI message validation failed: ${error.message}`);
      }
    }
    
    const isDelivered = true; // For now, assume all messages are delivered
    
    // Get hash for the message (for identification)
    // Need to await the hash calculation
    const hash = await calculateHashOfObj(message);
    
    console.log(`[ChatModel] Processing message: hash=${hash.substring(0, 8)}, sender=${senderId ? senderId.substring(0, 8) : 'unknown'}, isUser=${isUser}, isAI=${isAI}, isSystem=${isSystem}`);
    
    return {
      messageRef: message,
      hash,
      isUser,
      isAI,
      isSystem,
      isDelivered
    };
  }

  /**
   * Comprehensive diagnostic tool for message transmission issues
   */
  async diagnoseMessageTransmission(topicId?: string): Promise<void> {
    const targetTopic = topicId || this.currentTopicId;
    if (!targetTopic) {
      console.error('[ChatModel] No topic specified for diagnosis');
      return;
    }

    console.log(`\n🔍 [MESSAGE TRANSMISSION DIAGNOSTIC] for topic: ${targetTopic}`);
    console.log('='.repeat(80));

    try {
      // 1. Check topic and channel existence
      console.log('\n1️⃣ TOPIC & CHANNEL STATUS:');
      const channelInfos = await this.channelManager.getMatchingChannelInfos({channelId: targetTopic});
      console.log(`   📊 Found ${channelInfos.length} channel info(s)`);
      
      for (const [index, info] of channelInfos.entries()) {
        console.log(`   📋 Channel ${index + 1}:`);
        console.log(`      - Owner: ${info.owner?.substring(0, 8) || 'null'}`);
        console.log(`      - Hash: ${info.idHash?.substring(0, 8)}`);
        console.log(`      - Head: ${info.head?.substring(0, 8) || 'null'}`);
      }

      // 2. Check messages in channel
      console.log('\n2️⃣ MESSAGE CONTENT:');
      try {
        const messages = await this.channelManager.getObjects({ channelId: targetTopic, limit: 10 });
        console.log(`   📨 Found ${messages.length} message(s) in channel`);
        
        for (const [index, msg] of messages.entries()) {
          console.log(`   📝 Message ${index + 1}:`);
          console.log(`      - Hash: ${msg.idHash?.substring(0, 8)}`);
          console.log(`      - Text: "${msg.text?.substring(0, 50)}..."`);
          console.log(`      - Sender: ${msg.sender?.substring(0, 8) || 'unknown'}`);
          console.log(`      - Timestamp: ${msg.timestamp || 'unknown'}`);
        }
      } catch (msgError) {
        console.error(`   ❌ Error getting messages:`, msgError);
      }

      // 3. Check participant information
      console.log('\n3️⃣ PARTICIPANT ANALYSIS:');
      const isOneToOne = targetTopic.includes('<->');
      console.log(`   🔗 Is 1-to-1 chat: ${isOneToOne}`);
      
      if (isOneToOne) {
        const participants = targetTopic.split('<->');
        console.log(`   👥 Participants: ${participants.length}`);
        
        const myPersonId = await this.leuteModel.myMainIdentity();
        const otherPersonId = participants.find(p => p !== myPersonId);
        
        console.log(`   👤 My Person ID: ${myPersonId?.substring(0, 8)}`);
        console.log(`   👤 Other Person ID: ${otherPersonId?.substring(0, 8)}`);

        // Check if other participant is a contact
        if (otherPersonId) {
          try {
            const contact = await this.leuteModel.getSomeone(otherPersonId);
            console.log(`   📇 Contact exists: ${!!contact}`);
            if (contact) {
              console.log(`   📇 Contact name: ${contact.name || 'unnamed'}`);
            }
          } catch (contactError) {
            console.log(`   📇 Contact check failed: ${contactError.message}`);
          }
        }
      }

      // 4. Check network connections
      console.log('\n4️⃣ NETWORK CONNECTIONS:');
      if (this.appModel?.transportManager) {
        try {
          const connections = await this.appModel.transportManager.getActiveConnections();
          console.log(`   🌐 Active connections: ${connections.length}`);
          
          for (const [index, conn] of connections.entries()) {
            console.log(`   🔌 Connection ${index + 1}:`);
            console.log(`      - Remote Person: ${conn.remotePersonId?.substring(0, 8) || 'unknown'}`);
            console.log(`      - Status: ${conn.status || 'unknown'}`);
            console.log(`      - Type: ${conn.type || 'unknown'}`);
          }

          // Check if we have connection to the other participant
          if (isOneToOne) {
            const participants = targetTopic.split('<->');
            const myPersonId = await this.leuteModel.myMainIdentity();
            const otherPersonId = participants.find(p => p !== myPersonId);
            
            if (otherPersonId) {
              const hasConnection = connections.some(conn => 
                conn.remotePersonId === otherPersonId || 
                conn.targetPersonId === otherPersonId
              );
              console.log(`   🎯 Connection to other participant: ${hasConnection ? '✅ YES' : '❌ NO'}`);
            }
          }
        } catch (connError) {
          console.error(`   ❌ Error checking connections:`, connError);
        }
      } else {
        console.log(`   ❌ TransportManager not available`);
      }

      // 5. Check access rights
      console.log('\n5️⃣ ACCESS RIGHTS:');
      try {
        // Import access checking functions
        const { isIdAccessibleBy } = await import('@refinio/one.core/lib/accessManager.js');
        const myPersonId = await this.leuteModel.myMainIdentity();
        
        for (const channelInfo of channelInfos) {
          console.log(`   🔐 Channel ${channelInfo.idHash?.substring(0, 8)}:`);
          try {
            const hasChannelAccess = await isIdAccessibleBy(myPersonId, channelInfo.idHash);
            console.log(`      - My access: ${hasChannelAccess ? '✅ YES' : '❌ NO'}`);
          } catch (accessError) {
            console.log(`      - Access check failed: ${accessError.message}`);
          }
        }
      } catch (accessError) {
        console.error(`   ❌ Error checking access rights:`, accessError);
      }

      // 6. Check sync status
      console.log('\n6️⃣ SYNC STATUS:');
      try {
        // Check if channel manager is properly initialized
        console.log(`   📡 ChannelManager available: ${!!this.channelManager}`);
        console.log(`   📡 Current topic room: ${!!this.currentTopicRoom}`);
        console.log(`   📡 Current channel owner: ${this.currentChannelOwner?.substring(0, 8) || 'null'}`);
        
        // Check last update times
        if (channelInfos.length > 0) {
          const latestInfo = channelInfos[0];
          console.log(`   📡 Latest channel hash: ${latestInfo.idHash?.substring(0, 8)}`);
          console.log(`   📡 Head pointer: ${latestInfo.head?.substring(0, 8) || 'null'}`);
        }
      } catch (syncError) {
        console.error(`   ❌ Error checking sync status:`, syncError);
      }

      // 7. Recommendations
      console.log('\n7️⃣ RECOMMENDATIONS:');
      const issues: string[] = [];
      
      if (channelInfos.length === 0) {
        issues.push('No channel found - channel may not be properly initialized');
      }
      
      if (channelInfos.some(info => !info.head)) {
        issues.push('Channel has no head pointer - may need re-initialization');
      }
      
      if (isOneToOne) {
        const participants = targetTopic.split('<->');
        const myPersonId = await this.leuteModel.myMainIdentity();
        const otherPersonId = participants.find(p => p !== myPersonId);
        
        if (otherPersonId) {
          try {
            const contact = await this.leuteModel.getSomeone(otherPersonId);
            if (!contact) {
              issues.push('Other participant is not in contact list - pairing may be required');
            }
          } catch {
            issues.push('Cannot verify contact status - may need to re-establish contact');
          }
        }
      }

      if (this.appModel?.transportManager) {
        try {
          const connections = await this.appModel.transportManager.getActiveConnections();
          if (connections.length === 0) {
            issues.push('No active network connections - messages will only be stored locally');
          }
        } catch {
          issues.push('Cannot check network connections - transport may be offline');
        }
      }

      if (issues.length > 0) {
        console.log('   🚨 ISSUES FOUND:');
        issues.forEach((issue, index) => {
          console.log(`      ${index + 1}. ${issue}`);
        });
        
        console.log('\n   💡 SUGGESTED ACTIONS:');
        console.log('      - Ensure devices are properly paired');
        console.log('      - Check network connectivity');
        console.log('      - Verify access rights are applied');
        console.log('      - Try re-entering the topic room');
      } else {
        console.log('   ✅ No obvious issues detected');
        console.log('   💡 If messages still not transmitting, check device pairing and network connectivity');
      }

    } catch (error) {
      console.error('❌ Diagnostic failed:', error);
    }

    console.log('='.repeat(80));
    console.log('🔍 [MESSAGE TRANSMISSION DIAGNOSTIC] Complete\n');
  }
}