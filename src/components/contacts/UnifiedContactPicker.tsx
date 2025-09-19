import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Surface,
  Text,
  Searchbar,
  List,
  Avatar,
  Button,
  IconButton,
  Divider,
  ActivityIndicator,
  Checkbox,
  Appbar,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { useInstance } from '@src/providers/app';
import { useModelState } from '@src/hooks/useModelState';
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
}

interface UnifiedContactPickerProps {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (contacts: UnifiedContact[]) => void;
  multiSelect?: boolean;
  excludeIds?: string[];
  title?: string;
  includeAI?: boolean;
}

export const UnifiedContactPicker: React.FC<UnifiedContactPickerProps> = ({
  visible,
  onDismiss,
  onSelect,
  multiSelect = false,
  excludeIds = [],
  title,
  includeAI = true,
}) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { models } = useInstance();
  const leuteModel = models?.leuteModel;
  const aiModel = models?.aiAssistantModel;
  
  // Track model state
  const { isReady: leuteModelReady, error: leuteModelError } = useModelState(leuteModel, 'LeuteModel');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<UnifiedContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Load all contacts (human + AI)
  const loadContacts = useCallback(async () => {
    console.log('[UnifiedContactPicker] loadContacts called, models:', { 
      hasModels: !!models,
      hasLeuteModel: !!leuteModel,
      hasAiModel: !!aiModel,
      leuteModelState: leuteModel?.state?.currentState || 'unknown',
      leuteModelReady,
      leuteModelError
    });
    
    if (!leuteModel || !leuteModelReady) {
      console.error('[UnifiedContactPicker] LeuteModel not available or not ready:', {
        hasLeuteModel: !!leuteModel,
        leuteModelReady,
        leuteModelError
      });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      console.log('[UnifiedContactPicker] Loading unified contacts...');
      const allContacts: UnifiedContact[] = [];

      // Load human contacts
      console.log('[UnifiedContactPicker] Calling leuteModel.others()...');
      const humanContacts = await leuteModel.others();
      console.log('[UnifiedContactPicker] Found human contacts:', humanContacts.length);
      
      for (const someone of humanContacts) {
        const personId = someone.personId || someone.personIdHash || someone.id;
        if (personId && !excludeIds.includes(personId.toString())) {
          try {
            // Get profile for additional info
            const profile = await someone.mainProfile();
            const profileData = profile?.data || {};
            
            allContacts.push({
              id: personId,
              displayName: someone.displayName || someone.name || 'Unknown',
              profileIdHash: someone.profileIdHash || someone.profileId,
              isAI: false,
              organization: profileData.organization,
              email: profileData.email,
            });
          } catch (error) {
            console.warn('[UnifiedContactPicker] Error processing human contact:', error);
            // Add with minimal info as fallback
            allContacts.push({
              id: personId,
              displayName: someone.displayName || someone.name || 'Unknown',
              profileIdHash: someone.profileIdHash || someone.profileId,
              isAI: false,
            });
          }
        }
      }

      // Load AI contacts if enabled
      if (includeAI && aiModel) {
        console.log('[UnifiedContactPicker] Loading AI contacts...');
        try {
          const llmManager = aiModel.getLLMManager();
          if (llmManager) {
            const knownModels = llmManager.getKnownModels();
            console.log('[UnifiedContactPicker] Found AI models:', knownModels.length);
            
            for (const model of knownModels) {
              if (model.personId && !excludeIds.includes(model.personId.toString())) {
                const displayName = model.displayName || model.name || 'AI Assistant';
                
                allContacts.push({
                  id: model.personId,
                  displayName,
                  isAI: true,
                  aiModel: model.name,
                });
              }
            }
          }
        } catch (error) {
          console.warn('[UnifiedContactPicker] Error loading AI contacts:', error);
        }
      }

      // Sort contacts: AI first, then humans, both alphabetically
      allContacts.sort((a, b) => {
        if (a.isAI && !b.isAI) return -1;
        if (!a.isAI && b.isAI) return 1;
        return a.displayName.localeCompare(b.displayName);
      });
      
      console.log('[UnifiedContactPicker] Total contacts loaded:', allContacts.length);
      console.log('[UnifiedContactPicker] AI contacts:', allContacts.filter(c => c.isAI).length);
      console.log('[UnifiedContactPicker] Human contacts:', allContacts.filter(c => !c.isAI).length);
      
      setContacts(allContacts);
      setFilteredContacts(allContacts);
    } catch (error) {
      console.error('[UnifiedContactPicker] Error loading contacts:', error);
      console.error('[UnifiedContactPicker] Error stack:', error instanceof Error ? error.stack : 'No stack');
      // Set empty arrays to show the empty state
      setContacts([]);
      setFilteredContacts([]);
    } finally {
      setIsLoading(false);
    }
  }, [leuteModel, aiModel, excludeIds, includeAI, leuteModelReady, leuteModelError]);

  // Load contacts when visible and model is ready
  useEffect(() => {
    if (visible && leuteModelReady) {
      loadContacts();
    }
  }, [visible, leuteModelReady, loadContacts]);

  // Filter contacts based on search
  useEffect(() => {
    if (searchQuery) {
      const filtered = contacts.filter(contact =>
        contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.organization?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.aiModel?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredContacts(filtered);
    } else {
      setFilteredContacts(contacts);
    }
  }, [searchQuery, contacts]);

  // Reset selection when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedContacts(new Set());
      setSearchQuery('');
    }
  }, [visible]);

  const toggleContactSelection = (contactId: string) => {
    if (multiSelect) {
      const newSelection = new Set(selectedContacts);
      if (newSelection.has(contactId)) {
        newSelection.delete(contactId);
      } else {
        newSelection.add(contactId);
      }
      setSelectedContacts(newSelection);
    } else {
      // Single select - immediately return the selected contact
      const contact = contacts.find(c => c.id === contactId);
      if (contact) {
        onSelect([contact]);
        onDismiss();
      }
    }
  };

  const handleConfirm = () => {
    const selected = contacts.filter(c => selectedContacts.has(c.id));
    onSelect(selected);
    onDismiss();
  };

  const getAvatarLabel = (name: string) => {
    const words = name.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const renderContact = ({ item }: { item: UnifiedContact }) => (
    <List.Item
      title={item.displayName}
      description={
        item.isAI 
          ? `AI Assistant${item.aiModel ? ` • ${item.aiModel}` : ''}`
          : item.organization || item.email || undefined
      }
      onPress={() => toggleContactSelection(item.id)}
      style={styles.contactItem}
      left={(props) => (
        item.isAI ? (
          <Avatar.Icon
            {...props}
            icon="robot"
            size={40}
            style={{ 
              backgroundColor: theme.colors.tertiary,
              marginRight: 8,
            }}
          />
        ) : (
          <Avatar.Text
            {...props}
            label={getAvatarLabel(item.displayName)}
            size={40}
            style={{ 
              backgroundColor: theme.colors.primaryContainer,
              marginRight: 8,
            }}
          />
        )
      )}
      right={(props) =>
        multiSelect ? (
          <Checkbox
            {...props}
            status={selectedContacts.has(item.id) ? 'checked' : 'unchecked'}
            onPress={() => toggleContactSelection(item.id)}
          />
        ) : (
          <IconButton
            {...props}
            icon="chevron-right"
            size={16}
            iconColor={theme.colors.onSurfaceVariant}
          />
        )
      }
    />
  );

  const renderSectionHeader = ({ section }: { section: { title: string; data: UnifiedContact[] } }) => (
    <View style={styles.sectionHeader}>
      <Text variant="titleSmall" style={styles.sectionTitle}>
        {section.title}
      </Text>
    </View>
  );

  // Group contacts by type for better organization
  const groupedContacts = useMemo(() => {
    const aiContacts = filteredContacts.filter(c => c.isAI);
    const humanContacts = filteredContacts.filter(c => !c.isAI);
    
    const sections = [];
    
    if (aiContacts.length > 0) {
      sections.push({
        title: 'AI Assistants',
        data: aiContacts,
        keyExtractor: (item: UnifiedContact) => `ai-${item.id}`,
      });
    }
    
    if (humanContacts.length > 0) {
      sections.push({
        title: 'Contacts',
        data: humanContacts,
        keyExtractor: (item: UnifiedContact) => `human-${item.id}`,
      });
    }
    
    return sections;
  }, [filteredContacts]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      onRequestClose={onDismiss}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header>
          <Appbar.Content title={title || t('chat:selectContact')} />
          <Appbar.Action icon="close" onPress={onDismiss} />
        </Appbar.Header>

        <Surface style={[styles.content, { backgroundColor: theme.colors.background }]} elevation={0}>
          <Searchbar
            placeholder={t('common:search')}
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchBar}
            icon="magnify"
            clearIcon="close"
          />

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingText}>{t('common:loading')}</Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              renderItem={renderContact}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <Divider />}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    {!leuteModelReady
                      ? 'Initializing contacts...'
                      : searchQuery
                      ? t('contacts:noResults')
                      : t('contacts:noContacts')}
                  </Text>
                  {leuteModelError && (
                    <Text style={[styles.emptyText, { marginTop: 8, fontSize: 12 }]}>
                      {leuteModelError}
                    </Text>
                  )}
                </View>
              }
            />
          )}

          {multiSelect && selectedContacts.size > 0 && (
            <Surface style={[styles.footer, { backgroundColor: theme.colors.surface }]} elevation={2}>
              <Text style={styles.selectionCount}>
                {t('chat:selectedParticipants')}: {selectedContacts.size}
              </Text>
              <Button
                mode="contained"
                onPress={handleConfirm}
                style={styles.confirmButton}
              >
                {t('common:confirm')}
              </Button>
            </Surface>
          )}
        </Surface>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  searchBar: {
    margin: 16,
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 100,
  },
  contactItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  sectionTitle: {
    fontWeight: '600',
    opacity: 0.7,
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
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionCount: {
    flex: 1,
    marginRight: 16,
  },
  confirmButton: {
    minWidth: 120,
  },
});