/**
 * ContactList Component
 * 
 * Mobile version of one.leute's LeuteView component.
 * Uses react-native-paper components instead of MUI.
 * 
 * NOTE: When changes are needed in this component, refer to the equivalent
 * functionality in one.leute to ensure consistency between platforms.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, Image } from 'react-native';
import { Searchbar, useTheme, Text, Divider, List, Button, Menu, IconButton } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type SomeoneModel from '@refinio/one.models/lib/models/Leute/SomeoneModel.js';
import type ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type AIAssistantModel from '../../models/ai/assistant/AIAssistantModel';
import { getProfileDisplayName } from '../../utils/contactUtils';
import { routes } from '../../config/routes';
import { AppModel } from '../../models/AppModel';
import { useAppModel } from '../../hooks/useAppModel';
import VerifiableCredentialExport from './VerifiableCredentialExport';

/**
 * Interface for the profile data that might not be in the type definitions
 * but exists in the actual implementation
 */
interface ProfileData {
  data?: {
    llm?: {
      name?: string;
      modelName?: string;
      provider?: string;
      type?: string;
      model?: string;
    };
    modelName?: string;
    email?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    organization?: string;
    isAI?: boolean;
    created?: number | string;
    [key: string]: any;
  };
  architecture?: string;
  modelType?: string;
  created?: number;
  [key: string]: any;
}

/**
 * Extended SomeoneModel interface with the methods we need
 * to work around TypeScript definition limitations
 */
interface SomeoneModelWithMethods extends Omit<SomeoneModel, 'mainIdentity'> {
  mainProfile(): Promise<ProfileModel>;
  mainIdentity?: () => Promise<SHA256IdHash<Person>>;
  personId?: SHA256IdHash<Person>;
}

interface ContactListProps {
  /**
   * LeuteModel instance for accessing contacts
   */
  leuteModel: LeuteModel;
  /**
   * ChannelManager for lazy loading and segment management
   */
  channelManager?: ChannelManager;
  /**
   * AIAssistantModel for AI contact identification
   */
  aiModel: AIAssistantModel;
}

// Update the SomeonePreview interface to use our extended SomeoneModel
interface SomeonePreview {
  name: string;
  mainProfile: ProfileModel;
  model: SomeoneModelWithMethods;
  avatar?: string;
}

/**
 * Extended SomeonePreview interface with additional fields
 * used internally by this component
 */
interface ExtendedSomeonePreview extends SomeonePreview {
  isAI: boolean;
  displayName?: string;
}

/**
 * Checks if a profile is an AI model (LLM assistant)
 * Only uses the direct personId check via AIAssistantModel.isAIContact
 */
const isAIProfileAsync = async (profile: ProfileModel, aiAssistant: AIAssistantModel): Promise<boolean> => {
  try {
    // Get the person ID from the profile
    const personId = profile.personId;
    if (!personId) {
      console.log(`[ContactList:isAIProfileAsync] Profile ${profile.idHash} has no person ID`);
      return false;
    }
    
    // Check directly using the AI assistant model
    const isAI = aiAssistant.isAIContact(personId);
    console.log(`[ContactList:isAIProfileAsync] aiAssistant.isAIContact result for ${personId}: ${isAI}`);
    return isAI;
  } catch (error) {
    console.error('[ContactList:isAIProfileAsync] Error checking if profile is AI:', error);
    return false;
  }
};

/**
 * Checks if a contact is the current user
 */
const isCurrentUser = async (contact: SomeoneModel, leuteModel: LeuteModel): Promise<boolean> => {
  try {
    const me = await leuteModel.me();
    if (!me || !contact) return false;
    return (me as any).idHash === (contact as any).idHash;
  } catch (e) {
    console.error('[ContactList:isCurrentUser] Error checking if contact is current user:', e);
    return false;
  }
};

/**
 * Gets a display name for a contact
 * Uses ONE's built-in methods for retrieving display names from profiles
 * Falls back to "You" for the current user profile if no name is found
 */
const getDisplayName = async (contact: SomeoneModel, leuteModel?: LeuteModel): Promise<string> => {
  try {
    // Get the profile from the contact
    const profile = await contact.mainProfile();
    
    if (!profile) {
      throw new Error(`Contact ${(contact as any).idHash} has no main profile`);
    }
    
    // Check if this is the current user's profile (owner)
    const isOwner = leuteModel && await isCurrentUser(contact, leuteModel);
    if (isOwner) {
      // Try to get a proper name for the owner first
      try {
        const displayName = await getProfileDisplayName(profile, {
          fallbackName: "Your Contact", 
          fallbackToEmail: true
        });
        return displayName !== "Your Contact" ? displayName : "You";
      } catch (e) {
        console.log(`[ContactList:getDisplayName] Using default name for current user`);
        return "You";
      }
    }
    
    // For other contacts, try using the utility function first
    try {
      const displayName = await getProfileDisplayName(profile, {
        fallbackName: "",
        fallbackToEmail: true
      });
      if (displayName) return displayName;
    } catch (e) {
      console.log(`[ContactList:getDisplayName] Error using getProfileDisplayName: ${e}`);
    }
    
    // Try to find a name in personDescriptions
    if (profile.personDescriptions && Array.isArray(profile.personDescriptions)) {
      for (const desc of profile.personDescriptions) {
        // Check if it's an object or a hash reference
        if (typeof desc === 'object' && desc.$type$ === 'PersonName' && desc.name) {
          return desc.name;
        }
        
        // If it's a hash reference, we need to load it
        if (typeof desc === 'string') {
          try {
            const descObj = await getObject(desc as SHA256Hash<any>);
            if (descObj && descObj.$type$ === 'PersonName' && descObj.name) {
              return descObj.name;
            }
          } catch (e) {
            console.log(`[ContactList:getDisplayName] Error loading description object: ${e}`);
          }
        }
      }
    }
    
    // If we couldn't find a name through the normal means, use the built-in method if available
    if (typeof contact.getMainProfileDisplayName === 'function') {
      const name = await contact.getMainProfileDisplayName();
      if (name) {
        return name;
      }
    }
    
    // If we get here, there's no name available - return fallback
    return isOwner ? "You" : "Unnamed Contact";
  } catch (error) {
    console.error(`[ContactList:getDisplayName] Error getting display name for contact ${(contact as any).idHash}:`, error);
    return "Unnamed Contact"; // Fallback rather than throwing
  }
};

export default function ContactList({ leuteModel, channelManager, aiModel }: ContactListProps) {
  const { t } = useTranslation('contacts');
  const router = useRouter();
  const theme = useTheme();
  
  const [me, setMe] = useState<ExtendedSomeonePreview | null>(null);
  const [others, setOthers] = useState<ExtendedSomeonePreview[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);
  const [selectedContactForCredentials, setSelectedContactForCredentials] = useState<ExtendedSomeonePreview | null>(null);

  // Set up listener for LeuteModel updates with comprehensive logging
  useEffect(() => {
    console.log('[ContactList] Setting up LeuteModel.onUpdated listener');
    if (!leuteModel || !leuteModel.onUpdated) {
      console.log('[ContactList] No LeuteModel or onUpdated available for listener');
      return;
    }

    console.log('[ContactList] LeuteModel.onUpdated available, setting up listener');
    const listener = leuteModel.onUpdated.listen((timeOfEarliestChange: Date) => {
      console.log('[ContactList] 🔔 LeuteModel.onUpdated fired!', timeOfEarliestChange);
      console.log('[ContactList] Current refreshKey before increment:', refreshKey);
      setRefreshKey(prev => {
        const newKey = prev + 1;
        console.log('[ContactList] 📱 Incrementing refreshKey:', prev, '->', newKey);
        return newKey;
      });
    });

    console.log('[ContactList] LeuteModel.onUpdated listener registered successfully');
    return () => {
      console.log('[ContactList] Cleaning up LeuteModel.onUpdated listener');
      if (listener) {
        listener();
      }
    };
  }, [leuteModel, refreshKey]); // Include refreshKey to see if it causes re-registration

  // Load contacts directly from the LeuteModel using ONE methods
  const loadContacts = useCallback(async () => {
    console.log('[ContactList] 🔄 loadContacts called with refreshKey:', refreshKey);
    try {
      console.log('[ContactList] Loading contacts...');
      setError(null);
      
      // Check if LeuteModel is ready before proceeding
      if (!leuteModel || !leuteModel.state || leuteModel.state.currentState !== 'Initialised') {
        console.error('[ContactList] LeuteModel is not initialized yet');
        setError('Contact system is not ready yet. Please try again in a moment.');
        return;
      }
      
      // Get current user first
      console.log('[ContactList] Getting current user...');
      const currentUser = await leuteModel.me();
      if (!currentUser) {
        console.error('[ContactList] Unable to get current user');
        setError('Unable to determine current user');
        return;
      }
      
      const currentUserId = await currentUser.mainIdentity();
      console.log('[ContactList] Current user ID:', currentUserId?.toString().slice(0, 16) + '...');
      
      // Get contacts from LeuteModel - these are SomeoneModel objects
      console.log('[ContactList] Getting contacts via leuteModel.others()...');
      const someoneModels = await leuteModel.others();
      console.log('[ContactList] 📊 Raw SomeoneModel contacts from leuteModel.others():', someoneModels.length);
      
      // Log all Someone objects to understand the data
      console.log('[ContactList] 📋 All Someone objects:');
      for (let i = 0; i < someoneModels.length; i++) {
        const sm = someoneModels[i];
        const personId = await sm.mainIdentity();
        console.log(`  ${i + 1}. Someone: ${sm.idHash?.slice(0, 16)}... -> Person: ${personId?.toString().slice(0, 16)}...`);
      }
      
      // Process each SomeoneModel into display format
      const processedContacts: ExtendedSomeonePreview[] = [];
      
      for (let i = 0; i < someoneModels.length; i++) {
        const someoneModel = someoneModels[i];
        console.log(`[ContactList] Processing SomeoneModel ${i + 1}/${someoneModels.length}`);
        
        try {
          // Get the person ID for this contact
          const personId = await someoneModel.mainIdentity();
          console.log(`[ContactList] Contact ${i + 1} person ID:`, personId?.toString().slice(0, 16) + '...');
          console.log(`[ContactList] Contact ${i + 1} Someone idHash:`, someoneModel.idHash?.slice(0, 16) + '...');
          
          // Get the main profile for display information
          const profile = await someoneModel.mainProfile();
          console.log(`[ContactList] Contact ${i + 1} has profile:`, !!profile);
          
          // Get display name using the proper utility function
          const displayName = await getDisplayName(someoneModel, leuteModel);
          console.log(`[ContactList] Contact ${i + 1} display name:`, displayName);
          
          // Check if this is an AI contact
          const isAI = profile ? await isAIProfileAsync(profile, aiModel) : false;
          console.log(`[ContactList] Contact ${i + 1} is AI:`, isAI);
          
          // Create the contact preview object
          const contactPreview: ExtendedSomeonePreview = {
            name: displayName,
            displayName: displayName,
            mainProfile: profile,
            model: someoneModel as SomeoneModelWithMethods,
            isAI: isAI,
            avatar: undefined // Will be loaded separately if needed
          };
          
          processedContacts.push(contactPreview);
          console.log(`[ContactList] ✅ Contact ${i + 1} processed successfully:`, displayName);
          
        } catch (contactError) {
          console.warn(`[ContactList] ❌ Error processing contact ${i + 1}:`, contactError);
        }
      }
      
      console.log('[ContactList] 📊 Final processed contacts count:', processedContacts.length);
      console.log('[ContactList] 📱 Setting contacts in state...');
      setOthers(processedContacts);
      console.log('[ContactList] ✅ Contacts state updated successfully');
      
    } catch (error) {
      console.error('[ContactList] ❌ Error loading contacts:', error);
      setError(error instanceof Error ? error.message : 'Failed to load contacts');
    }
  }, [leuteModel, refreshKey, aiModel]); // Include aiModel in dependencies

  // Load contacts when the screen is focused
  useFocusEffect(
    useCallback(() => {
      console.log('[ContactList] 📱 Screen focused, triggering loadContacts');
      console.log('[ContactList] Current refreshKey at focus:', refreshKey);
      loadContacts();
    }, [loadContacts, refreshKey])
  );

  // Filter contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery) return others;
    return others.filter(contact => 
      contact.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [others, searchQuery]);

  // Helper to get initials from name
  const getInitials = (name: string): string => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Render the avatar for a contact
  const renderAvatar = (props: any, contact: ExtendedSomeonePreview) => {
    // Check if this is an AI contact
    const isAI = contact.isAI;
    
    if (isAI) {
      // Use a simple color background with a label for AI contacts
      // SVG is causing rendering issues, so we'll use a basic View with text "AI" for now
      return (
        <View style={[styles.avatarContainer, { backgroundColor: theme.colors.primary }]}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      );
    } else if (contact.avatar) {
      return (
        <View style={styles.avatarContainer}>
          <Image source={{ uri: contact.avatar }} style={styles.avatar} />
        </View>
      );
    } else {
      return (
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{getInitials(contact.name)}</Text>
        </View>
      );
    }
  };

  // Navigate to contact details – use Person ID if available so the details screen
  // can locate the correct Someone/Profile objects.  Fallback to Someone idHash
  // to preserve previous behaviour.
  const handleContactPress = useCallback(async (someone: ExtendedSomeonePreview) => {
    try {
      // Prefer the personId on the Someone model (set by ONE core)
      let targetId: string | undefined;

      // Direct property (often populated by ONE runtime)
      if (typeof (someone.model as any).personId === 'string') {
        targetId = (someone.model as any).personId as string;
      }

      // If still undefined, fall back to mainIdentity() which always returns the Person ID
      if (!targetId && typeof someone.model.mainIdentity === 'function') {
        try {
          const pid = await someone.model.mainIdentity();
          if (pid) targetId = String(pid);
        } catch (e) {
          console.warn('[ContactList] Failed to get personId via mainIdentity:', e);
        }
      }

      if (!targetId) {
        console.warn('[ContactList] No personId available for contact – cannot navigate to details');
        alert('Unable to open contact – missing Person ID');
        return;
      }

      router.push({
        pathname: `${routes.screens.contactDetails}/${targetId}`,
      });
    } catch (err) {
      console.error('[ContactList] handleContactPress error', err);
    }
  }, [router]);

  const handleAddContact = useCallback(() => {
    router.push(routes.screens.addContact);
  }, [router]);

  // Handler for creating a topic with a contact
  const handleCreateTopic = useCallback(async (contact: ExtendedSomeonePreview) => {
    setMenuVisible(null);
    
    try {
      // Get the personId for this contact
      const personId = await contact.model.mainIdentity?.();
      if (!personId) {
        throw new Error(`Contact ${contact.name} has no person ID`);
      }
      
      console.log(`[ContactList] Creating topic with contact ${contact.name} (${personId})`);
      
      // Get current user's personId - try multiple approaches
      let myPersonId;
      
      // Try from leuteModel.me()
      console.log(`[ContactList] Getting personId from leuteModel.me()`);
      try {
        const me = await leuteModel.me();
        console.log(`[ContactList] Got me from leuteModel:`, me);
        
        if (me) {
          // Try direct property
          if (me.personId) {
            console.log(`[ContactList] Using personId property: ${me.personId}`);
            myPersonId = me.personId;
          } 
          // Try mainIdentity method
          else if (typeof me.mainIdentity === 'function') {
            console.log(`[ContactList] Using mainIdentity method`);
            myPersonId = await me.mainIdentity();
            console.log(`[ContactList] Got personId from mainIdentity: ${myPersonId}`);
          }
          // Try getting from mainProfile
          else if (typeof me.mainProfile === 'function') {
            console.log(`[ContactList] Using mainProfile method`);
            const profile = await me.mainProfile();
            if (profile && profile.personId) {
              console.log(`[ContactList] Got personId from mainProfile: ${profile.personId}`);
              myPersonId = profile.personId;
            }
          }
        }
      } catch (meError) {
        console.error(`[ContactList] Error getting me:`, meError);
      }
      
      if (!myPersonId) {
        // Final fallback - use hard-coded instance owner information
        // This is a last resort when all other methods fail
        console.warn(`[ContactList] All personId retrieval methods failed, using instance owner fallback`);
        
        // Try getting it from any 'me' contact in the list
        if (me && me.model && typeof me.model.mainIdentity === 'function') {
          myPersonId = await me.model.mainIdentity();
          console.log(`[ContactList] Got instance owner personId from me contact: ${myPersonId}`);
        }
      }
      
      if (!myPersonId) {
        throw new Error('Could not get current user personId');
      }
      
      console.log(`[ContactList] Using myPersonId: ${myPersonId} for topic creation`);
      
      // Navigate to the new topic screen with contact info
      router.push({
        pathname: '/(screens)/topics/new',
        params: {
          contactId: contact.model.idHash,
          contactPersonId: personId,
          contactName: contact.name,
          myPersonId: typeof myPersonId === 'string' ? myPersonId : String(myPersonId)
        }
      });
    } catch (error) {
      console.error('[ContactList] Error creating topic with contact:', error);
      // We want to see the exact error for debugging
      alert(`Failed to create topic: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [leuteModel, router, me]);

  /**
   * Get a description for the contact (email or organization)
   * Returns undefined if no descriptive information is available
   */
  const getContactDescription = async (profile: ProfileModel): Promise<string | undefined> => {
    try {
      // Check if it's an AI profile
      const isAI = await isAIProfileAsync(profile, aiModel);
      
      if (isAI) {
        // For AI profiles, use the model name or other AI identifiers
        const profileData = profile.data;
        
        // Try different paths to get AI description
        if (profileData?.llm?.name) {
          return profileData.llm.name;
        } else if (profileData?.llm?.provider) {
          return `AI by ${profileData.llm.provider}`;
        } else if (profileData?.modelName) {
          return profileData.modelName;
        } else if (profileData?.modelType) {
          return `AI (${profileData.modelType})`;
        } else if (profileData?.architecture) {
          return profileData.architecture;
        }
        
        // Check person descriptions for AI info
        if (Array.isArray(profile.personDescriptions)) {
          for (const desc of profile.personDescriptions) {
            if (desc && typeof desc === 'object') {
              if (desc.$type$ === 'OrganisationName' && desc.name) {
                return `AI by ${desc.name}`;
              } else if (desc.$type$ === 'AIPersonDescription') {
                const aiDesc = desc as { llm?: { name?: string } };
                if (aiDesc.llm?.name) {
                  return `AI: ${aiDesc.llm.name}`;
                }
              }
            }
          }
        }
        
        return 'AI Assistant';
      }
      
      // For regular profiles, try multiple approaches to get contact info
      
      // 1. Try to get email from communicationEndpoints directly
      if (Array.isArray(profile.communicationEndpoints)) {
        for (const endpoint of profile.communicationEndpoints) {
          if (endpoint && typeof endpoint === 'object' && endpoint.$type$ === 'Email') {
            const emailObj = endpoint as { email?: string };
            if (emailObj.email) {
              return emailObj.email;
            }
          }
        }
      }
      
      // 2. Try profile.data direct properties
      if (profile.data?.email) {
        return profile.data.email;
      } else if (profile.data?.organization) {
        return profile.data.organization;
      }
      
      // 3. Try organization from person descriptions
      if (Array.isArray(profile.personDescriptions)) {
        for (const desc of profile.personDescriptions) {
          if (desc && typeof desc === 'object' && desc.$type$ === 'OrganisationName' && desc.name) {
            return `Organization: ${desc.name}`;
          }
        }
      }
      
      // 4. Use creation date as last resort if available
      if (profile.created) {
        const date = new Date(profile.created);
        return `Added ${date.toLocaleDateString()}`;
      } else if (profile.data?.created) {
        const date = new Date(profile.data.created);
        return `Added ${date.toLocaleDateString()}`;
      }
      
      return undefined;
    } catch (error) {
      console.error('[ContactList] Error in getContactDescription:', error);
      return undefined;
    }
  };

  const meContact = me;

  // Add handler for showing LLM details
  const handleShowDetails = useCallback(async (contact: ExtendedSomeonePreview) => {
    setMenuVisible(null);
    
    try {
      // Get the profile data
      const profile = contact.mainProfile;
      const profileData = profile.data;
      
      // Try to get LLM info from profile data
      let llmInfo = '';
      
      if (profileData?.llm?.name) {
        llmInfo += `Model: ${profileData.llm.name}\n`;
      }
      if (profileData?.llm?.provider) {
        llmInfo += `Provider: ${profileData.llm.provider}\n`;
      }
      if (profileData?.modelName) {
        llmInfo += `Model Name: ${profileData.modelName}\n`;
      }
      if (profileData?.modelType) {
        llmInfo += `Model Type: ${profileData.modelType}\n`;
      }
      if (profileData?.architecture) {
        llmInfo += `Architecture: ${profileData.architecture}\n`;
      }
      
      // Get the model info directly from the AI assistant
      const personId = await contact.model.mainIdentity();
      if (personId && aiModel.isAIContact(personId)) {
        // The model name is available in the logs when isAIContact is called
        llmInfo += `\nModel Details:\n`;
        
        // Try to get model path and load additional info if we have an LLMManager
        if (aiModel.llmManager) {
          try {
            const models = await aiModel.llmManager.listModels();
            const model = models.find(m => m.personId && m.personId.toString() === personId.toString());
            
            if (model) {
              if (model.name) llmInfo += `Name: ${model.name}\n`;
              if (model.architecture) llmInfo += `Architecture: ${model.architecture}\n`;
              if (model.parameters) llmInfo += `Parameters: ${model.parameters}\n`;
              if (model.contextLength) llmInfo += `Context Length: ${model.contextLength}\n`;
              if (model.quantization) llmInfo += `Quantization: ${model.quantization}\n`;
            }
          } catch (e) {
            console.log('Could not load additional model info:', e);
          }
        }
      }
      
      // Show the info in an alert
      if (llmInfo) {
        alert(llmInfo);
      } else {
        alert('No model details available');
      }
    } catch (error) {
      console.error('Error showing LLM details:', error);
      alert('Failed to load model details');
    }
  }, [aiModel]);

  // Custom component to render the three-dots menu
  const renderContactMenu = useCallback((contact: ExtendedSomeonePreview) => {
    return (
      <View style={styles.rightComponentContainer}>
        {contact.isAI && <List.Icon icon="robot" color={theme.colors.primary} />}
        
        <Menu
          visible={menuVisible === contact.model.idHash}
          onDismiss={() => setMenuVisible(null)}
          anchor={
            <IconButton
              icon="dots-vertical"
              size={20}
              onPress={() => setMenuVisible(contact.model.idHash)}
            />
          }
        >
          <Menu.Item 
            title={t('contextMenu.createTopic')} 
            leadingIcon="message-text" 
            onPress={() => handleCreateTopic(contact)} 
          />
          <Menu.Item 
            title={t('details.edit')} 
            leadingIcon="pencil" 
            onPress={() => {
              setMenuVisible(null);
              router.push(`/(screens)/contacts/edit/${contact.model.idHash}`);
            }} 
          />
          {contact.isAI && (
            <Menu.Item
              title="Details"
              leadingIcon="information"
              onPress={() => handleShowDetails(contact)}
            />
          )}
          
          {/* Add verifiable credential export option */}
          <Menu.Item
            title={t('verifiableCredentials.export')}
            leadingIcon="certificate"
            onPress={() => {
              setMenuVisible(null);
              setSelectedContactForCredentials(contact);
            }}
          />
        </Menu>
      </View>
    );
  }, [menuVisible, t, handleCreateTopic, router, theme.colors.primary, handleShowDetails]);

  // Updated MeContactSection to include the three-dots menu
  const MeContactSection = React.memo(({ meContact }: { meContact: ExtendedSomeonePreview | null }) => {
    const [description, setDescription] = useState<string | undefined>(undefined);
    
    useEffect(() => {
      const loadDescription = async () => {
        if (!meContact) return;
        
        try {
          const desc = await getContactDescription(meContact.mainProfile);
          setDescription(desc);
        } catch (error) {
          console.error('Error getting contact description:', error);
        }
      };
      
      loadDescription();
    }, [meContact]);
    
    if (!meContact) return null;
    
    return (
      <>
        <List.Subheader style={styles.listSubheader}>{t('me')}</List.Subheader>
        <List.Item
          title={meContact.name}
          description={description}
          left={props => renderAvatar(props, meContact)}
          right={() => renderContactMenu(meContact)}
          onPress={() => handleContactPress(meContact)}
          style={styles.listItem}
        />
        <Divider />
      </>
    );
  });

  // Define theme-dependent styles inside the component
  const dynamicStyles = {
    emptyText: {
      color: theme.colors.onSurfaceVariant,
    },
  };

  const handleRetry = useCallback(() => {
    loadContacts();
  }, [loadContacts]);

  // Updated ContactItem to use the shared renderContactMenu function
  const ContactItem = React.memo(({ item, onPress }: { item: ExtendedSomeonePreview; onPress: (contact: ExtendedSomeonePreview) => void }) => {
    const [description, setDescription] = useState<string | undefined>(undefined);
    
    useEffect(() => {
      const loadDescription = async () => {
        try {
          const desc = await getContactDescription(item.mainProfile);
          setDescription(desc);
        } catch (error) {
          console.error(`Error getting description for contact ${item.name}:`, error);
        }
      };
      
      loadDescription();
    }, [item.mainProfile, item.name]);
    
    return (
      <List.Item
        title={item.name}
        description={description}
        left={props => renderAvatar(props, item)}
        right={() => renderContactMenu(item)}
        onPress={() => onPress(item)}
        style={styles.listItem}
      />
    );
  });

  // Add logging to track contacts state changes
  useEffect(() => {
    console.log('[ContactList] 📊 Contacts state changed - count:', others.length);
    if (others.length > 0) {
      console.log('[ContactList] First few contacts in state:', others.slice(0, 3).map(c => ({
        displayName: c.displayName,
        personId: c.personId?.toString().slice(0, 16) + '...'
      })));
    }
  }, [others]);

  // Add logging to track refreshKey changes
  useEffect(() => {
    console.log('[ContactList] 🔄 RefreshKey changed to:', refreshKey);
  }, [refreshKey]);

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder={t('list.search', { defaultValue: 'Search Contacts' })}
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
        elevation={1}
      />
      
      {error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button 
            onPress={handleRetry} 
            mode="contained" 
            icon="refresh"
            style={styles.button}
          >
            {t('retry')}
          </Button>
        </View>
      ) : (
        <>
          <FlatList
            data={filteredContacts}
            keyExtractor={(item) => item.model.idHash}
            renderItem={({ item }) => (
              <ContactItem 
                item={item} 
                onPress={handleContactPress}
              />
            )}
            ListHeaderComponent={<MeContactSection meContact={meContact} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, dynamicStyles.emptyText]}>
                  {searchQuery ? t('noResults') : t('noContacts')}
                </Text>
              </View>
            }
          />
          
          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              icon="account-plus"
              label={t('add_contact.add', { defaultValue: 'Add Contact' })}
              onPress={handleAddContact}
              style={[styles.button, styles.fullWidthButton]}
            >
              {t('add_contact.add')}
            </Button>
          </View>
          
          {selectedContactForCredentials && (
            <VerifiableCredentialExport
              personId={selectedContactForCredentials.model.personId as SHA256IdHash<Person>}
              visible={!!selectedContactForCredentials}
              onDismiss={() => setSelectedContactForCredentials(null)}
            />
          )}
        </>
      )}
    </View>
  );
}

// Define styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  searchBar: {
    margin: 8,
    elevation: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    marginBottom: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  buttonContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    marginHorizontal: 4,
  },
  fullWidthButton: {
    marginHorizontal: 0,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  rightComponentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItem: {
    paddingLeft: 8, // Align with the search bar
  },
  listSubheader: {
    paddingLeft: 16, // Align with the search bar
  },
  diagnosisContainer: {
    padding: 8,
    backgroundColor: 'rgba(0, 120, 255, 0.1)',
    borderRadius: 4,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  diagnosisText: {
    fontSize: 14,
    textAlign: 'center',
  },
});