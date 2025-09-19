import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import {
  Text,
  List,
  Avatar,
  Divider,
  Surface,
  ActivityIndicator,
  IconButton,
  Menu,
  Button,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { useInstance } from '@src/providers/app';
import { OrganisationList } from '@src/components/devices/OrganisationList';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

interface UnifiedContact {
  id: SHA256IdHash<Person>;
  displayName: string;
  profileIdHash?: string;
  isAI: boolean;
  aiModel?: string;
  organization?: string;
  email?: string;
  phone?: string;
}

interface UnifiedContactListProps {
  searchQuery?: string;
  onContactSelected?: (contact: UnifiedContact) => void;
  showContextMenu?: boolean;
  includeAI?: boolean;
}

export const UnifiedContactList: React.FC<UnifiedContactListProps> = ({
  searchQuery = '',
  onContactSelected,
  showContextMenu = false,
  includeAI = true,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { models, instance } = useInstance();
  const leuteModel = models?.leuteModel;
  const aiModel = models?.aiAssistantModel;
  const topicModel = models?.topicModel;
  
  // Debug log to see what models are available
  useEffect(() => {
    console.log('[UnifiedContactList] Models debug:', {
      hasModels: !!models,
      hasInstance: !!instance,
      hasLeuteModel: !!leuteModel,
      hasAiModel: !!aiModel,
      hasTopicModel: !!topicModel,
      modelKeys: models ? Object.keys(models) : 'no models'
    });
  }, [models, instance, leuteModel, aiModel, topicModel]);
  
  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<UnifiedContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);

  // Load all contacts (human + AI)
  const loadContacts = useCallback(async () => {
    console.log('[UnifiedContactList] Starting loadContacts...');
    console.log('[UnifiedContactList] Available models:', {
      leuteModel: !!leuteModel,
      aiModel: !!aiModel,
      topicModel: !!topicModel,
      instance: !!instance
    });

    if (!leuteModel) {
      console.error('[UnifiedContactList] LeuteModel not available');
      return;
    }

    try {
      setIsLoading(true);
      console.log('[UnifiedContactList] Loading unified contacts...');
      const allContacts: UnifiedContact[] = [];

      // Load contacts (unified: humans + AI)
      try {
        const someoneContacts = await leuteModel.others();
        console.log('[UnifiedContactList] Found contacts:', someoneContacts.length);
        
        // Deduplicate by Someone ID first, then by person ID
        const seenSomeoneIds = new Set<string>();
        const seenPersonIds = new Set<string>();
        
        for (const someone of someoneContacts) {
          // Skip if we've already processed this Someone
          if (seenSomeoneIds.has(someone.idHash)) {
            console.log('[UnifiedContactList] Skipping duplicate Someone:', someone.idHash);
            continue;
          }
          seenSomeoneIds.add(someone.idHash);
          
          try {
            // Get the main identity (person ID) from this Someone
            const personId = await someone.mainIdentity();
            if (!personId) {
              console.warn('[UnifiedContactList] No main identity for Someone:', someone.idHash);
              continue;
            }
            
            // Skip if we already have this person from another Someone
            if (seenPersonIds.has(personId)) {
              console.log('[UnifiedContactList] Skipping duplicate person:', personId);
              continue;
            }
            seenPersonIds.add(personId);
            
            // Get display name and profile info
            const profile = await someone.mainProfile();
            let displayName = 'Unknown Contact';
            
            if (profile?.personDescriptions?.length > 0) {
              const nameDesc = profile.personDescriptions.find((d: any) => d.$type$ === 'PersonName' && d.name);
              if (nameDesc?.name) {
                displayName = nameDesc.name;
              }
            }
            
            console.log('[UnifiedContactList] Processing contact:', {
              personId,
              displayName,
              someoneId: someone.idHash
            });
            
            // Check if this contact is an AI (LLMs are first-class citizens)
            let isAI = false;
            if (includeAI && aiModel) {
              try {
                isAI = await aiModel.isAIContact(personId);
                console.log('[UnifiedContactList] Contact', personId, 'is AI:', isAI);
              } catch (error) {
                console.warn('[UnifiedContactList] Error checking if contact is AI:', error);
              }
            }
            
            // Get additional profile data
            const profileData = profile?.data || {};
            
            const contact = {
              id: personId,
              displayName: displayName,
              profileIdHash: someone.idHash,
              isAI: isAI,
              organization: isAI ? undefined : profileData.organization,
              email: isAI ? undefined : profileData.email,
              phone: isAI ? undefined : profileData.phone,
              aiModel: isAI ? 'AI Assistant' : undefined,
            };
            
            console.log('[UnifiedContactList] Adding contact:', contact);
            allContacts.push(contact);
            
          } catch (error) {
            console.warn('[UnifiedContactList] Error processing Someone:', someone.idHash, error);
          }
        }
      } catch (error) {
        console.error('[UnifiedContactList] Error loading contacts:', error);
      }

      // Sort contacts: AI first, then humans, both alphabetically
      allContacts.sort((a, b) => {
        if (a.isAI && !b.isAI) return -1;
        if (!a.isAI && b.isAI) return 1;
        return a.displayName.localeCompare(b.displayName);
      });
      
      console.log('[UnifiedContactList] Total contacts loaded:', allContacts.length);
      console.log('[UnifiedContactList] AI contacts:', allContacts.filter(c => c.isAI).length);
      console.log('[UnifiedContactList] Human contacts:', allContacts.filter(c => !c.isAI).length);
      console.log('[UnifiedContactList] Sample contacts:', allContacts.slice(0, 3));
      
      setContacts(allContacts);
    } catch (error) {
      console.error('[UnifiedContactList] Error loading contacts:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [leuteModel, aiModel, includeAI]);

  // Load contacts on mount and when models become available
  useEffect(() => {
    if (leuteModel) {
      loadContacts();
    }
  }, [loadContacts, leuteModel, aiModel]);

  // Filter contacts based on search
  useEffect(() => {
    if (searchQuery) {
      const filtered = contacts.filter(contact =>
        contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.organization?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.aiModel?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredContacts(filtered);
    } else {
      setFilteredContacts(contacts);
    }
  }, [searchQuery, contacts]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadContacts();
  }, [loadContacts]);

  const handleContactPress = useCallback(async (contact: UnifiedContact) => {
    if (onContactSelected) {
      onContactSelected(contact);
    } else {
      // Default behavior: show contact details
      router.push(`/(screens)/contacts/${contact.id}/`);
    }
  }, [onContactSelected, router]);

  const handleContextMenu = useCallback(async (contactId: string, action: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;

    switch (action) {
      case 'details':
        router.push(`/(screens)/contacts/${contactId}`);
        break;
      case 'chat':
        // Create chat and navigate
        if (!instance?.topicModel || !leuteModel) {
          console.error('[UnifiedContactList] Missing required models for topic creation');
          return;
        }

        try {
          const myPersonId = await leuteModel.myMainIdentity();
          if (!myPersonId) {
            console.error('[UnifiedContactList] Cannot get my Person ID');
            return;
          }

          const topic = await topicModel.createOneToOneTopic(myPersonId, contact.id);
          console.log('[UnifiedContactList] Topic created/found:', topic.id);
          
          router.push(`/(screens)/chat/${topic.id}`);
        } catch (error) {
          console.error('[UnifiedContactList] Error creating topic:', error);
        }
        break;
      case 'edit':
        if (!contact.isAI) {
          router.push(`/(screens)/contacts/${contactId}/edit`);
        }
        break;
      default:
        console.warn('[UnifiedContactList] Unknown context menu action:', action);
    }
    
    setMenuVisible(null);
  }, [contacts, router, instance, leuteModel, topicModel]);

  const getAvatarLabel = (name: string) => {
    // Remove any parentheses content first
    const cleanName = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    
    // Split by spaces, hyphens, or underscores
    const words = cleanName.split(/[\s\-_]+/).filter(w => w.length > 0);
    
    if (words.length >= 2) {
      // Use first letter of first and last word
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    } else if (words.length === 1) {
      // For single word, use first two letters
      const word = words[0];
      if (word.length >= 2) {
        return word.substring(0, 2).toUpperCase();
      }
      return word[0].toUpperCase();
    }
    
    // Fallback to first two characters
    return cleanName.substring(0, 2).toUpperCase();
  };

  const getContactDescription = (contact: UnifiedContact) => {
    if (contact.isAI) {
      return `AI Assistant${contact.aiModel ? ` • ${contact.aiModel}` : ''}`;
    }
    
    const parts = [];
    if (contact.organization) parts.push(contact.organization);
    if (contact.email) parts.push(contact.email);
    if (contact.phone) parts.push(contact.phone);
    
    return parts.join(' • ') || undefined;
  };

  const renderContact = ({ item }: { item: UnifiedContact }) => (
    <List.Item
      title={item.displayName}
      description={getContactDescription(item)}
      onPress={() => handleContactPress(item)}
      style={styles.contactItem}
      left={(props) => (
        item.isAI ? (
          <Avatar.Icon
            {...props}
            icon="robot"
            size={50}
            style={{ 
              backgroundColor: theme.colors.tertiary,
              marginRight: 12,
            }}
          />
        ) : (
          <Avatar.Text
            {...props}
            label={getAvatarLabel(item.displayName)}
            size={50}
            style={{ 
              backgroundColor: theme.colors.primaryContainer,
              marginRight: 12,
            }}
          />
        )
      )}
      right={(props) => (
        showContextMenu ? (
          <Menu
            visible={menuVisible === item.id}
            onDismiss={() => setMenuVisible(null)}
            anchor={
              <IconButton
                {...props}
                icon="dots-vertical"
                size={20}
                onPress={() => setMenuVisible(item.id)}
              />
            }
          >
            <Menu.Item
              leadingIcon="message"
              onPress={() => handleContextMenu(item.id, 'chat')}
              title={t('contacts:startChat')}
            />
            <Menu.Item
              leadingIcon="account"
              onPress={() => handleContextMenu(item.id, 'details')}
              title={t('contacts:viewDetails')}
            />
            {!item.isAI && (
              <Menu.Item
                leadingIcon="pencil"
                onPress={() => handleContextMenu(item.id, 'edit')}
                title={t('contacts:edit')}
              />
            )}
          </Menu>
        ) : (
          <IconButton
            {...props}
            icon="chevron-right"
            size={16}
            iconColor={theme.colors.onSurfaceVariant}
          />
        )
      )}
    />
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>{t('common:loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Organizations Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            Organizations
          </Text>
        </View>
        <OrganisationList />
      </View>
      
      <Divider style={styles.sectionDivider} />
      
      {/* Contacts Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            Contacts
          </Text>
        </View>
        <FlatList
          data={filteredContacts}
          renderItem={renderContact}
          keyExtractor={(item) => `${item.id}-${item.profileIdHash}`}
          ItemSeparatorComponent={() => <Divider />}
          contentContainerStyle={styles.listContent}
          scrollEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchQuery
                  ? t('contacts:noResults')
                  : 'No contacts available'}
              </Text>
              <Text style={styles.debugText}>
                Loading: {isLoading ? 'Yes' : 'No'} | 
                Models: {leuteModel ? 'L' : '-'}{aiModel ? 'A' : '-'}{topicModel ? 'T' : '-'}
              </Text>
              {!searchQuery && (
                <Button
                  mode="contained"
                  onPress={() => router.push('/(screens)/contacts/add-contact')}
                  style={styles.addButton}
                >
                  Add Contact
                </Button>
              )}
            </View>
          }
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionDivider: {
    marginVertical: 16,
    marginHorizontal: 16,
  },
  listContent: {
    flexGrow: 1,
  },
  contactItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 64,
  },
  emptyText: {
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 24,
  },
  debugText: {
    fontSize: 12,
    opacity: 0.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  addButton: {
    marginTop: 16,
  },
});