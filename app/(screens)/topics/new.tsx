import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { 
  TextInput, 
  Button, 
  Text, 
  useTheme,
  Portal,
  Dialog,
  ActivityIndicator,
  RadioButton,
  Divider,
  Chip
} from 'react-native-paper';
import { router as expoRouter, useLocalSearchParams } from 'expo-router';
import { getModel } from '@src/initialization';
import { useInstance } from '@src/providers/app';
import { useTranslation } from 'react-i18next';
import { Namespaces } from '@src/i18n/namespaces';
import AIAssistantModel from '@src/models/ai/assistant/AIAssistantModel';
import type { AppModel } from '@src/models/AppModel';
import { SHA256IdHash, ensureIdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import { createTopic } from '@src/utils/contactUtils';
import { debug } from '../../../src/utils/DebugService';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';
import { monitorChannelEvents, verifyChannelCreation } from '@src/utils/channelEventDiagnostics';
import { slugifyModelName } from '../../../src/utils/contactUtils';

// Define the TopicModelAPI interface here since we can't import it
interface TopicModelAPI {
  createGroupTopic: (name: string, topicId?: string) => Promise<any>;
  topics: {
    queryById: (id: string) => Promise<any>;
  };
}

// Interface for CreateGroupTopic that extends TopicModelAPI
interface CreateGroupTopic extends TopicModelAPI {
  // Any additional methods specific to this component, if needed
}

// Runtime profile type that includes actual properties
interface RuntimeProfile {
  idHash: string;
  data?: {
    name?: string;
    [key: string]: any;
  };
  name?: string;
  personDescriptions: any[];
  saveAndLoad(): Promise<void>;
}

// Update the Topic interface to include runtime properties
interface RuntimeTopic extends InstanceType<typeof Topic> {
  addParticipant?: (someoneId: string) => Promise<void>;
  saveAndLoad?: () => Promise<void>;
}

export default function NewTopicScreen() {
  const theme = useTheme();
  const router = expoRouter;
  const params = useLocalSearchParams<{ 
    contactId?: string;
    contactPersonId?: string;
    contactName?: string;
    myPersonId?: string;
  }>();
  const { instance } = useInstance() as { instance: any };
  const { t: commonT } = useTranslation(Namespaces.COMMON);
  const { t: messagesT } = useTranslation(Namespaces.MESSAGES);
  const [name, setName] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [topicType, setTopicType] = useState('regular');
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [aiModel, setAiModel] = useState<AIAssistantModel | null>(null);
  const [selectedContactName, setSelectedContactName] = useState(params.contactName || '');
  const [lastCreatedTopic, setLastCreatedTopic] = useState<string | null>(null);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const [showManualNav, setShowManualNav] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [buttonPressCount, setButtonPressCount] = useState(0);
  const [selectedContact, setSelectedContact] = useState<string | null>(
    params.contactId ?? params.contactPersonId ?? params.contactName ?? null
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Get the model instance
  const [appModel, setAppModel] = useState(getModel());
  const [channelManager, setChannelManager] = useState<any>(null);
  
  // Initialize channelManager from appModel
  useEffect(() => {
    if (appModel && !channelManager) {
      console.log('[NewTopicScreen] Initializing channelManager from appModel');
      setChannelManager(appModel.channelManager);
    } else if (instance && !channelManager) {
      console.log('[NewTopicScreen] Initializing channelManager from instance');
      setChannelManager(instance.channelManager);
    }
  }, [appModel, instance, channelManager]);
  
  // Check if cloud provider is enabled
  useEffect(() => {
    const checkCloudProvider = async () => {
      if (instance) {
        // Create an AIAssistantModel instance to check cloud provider status
        try {
          const me = await instance.leuteModel?.me();
          if (me) {
            const profile = await me.mainProfile();
            const assistantModel = new AIAssistantModel(
              instance.leuteModel,
              profile.personId,
              profile.idHash,
              instance
            );
            
            setAiModel(assistantModel);
            
            // Check if cloud provider is enabled - handle case where method doesn't exist
            let cloudEnabled = false;
            try {
              if (typeof assistantModel.getProviderConfig === 'function') {
            const cloudConfig = await assistantModel.getProviderConfig('cloud');
                cloudEnabled = cloudConfig?.enabled === true && !!cloudConfig?.settings?.apiKey;
              } else {
                console.log('[NewTopicScreen] getProviderConfig method not available, assuming cloud is disabled');
              }
              setCloudEnabled(cloudEnabled);
              
              console.log('[NewTopicScreen] Cloud provider enabled:', cloudEnabled);
            } catch (configError) {
              console.warn('[NewTopicScreen] Error checking cloud config:', configError);
              setCloudEnabled(false);
            }
          }
        } catch (error) {
          console.error('[NewTopicScreen] Error initializing AI assistant model:', error);
        }
      }
    };
    
    checkCloudProvider();
  }, [instance]);

  // Set default name if contact is provided
  useEffect(() => {
    if (params.contactName) {
      setName(`Chat with ${params.contactName}`);
    }
  }, [params.contactName]);

  const handleButtonPress = () => {
    // This will log every time the button is physically pressed, 
    // regardless of the disabled state
    const count = buttonPressCount + 1;
    setButtonPressCount(count);
    console.log(`[NewTopicScreen] Button press detected! Count: ${count}`);
    setStatusMessage(`Button press detected (#${count}). ${!name.trim() ? 'Name is empty!' : ''}`);
    
    // If the button is disabled, explain why
    if (!name.trim()) {
      setErrorMessage("Button disabled: Name field is empty");
    } else if (isCreating) {
      setErrorMessage("Button disabled: Creation already in progress");
    }
  };

  const forceCreate = () => {
    console.warn('[NewTopicScreen] Force creating topic is not supported - use proper topic creation methods');
    setErrorMessage('Force creating topics is not supported - please use the normal create button');
  };

  // Debugging state for topic creation diagnostics
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [intervalId, setIntervalId] = useState<number | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Function to add a log entry with timestamp to debug info
  const captureLog = (message: string) => {
    const timestamp = new Date().toISOString().substring(11, 23); // HH:MM:SS.mmm
    const logEntry = `[${timestamp}] ${message}`;
    
    setDebugInfo(prev => [logEntry, ...prev]);
    debug.info(message); // Also send to debug service
  };

  // Timer functions for tracking creation time
  const startCreationTimer = () => {
    // Clear any existing timer first
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
    
    // Reset elapsed time
    setTimeElapsed(0);
    
    // Start a new timer that increments every 100ms
    const id = window.setInterval(() => {
      setTimeElapsed(prev => prev + 0.1);
    }, 100);
    
    // Store the ID so we can clear it later
    setIntervalId(id);
    captureLog('⏱️ Timer started');
  };

  const stopCreationTimer = () => {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      setIntervalId(null);
      captureLog(`⏱️ Timer stopped at ${timeElapsed.toFixed(1)}s`);
    }
  };

  // Function to gather comprehensive diagnostics
  const gatherDiagnostics = async () => {
    captureLog('📊 Gathering diagnostics...');
    
    // Check TopicModel state
    try {
      if (appModel?.topicModel) {
        const modelState = appModel.topicModel.state?.currentState || "unknown";
        captureLog(`🔍 TopicModel state: ${modelState}`);
        
        // Check if topics collection exists
        const hasTopics = !!appModel.topicModel.topics;
        captureLog(`🔍 TopicModel has topics: ${hasTopics}`);
        
        // Check if createGroupTopic method exists
        const hasCreateGroupTopic = typeof appModel.topicModel.createGroupTopic === 'function';
        captureLog(`🔍 TopicModel has createGroupTopic: ${hasCreateGroupTopic}`);
        
        // Check if enterTopicRoom method exists
        const hasEnterTopicRoom = typeof appModel.topicModel.enterTopicRoom === 'function';
        captureLog(`🔍 TopicModel has enterTopicRoom: ${hasEnterTopicRoom}`);
      } else {
        captureLog('❌ TopicModel is not available!');
      }
    } catch (error) {
      captureLog(`⚠️ Error checking TopicModel: ${error}`);
    }
    
    // Check ChannelManager state
    try {
      if (channelManager) {
        // Check if createChannel method exists
        const hasCreateChannel = typeof channelManager.createChannel === 'function';
        captureLog(`🔍 ChannelManager has createChannel: ${hasCreateChannel}`);
        
        // Check if channelInfoCache exists
        const hasChannelInfoCache = !!(channelManager as any).channelInfoCache;
        captureLog(`🔍 ChannelManager has channelInfoCache: ${hasChannelInfoCache}`);
        
        // Check if onUpdated event exists
        const hasOnUpdated = !!(channelManager.onUpdated);
        captureLog(`🔍 ChannelManager has onUpdated: ${hasOnUpdated}`);
        
        // Check number of listeners
        const listenerCount = channelManager.onUpdated?.listenerCount 
          ? channelManager.onUpdated.listenerCount() 
          : "unknown";
        captureLog(`🔍 ChannelManager onUpdated listener count: ${listenerCount}`);
      } else {
        captureLog('❌ ChannelManager is not available!');
      }
    } catch (error) {
      captureLog(`⚠️ Error checking ChannelManager: ${error}`);
    }
    
    captureLog('📊 Diagnostics complete');
  };

  const handleCreate = async () => {
    setButtonPressCount(0);
    setErrors({});
    setIsCreating(true);
    setErrorMessage(null); // Clear any previous error message
    setStatusMessage('Creating topic...');
    setDebugInfo([]); // Clear previous debug info
    captureLog("🚀 Starting topic creation process");
    startCreationTimer();
    debug.info("Starting topic creation process");
    
    // Setup diagnostic check instead of timeout
    const diagnosticTimeoutId = setTimeout(async () => {
      if (isCreating) {
        captureLog("⏱️ Running channel diagnostic check");
        await gatherDiagnostics();
      }
    }, 10000); // Run diagnostic check after 10 seconds if still creating
    
    // Create a unique operation ID to prevent duplicate operations
    const operationId = `topic-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    captureLog(`📝 Operation ID: ${operationId}`);
    
    try {
      // Validate fields
      const errors: Record<string, string> = {};
      if (!name || name.trim() === '') {
        errors.name = 'Topic name is required';
      }

      // Check for existing topic with same name
      const sanitizedName = name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (appModel?.topicModel?.topics) {
        try {
          const existingTopic = await appModel.topicModel.topics.queryById(sanitizedName);
          if (existingTopic) {
            errors.name = 'A topic with this name already exists';
            captureLog(`❌ Topic with name "${name}" already exists`);
          }
        } catch (error: unknown) {
          // If error is "not found", that's good - continue
          // Otherwise log it but don't block creation
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (!errorMessage.includes('not found')) {
            captureLog(`⚠️ Error checking existing topic: ${errorMessage}`);
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        setErrors(errors);
        setIsCreating(false);
        stopCreationTimer();
        captureLog("❌ Validation failed");
        clearTimeout(diagnosticTimeoutId);
        return;
      }
      
      // Process the selected contact
      let contactPersonId: SHA256IdHash<Person> | undefined;
      let participants: string[] = [];
      
      captureLog(`🔍 Processing contact: ${selectedContact}`);
      
      if (selectedContact) {
        // Check if the selected contact is an AI contact
        const isAIContact = selectedContact.startsWith('ai-') || 
                            selectedContact.includes('@llama.local');
        
        if (isAIContact) {
          captureLog("🤖 AI contact detected");
        }
        
        // Generate a content-based topic ID
        let generatedTopicId: string;
        
        // For AI contacts, use "chat-with-[model-name]" format
        if (isAIContact) {
          // Extract model name from the contact ID or use the display name
          const modelName = selectedContactName || (selectedContact || "ai-model").replace("ai-", "");
          // Use the canonical slugification method
          const slugifiedName = slugifyModelName(modelName);
          generatedTopicId = `chat-with-${slugifiedName}`;
          captureLog(`🤖 Generated AI topic ID: ${generatedTopicId}`);
        } else {
          // For regular topics, just use the sanitized name
          generatedTopicId = name.toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
          captureLog(`🔄 Using sanitized name as topic ID: ${generatedTopicId}`);
        }
        
        if (appModel) {
          captureLog("🔍 Getting participant list");
          
          // Try to find Someone directly by ID first
          const someone = await appModel.leuteModel?.getSomeone(selectedContact as any);
          
          if (someone) {
            captureLog(`✅ Found Someone directly with ID: ${someone.idHash}`);
            participants = [someone.idHash];
          } else {
            captureLog(`ℹ️ No Someone found directly with ID: ${selectedContact} - this is normal for Person IDs`);
            
            // Try to find Someone by Person ID
            try {
              // Get all contacts and find the one with matching Person ID
              captureLog(`🔄 Using leuteModel.others() to get all contacts`);
              const contacts = await appModel.leuteModel?.others();
              captureLog(`📊 Found ${contacts?.length || 0} total contacts`);
              
              if (contacts && contacts.length > 0) {
                // Try first by checking if any contact has a matching key field
                let matchingSomeone = contacts.find(s => 
                  (s as any).personId === selectedContact || 
                  (s as any).id === selectedContact || 
                  s.idHash === selectedContact
                );
                
                if (!matchingSomeone) {
                  // Try to load more detailed profiles
                  for (const contact of contacts) {
                    try {
                      const profile = await contact.mainProfile();
                      if (profile && profile.personId === selectedContact) {
                        matchingSomeone = contact;
                        captureLog(`✅ Found matching contact through profile: ${contact.idHash}`);
                        break;
                      }
                    } catch (err) {
                      // Skip this contact if profile can't be loaded
                    }
                  }
                }
                
                if (matchingSomeone) {
                  captureLog(`✅ Found matching contact: ${matchingSomeone.idHash}`);
                  participants = [matchingSomeone.idHash];
                } else {
                  captureLog(`ℹ️ No matching contact found for ID: ${selectedContact}`);
                }
              }
            } catch (error) {
              captureLog(`⚠️ Error searching for contacts: ${error}`);
            }
          }
          
          // Verify the channel manager is available
          if (!appModel.topicModel?.state?.currentState) {
            captureLog("❌ TopicModel state not ready");
            throw new Error("Topic model not in ready state");
          }
          
          // Setup monitoring but don't interfere with normal process
          try {
            captureLog("🔍 Setting up channel event monitoring");
            // Use any casting to avoid TypeScript errors
            const channelManager = (appModel.topicModel as any).channelManager;
            monitorChannelEvents(channelManager);
            captureLog("✅ Channel event monitoring setup complete");
          } catch (monitorError) {
            captureLog(`⚠️ Error setting up monitoring: ${monitorError}`);
            // Don't let monitoring errors block the main process
          }
          
          // Create the topic - let the standard process handle channel creation
          captureLog("🔧 Creating topic with createTopic function");
          captureLog(`📄 Topic details: name=${name}, id=${generatedTopicId}`);
          captureLog(`🧑‍🤝‍🧑 Participants: ${participants.join(', ') || 'none'}`);
          
          // Add detailed logging to createTopic steps
          const topicCreationHandler = async (step: string, detail: string) => {
            captureLog(`📍 ${step}: ${detail}`);
          };
          
          try {
            const welcomeMessage = `Welcome to ${name}`;
            
            // Let TopicModel handle ID generation
            const topicId = await createTopic(appModel.topicModel, {
              topicName: name,
              participants,
              welcomeMessage,
              onProgress: topicCreationHandler
            });
            
            clearTimeout(diagnosticTimeoutId);
            
            if (!topicId) {
              throw new Error("Topic creation returned null");
            }
            
            captureLog(`✅ Topic created successfully: ${topicId}`);
            setLastCreatedTopic(topicId);
            stopCreationTimer();
            
            // Navigate to the topic
            navigateToTopic(topicId);
          } catch (error) {
            captureLog(`❌ Error in createTopic: ${error}`);
            throw error; // Let the outer catch handle it
          }
        } else {
          captureLog("❌ App model not available");
          throw new Error("App model not available");
        }
      } else {
        // Create a regular topic without any contacts
        captureLog("❌ No contact selected");
        throw new Error("No contact selected");
      }
    } catch (error) {
      clearTimeout(diagnosticTimeoutId);
      captureLog(`❌ Error: ${error}`);
      setIsCreating(false);
      stopCreationTimer();
      setErrorMessage(`Failed to create topic: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  const tryEmergencyBypass = async (topicId: string) => {
    // Note: This function is kept for backward compatibility
    // but we're now using a simpler approach without emergency bypasses
    console.log(`[NewTopicScreen] Emergency bypasses disabled - trust the system`);
    setErrorMessage("Topic creation failed - please try again");
  };

  // Manual navigation helper
  const navigateToTopic = (topicId: string) => {
    console.log(`[NewTopicScreen] Navigating to topic: ${topicId}`);
    
    try {
      // Use the most reliable navigation pattern
      router.push({
        pathname: '/topics/[id]',
        params: { id: topicId }
      });
    } catch (e) {
      console.error(`[NewTopicScreen] Navigation failed:`, e);
      // One simple fallback attempt
      setTimeout(() => {
        router.push(`/topics/${topicId}`);
      }, 100);
    }
  };

  // Helper function to check if a channel exists
  const checkChannelExists = async (channelManager: any, channelId: string): Promise<boolean> => {
    try {
      // Try different approaches to check if channel exists
      
      // Approach 1: Check the internal channel registry if available
      if (channelManager._channels && typeof channelManager._channels.has === 'function') {
        return channelManager._channels.has(channelId);
      }
      
      // Approach 2: Try to get channel info (will throw if not exists)
      if (typeof channelManager.getChannelInfo === 'function') {
        try {
          const info = await channelManager.getChannelInfo(channelId);
          return !!info;
        } catch (e) {
          // Not found
          return false;
        }
      }
      
      // Approach 3: Try hasChannel method if available
      if (typeof channelManager.hasChannel === 'function') {
        return await channelManager.hasChannel(channelId);
      }
      
      // Unknown - we can't determine
      return false;
    } catch (error) {
      console.error(`Error checking channel existence: ${error}`);
      return false;
    }
  };

  // Simplify the test channel creation to avoid private property access
  const testChannelCreation = async () => {
    try {
      if (!appModel || !appModel.topicModel) {
        setStatusMessage("TopicModel not available");
        return;
      }
      
      // Generate a test ID
      const testId = `test-channel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      captureLog(`🧪 Testing channel creation with ID: ${testId}`);
      
      // Create a topic instead of directly accessing channelManager
      const topicId = await createTopic(appModel.topicModel, {
        topicName: `Test ${testId}`,
        topicId: testId,
        welcomeMessage: "Channel test"
      });
      
      if (topicId) {
        captureLog(`✅ Topic created successfully: ${topicId}`);
        setStatusMessage(`Test topic ${topicId} created successfully!`);
      } else {
        captureLog(`❌ Topic creation returned null`);
        setStatusMessage(`Test failed: topic creation returned null`);
      }
    } catch (error) {
      captureLog(`❌ Error testing topic creation: ${error}`);
      setStatusMessage(`Test failed: ${error}`);
    }
  };

  // Render a diagnostic info panel when showDiagnostics is true
  const renderDiagnosticsPanel = () => {
    if (!showDiagnostics) return null;

    return (
      <View style={styles.diagnosticsContainer}>
        <View style={styles.diagnosticsHeader}>
          <Text style={styles.diagnosticsTitle}>Debug Information</Text>
          <Button 
            mode="text" 
            compact 
            onPress={() => setShowDiagnostics(false)}
            labelStyle={{ color: theme.colors.error }}
          >
            Close
          </Button>
        </View>
        
        <View style={styles.diagnosticsInfo}>
          <Text style={styles.diagnosticsLabel}>Elapsed Time:</Text>
          <Text style={styles.diagnosticsValue}>{timeElapsed.toFixed(1)}s</Text>
        </View>
        
        <Button 
          mode="outlined"
          compact
          onPress={gatherDiagnostics}
          style={styles.debugButton}
        >
          Refresh Diagnostics
        </Button>
        
        <ScrollView style={styles.logContainer}>
          {debugInfo.map((log, index) => (
            <Text key={index} style={styles.logEntry}>{log}</Text>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.contentContainer}
      >
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          {commonT('newTopic')}
        </Text>
            
        <TextInput
          label={commonT('name')}
          value={name}
          onChangeText={setName}
          style={styles.input}
          mode="outlined"
          error={!!errors.name}
        />
        {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
        
        {/* Add a diagnostic test button */}
        <View style={styles.diagnosticButtonRow}>
          <Button 
            mode="outlined" 
            onPress={testChannelCreation}
            style={styles.diagnosticButton}
          >
            Test Channel Creation
          </Button>
        </View>
        
        {/* Rest of the form remains unchanged */}
        
        {/* Add debug diagnostics button at the bottom */}
        <View style={styles.debugButtonContainer}>
          <Button 
            mode="text" 
            onPress={() => setShowDiagnostics(!showDiagnostics)}
            icon="bug"
            labelStyle={{ color: theme.colors.outline }}
          >
            {showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
          </Button>
        </View>
        
        {renderDiagnosticsPanel()}
        
        {/* Status messages */}
        {statusMessage && (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        )}
        
        {errorMessage && (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        )}
        
        {navigationFailed && lastCreatedTopic && (
          <View style={styles.emergencyPanel}>
            <Text style={styles.emergencyText}>
              Navigation failed, but topic was created successfully. Tap below to try again.
            </Text>
            
            <Button 
              mode="contained" 
              onPress={() => navigateToTopic(lastCreatedTopic)}
              style={styles.emergencyButton}
            >
              Open Topic Manually
            </Button>
          </View>
        )}
      </ScrollView>
      
      <View style={styles.bottomBar}>
        <Button
          mode="outlined"
          onPress={() => router.back()}
          style={styles.button}
        >
          {commonT('cancel')}
        </Button>
        
        <Button
          mode="contained"
          onPress={() => {
            handleButtonPress();
            if (name.trim() && !isCreating) {
              handleCreate();
            }
          }}
          style={styles.button}
          loading={isCreating}
          disabled={!name.trim() || isCreating}
        >
          {commonT('create')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  content: {
    padding: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  contactContainer: {
    marginBottom: 16,
  },
  contactChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  label: {
    marginBottom: 8,
    fontWeight: '500',
  },
  typeLabel: {
    marginBottom: 16,
    fontWeight: '500',
  },
  input: {
    backgroundColor: 'transparent',
  },
  topicTypeContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  radioContainer: {
    marginTop: 8,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  radioLabel: {
    fontSize: 16,
    marginLeft: 8,
  },
  buttonContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  button: {
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  divider: {
    marginBottom: 16,
    height: 1,
  },
  topicInfoContainer: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  debugButtonContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  diagnosticsContainer: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 10,
    marginTop: 16,
    maxHeight: 300,
  },
  diagnosticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  diagnosticsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff5555',
  },
  diagnosticsInfo: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  diagnosticsLabel: {
    fontWeight: 'bold',
    color: '#ffffff',
    marginRight: 8,
  },
  diagnosticsValue: {
    color: '#ffffff',
  },
  debugButton: {
    marginVertical: 8,
    borderColor: '#ff5555',
  },
  logContainer: {
    maxHeight: 200,
    backgroundColor: '#121212',
    borderRadius: 4,
    padding: 8,
  },
  logEntry: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#dddddd',
    marginBottom: 2,
  },
  statusMessage: {
    marginTop: 16,
    color: '#666666',
    textAlign: 'center',
  },
  errorMessage: {
    marginTop: 8,
    color: '#ff3333',
    textAlign: 'center',
  },
  errorText: {
    color: '#ff3333',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 8,
  },
  emergencyPanel: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#332222',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff5555',
  },
  emergencyText: {
    color: '#ff5555',
    marginBottom: 12,
    textAlign: 'center',
  },
  emergencyButton: {
    backgroundColor: '#661111',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  scrollContainer: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  diagnosticButtonRow: {
    marginBottom: 16,
    alignItems: 'center',
  },
  diagnosticButton: {
    borderColor: '#ff5555',
  },
}); 